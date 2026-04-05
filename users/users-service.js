const express = require('express');
const mongoose = require('mongoose');

const setupSwagger      = require('./config/swagger');
const metricsMiddleware = require('./config/metrics');
const corsMiddleware    = require('./middleware/cors');
const MongoUserRepository = require('./repository/MongoUserRepository');

const authRoutes  = require('./routes/authRoutes');
const userRoutes  = require('./routes/userRoutes');
const gameRoutes  = require('./routes/gameRoutes');
const playRoute  = require('./routes/playRoute');
const leaderBoardRoute = require('./routes/leaderBoardRoute');

const app  = express();
const port = 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/app_database';

const repository = new MongoUserRepository();

if (process.env.NODE_ENV !== 'test') {
    mongoose.connect(mongoUri)
        .then(() => console.log('Connected to MongoDB'))
        .catch(err => console.error('MongoDB connection error:', err));
}

// Config & Middleware
app.use(metricsMiddleware);
setupSwagger(app);
app.use(corsMiddleware);
app.use(express.json());

// Routes
app.use('/', authRoutes(repository));
app.use("/", playRoute());
app.use("/", leaderBoardRoute(repository));
app.use('/users', userRoutes(repository));
app.use('/games', gameRoutes(repository));  // also exposes POST /games/play (bot API)

// Start
if (require.main === module) {
    app.listen(port, () => {
        console.log(`User Service listening at http://localhost:${port}`);
    });
}

module.exports = app;