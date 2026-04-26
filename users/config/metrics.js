const promBundle = require('express-prom-bundle');

const metricsMiddleware = promBundle({
    includeMethod: true,
    includePath: true,
    // Ignore the root and health checks to avoid noise from Azure pings
    excludeRoutes: [/^\/$/, "/health"],
    // Group IDs so Grafana shows /games/:id instead of a different line for every game
    normalizePath: [
        ["^/games/.*", "/games/:id"]
    ]
});

module.exports = metricsMiddleware;