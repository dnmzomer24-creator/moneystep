const localtunnel = require('localtunnel');

const port = 3000;

async function startTunnel() {
  try {
    console.log(`Starting localtunnel for port ${port}...`);
    const tunnel = await localtunnel({ port: port });

    console.log('your url is:', tunnel.url);

    tunnel.on('close', () => {
      console.log('Tunnel closed. Reconnecting in 5 seconds...');
      setTimeout(startTunnel, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });

  } catch (err) {
    console.error('Error starting localtunnel:', err);
    console.log('Retrying in 10 seconds...');
    setTimeout(startTunnel, 10000);
  }
}

startTunnel();
