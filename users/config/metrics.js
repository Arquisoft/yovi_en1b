const promBundle = require('express-prom-bundle');

const metricsMiddleware = promBundle({
    includeMethod: true,
    includePath: true,
    includeStatusCode: true,
    // Ignore noise from Azure pings and metrics polling
    excludeRoutes: [
        /^\/$/, 
        "/health", 
        "/metrics", 
        "/favicon.ico"
    ],
    // Group IDs to avoid path explosion in Grafana
    normalizePath: [
        ["^/games/[^/]+/move$", "/games/:id/move"],
        ["^/games/[^/]+/play$", "/games/:id/play"],
        ["^/games/[^/]+$", "/games/:id"],
        ["^/users/[^/]+$", "/users/:id"],
        ["^/users/[^/]+/history$", "/users/:id/history"],
        ["^/exists/.*$", "/exists/:username"]
    ]
});

module.exports = metricsMiddleware;