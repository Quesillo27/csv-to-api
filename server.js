const { app, config, logger } = require('./src/app');

if (require.main === module) {
  app.listen(config.port, () => {
    logger.info('server_started', {
      port: config.port,
      health: `http://localhost:${config.port}/health`
    });
  });
}

module.exports = app;
