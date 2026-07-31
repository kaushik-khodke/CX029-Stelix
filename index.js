const path = require('path');

// Change working directory to whatsapp-gateway so LocalAuth and node_modules load properly
const gatewayDir = path.join(__dirname, 'whatsapp-gateway');
process.chdir(gatewayDir);

console.log(' Starting WhatsApp Gateway from:', gatewayDir);

// Launch the WhatsApp Gateway
require(path.join(gatewayDir, 'index.js'));
