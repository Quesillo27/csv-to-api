function log(level, event, context = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

module.exports = {
  info(event, context) {
    log('info', event, context);
  },
  warn(event, context) {
    log('warn', event, context);
  },
  error(event, context) {
    log('error', event, context);
  }
};
