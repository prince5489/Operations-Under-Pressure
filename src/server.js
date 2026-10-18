const app = require('./app');

const defaultPort = Number(process.env.PORT) || 3000;

const server = app.listen(defaultPort, () => {
  console.log(`Operations Under Pressure listening on port ${defaultPort}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const fallbackPort = defaultPort === 3000 ? 3001 : defaultPort + 1;
    console.warn(`Port ${defaultPort} is in use. Falling back to port ${fallbackPort}...`);
    app.listen(fallbackPort, () => {
      console.log(`Operations Under Pressure listening on port ${fallbackPort}`);
    });
  } else {
    console.error(err);
  }
});
