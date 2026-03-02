const express = require('express');
const app = express();
const port = 3000;
const swaggerUi = require('swagger-ui-express');
const fs = require('node:fs');
const YAML = require('js-yaml');
const promBundle = require('express-prom-bundle');
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/app_database';

if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(mongoUri)
}

const userSchema = new mongoose.Schema({
  username: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const metricsMiddleware = promBundle({ includeMethod: true });
app.use(metricsMiddleware);

try {
  const swaggerDocument = YAML.load(fs.readFileSync('./openapi.yaml', 'utf8'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (e) {
  console.log(e);
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

app.post('/createuser', async (req, res) => {
  const username = req.body && req.body.username;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const newUser = new User({ username });
    await newUser.save();

    const message = `Hello ${username}! welcome to the course!`;
    res.json({ message, user: newUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`User Service listening at http://localhost:${port}`);
  });
}

module.exports = app;
