const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class WhatsAppGatewayManager {
    constructor(options = {}) {
        this.backendUrl = options.backendUrl || process.env.BACKEND_URL || 'http://localhost:8000';
        this.client = null;
        this.qrCode = null;
        this.state = 'UNINITIALIZED'; // UNINITIALIZED, LAUNCHING, AWAITING_QR, CONNECTED, DISCONNECTED, ERROR
        this.isReady = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.isInitializing = false;
        this.authPath = path.join(__dirname, '.wwebjs_auth');
        this.cachePath = path.join(__dirname, '.wwebjs_cache');
    }

    log(stage, message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [WhatsApp Gateway] [${stage}]`;
        if (level === 'error') {
            console.error(`${prefix} ❌ ${message}`);
        } else if (level === 'warn') {
            console.warn(`${prefix} ⚠️ ${message}`);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }

    async cleanSessionStorage(force = false) {
        // First destroy client if active to release Chrome locks
        await this.safeDestroyClient();
        await delay(500);

        // Kill orphaned headless chrome processes on Windows that hold file locks
        if (process.platform === 'win32') {
            try {
                execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'ignore' });
            } catch (e) {}
            await delay(500);
        }

        try {
            if (fs.existsSync(this.cachePath)) {
                try {
                    fs.rmSync(this.cachePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
                    this.log('SESSION_CLEAN', 'Purged .wwebjs_cache directory');
                } catch (ce) {}
            }
            if (force && fs.existsSync(this.authPath)) {
                try {
                    fs.rmSync(this.authPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
                    this.log('SESSION_CLEAN', 'Purged .wwebjs_auth directory');
                } catch (ae) {
                    this.log('SESSION_CLEAN', `Lock file note: ${ae.message}. Continuing startup.`, 'warn');
                }
            }
        } catch (err) {
            this.log('SESSION_CLEAN', `Cleanup note: ${err.message}`, 'warn');
        }
    }

    async safeDestroyClient() {
        if (this.client) {
            try {
                this.log('SHUTDOWN', 'Closing Chromium browser instance and destroying client...');
                await this.client.destroy();
            } catch (err) {
                this.log('SHUTDOWN', `Client destroy warning: ${err.message}`, 'warn');
            } finally {
                this.client = null;
            }
        }
    }

    createClientInstance() {
        this.log('STAGE 1/6', 'Configuring Puppeteer launch parameters and single-process flags...');
        
        const client = new Client({
            authStrategy: new LocalAuth(),
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014141666-alpha.html',
            },
            puppeteer: {
                headless: true,
                bypassCSP: true,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--allow-running-insecure-content',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-ipc-flooding-protection'
                ]
            }
        });

        client.on('qr', (qr) => {
            this.state = 'AWAITING_QR';
            this.qrCode = qr;
            this.log('STAGE 4/6', '📱 WHATSAPP QR RECEIVED! Please scan with your mobile app:');
            console.log('\n==================================================');
            qrcode.generate(qr, { small: true });
            console.log('==================================================\n');
        });

        client.on('authenticated', () => {
            this.log('STAGE 3/6', '🔐 WhatsApp Authentication successful!');
        });

        client.on('ready', () => {
            this.state = 'CONNECTED';
            this.isReady = true;
            this.retryCount = 0;
            const connectedNum = client.info && client.info.wid ? client.info.wid.user : 'Unknown';
            this.log('STAGE 5/6', `✅ WhatsApp Client connected as: +${connectedNum}`);
        });

        client.on('auth_failure', async (msg) => {
            this.state = 'ERROR';
            this.isReady = false;
            this.log('STAGE_FAIL', `Auth Failure: ${msg}`, 'error');
            await this.cleanSessionStorage(true);
            this.scheduleReinitialization('Auth failure detected');
        });

        client.on('disconnected', async (reason) => {
            this.state = 'DISCONNECTED';
            this.isReady = false;
            this.log('STAGE_FAIL', `Client disconnected: ${reason}`, 'warn');
            this.scheduleReinitialization('Client disconnected');
        });

        client.on('message', async (msg) => {
            this.handleIncomingMessage(msg);
        });

        return client;
    }

    async handleIncomingMessage(msg) {
        if (!msg || !msg.body) return;
        if (msg.from.includes('@g.us') || msg.from === 'status@broadcast') return;

        const text = msg.body.trim();
        if (!text) return;

        const fromPhone = msg.from.split('@')[0];

        try {
            this.log('MESSAGE_IN', `Verifying doctor phone number: ${fromPhone}`);
            const verifyRes = await axios.get(`${this.backendUrl}/doctor/verify-phone`, {
                params: { phone: fromPhone },
                timeout: 10000
            });

            if (!verifyRes.data || !verifyRes.data.authorized) {
                this.log('SECURITY', `🛑 Ignored message from unauthorized phone number: ${fromPhone}`, 'warn');
                return;
            }

            this.log('MESSAGE_IN', `📩 Verified doctor message from ${fromPhone}: "${text}"`);

            const aiRes = await axios.post(`${this.backendUrl}/whatsapp-webhook`, {
                phone: fromPhone,
                message: text
            }, { timeout: 15000 });

            if (aiRes.data && aiRes.data.response) {
                this.log('MESSAGE_OUT', `Replying to ${fromPhone} with AI Orchestrator response`);
                await msg.reply(aiRes.data.response);
            }

        } catch (error) {
            this.log('MESSAGE_ERROR', `Error processing incoming message: ${error.message}`, 'error');
            if (text.length < 100) {
                try {
                    await msg.reply('⚠️ System error occurred while processing your message. Please try again.');
                } catch (e) {}
            }
        }
    }

    async initialize() {
        if (this.isInitializing) {
            this.log('INIT_GUARD', 'Initialization already in progress. Ignoring duplicate call.', 'warn');
            return;
        }

        this.isInitializing = true;
        this.state = 'LAUNCHING';
        this.log('STAGE 2/6', `Starting WhatsApp initialization (Attempt ${this.retryCount + 1}/${this.maxRetries + 1})...`);

        try {
            await this.safeDestroyClient();
            this.client = this.createClientInstance();
            await this.client.initialize();
            this.log('STAGE 6/6', 'Client initialize call completed successfully.');
        } catch (err) {
            this.state = 'ERROR';
            this.isReady = false;
            this.log('STAGE_FAIL', `Initialization error: ${err.message}`, 'error');
            
            const isContextError = err.message.includes('Execution context was destroyed') || 
                                   err.message.includes('navigation') ||
                                   err.message.includes('Target closed') ||
                                   err.message.includes('EBUSY');

            if (isContextError) {
                this.log('RECOVERY', 'Navigation drop, lock or context destruction detected. Purging session cache with EBUSY retry policy...', 'warn');
                await this.cleanSessionStorage(true);
            }

            await this.scheduleReinitialization(err.message);
        } finally {
            this.isInitializing = false;
        }
    }

    async scheduleReinitialization(reason) {
        if (this.retryCount >= this.maxRetries) {
            this.log('RETRY_MAX', `Max retry count (${this.maxRetries}) reached. Cleaning session and resetting counter...`, 'warn');
            await this.cleanSessionStorage(true);
            this.retryCount = 0;
        }

        this.retryCount++;
        const backoffMs = Math.min(2000 * Math.pow(1.5, this.retryCount), 30000);
        this.log('RETRY', `Scheduling automatic recovery in ${Math.round(backoffMs / 1000)}s (Reason: ${reason})...`);

        setTimeout(async () => {
            await this.initialize();
        }, backoffMs);
    }

    async sendMessage(phone, message) {
        if (!this.client || !this.isReady) {
            throw new Error(`WhatsApp Gateway is not connected yet (Current State: ${this.state})`);
        }

        const cleanDigits = phone.replace(/[^0-9]/g, '');
        let formatted = cleanDigits;

        if (cleanDigits.length === 10) {
            formatted = `91${cleanDigits}`;
        }

        let targetChatId = `${formatted}@c.us`;

        // Resolve registered number ID via WhatsApp API
        try {
            const numberDetails = await this.client.getNumberId(formatted);
            if (numberDetails && numberDetails._serialized) {
                targetChatId = numberDetails._serialized;
                this.log('MESSAGE_OUT', `Resolved registered WhatsApp JID: ${targetChatId}`);
            } else {
                this.log('MESSAGE_OUT', `⚠️ getNumberId returned null for ${formatted}. Using fallback ${targetChatId}`, 'warn');
            }
        } catch (err) {
            this.log('MESSAGE_OUT', `Number lookup notice: ${err.message}`, 'warn');
        }

        this.log('MESSAGE_OUT', `Dispatching WhatsApp message to ${phone} (JID: ${targetChatId})...`);
        const sentMsg = await this.client.sendMessage(targetChatId, message);
        
        const msgId = sentMsg && sentMsg.id ? sentMsg.id._serialized : 'SENT';
        this.log('MESSAGE_OUT', `✅ Message dispatched to WhatsApp servers! ID: ${msgId}`);

        return { success: true, phone, chatId: targetChatId, messageId: msgId };
    }

    async shutdown() {
        this.log('SHUTDOWN', 'Performing graceful gateway shutdown...');
        await this.safeDestroyClient();
        this.state = 'UNINITIALIZED';
        this.isReady = false;
    }
}

module.exports = WhatsAppGatewayManager;
