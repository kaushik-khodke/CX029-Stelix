const express = require('express');
const WhatsAppGatewayManager = require('./gateway-manager');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BACKEND_URL = process.env.BACKEND_URL || 'https://cx029-stelix.onrender.com';

const gateway = new WhatsAppGatewayManager({ backendUrl: BACKEND_URL });

// API Endpoints
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        whatsappReady: gateway.isReady,
        state: gateway.state,
        backendUrl: gateway.backendUrl,
        retryCount: gateway.retryCount
    });
});

app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Missing phone or message parameter' });
    }

    try {
        const result = await gateway.sendMessage(phone, message);
        res.json(result);
    } catch (error) {
        const statusCode = gateway.isReady ? 500 : 503;
        res.status(statusCode).json({ error: error.message });
    }
});

// Start Express Server
const server = app.listen(PORT, () => {
    console.log(`\n🚀 WhatsApp Gateway API listening on port ${PORT}`);
    console.log(`🔗 Connected to Backend at: ${BACKEND_URL}\n`);
});

// Handle graceful termination signals
async function handleExit(signal) {
    console.log(`\nReceived ${signal}. Shutting down WhatsApp Gateway...`);
    await gateway.shutdown();
    server.close(() => {
        console.log('HTTP Server closed. Process exiting.');
        process.exit(0);
    });
}

process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));

process.on('unhandledRejection', (reason) => {
    console.warn(`[Unhandled Rejection] ${reason}`);
});

// Boot Gateway Client sequentially
(async () => {
    if (process.argv.includes('--clean')) {
        await gateway.cleanSessionStorage(true);
    }
    await gateway.initialize();
})();
