import localtunnel from 'localtunnel';
import { writeFileSync } from 'fs';

async function run() {
    process.stdout.write('Starting tunnels...\n');

    const backendTunnel = await localtunnel({ port: 8080 });
    process.stdout.write('BACKEND_URL=' + backendTunnel.url + '\n');

    const frontendTunnel = await localtunnel({ port: 3000 });
    process.stdout.write('FRONTEND_URL=' + frontendTunnel.url + '\n');

    writeFileSync('./tunnel_urls.json', JSON.stringify({
        backend: backendTunnel.url,
        frontend: frontendTunnel.url
    }, null, 2));
    process.stdout.write('Saved to tunnel_urls.json\n');

    backendTunnel.on('error', (err) => process.stdout.write('Backend error: ' + err + '\n'));
    frontendTunnel.on('error', (err) => process.stdout.write('Frontend error: ' + err + '\n'));
    backendTunnel.on('close', () => process.stdout.write('Backend tunnel closed\n'));
    frontendTunnel.on('close', () => process.stdout.write('Frontend tunnel closed\n'));
}

run().catch((err) => {
    process.stdout.write('ERROR: ' + err.message + '\n');
    process.exit(1);
});
