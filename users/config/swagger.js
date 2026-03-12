const swaggerUi = require('swagger-ui-express');
const fs = require('node:fs');
const YAML = require('js-yaml');

const setupSwagger = (app) => {
    try {
        const swaggerDocument = YAML.load(fs.readFileSync('./openapi.yaml', 'utf8'));
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } catch (e) {
        console.log('Swagger not loaded:', e.message);
    }
};

module.exports = setupSwagger;