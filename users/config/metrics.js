const promBundle = require('express-prom-bundle');

const metricsMiddleware = promBundle({ includeMethod: true });

module.exports = metricsMiddleware;