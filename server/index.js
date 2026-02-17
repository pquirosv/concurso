const app = require('./app');

// Log startup listen errors and rethrow so the process exits immediately.
const handleServerError = (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${app.get('port')} is already in use`);
    throw err;
  }

  console.error('Server failed to start', err);
  throw err;
};

// Starting the server
const server = app.listen(app.get('port'), () => {
  console.log('Server in ' + app.get('port') + '...');
});

server.on('error', handleServerError);
