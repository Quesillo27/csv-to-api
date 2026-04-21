function createRequestMetrics() {
  const metrics = {
    startedAt: Date.now(),
    requests: 0,
    errors: 0,
    totalLatencyMs: 0
  };

  function middleware(req, res, next) {
    metrics.requests += 1;
    const started = Date.now();

    res.on('finish', () => {
      metrics.totalLatencyMs += Date.now() - started;
      if (res.statusCode >= 400) {
        metrics.errors += 1;
      }
    });

    next();
  }

  function snapshot() {
    return {
      uptimeSeconds: Number(((Date.now() - metrics.startedAt) / 1000).toFixed(3)),
      requests: metrics.requests,
      errors: metrics.errors,
      averageLatencyMs: metrics.requests === 0
        ? 0
        : Number((metrics.totalLatencyMs / metrics.requests).toFixed(2))
    };
  }

  return { middleware, snapshot };
}

module.exports = createRequestMetrics;
