const express = require('express');
const app = express();
const port = 3000;
const swaggerUi = require('swagger-ui-express');
const fs = require('node:fs');
const YAML = require('js-yaml');
const promBundle = require('express-prom-bundle');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const MongoUserRepository = require('./repository/MongoUserRepository');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/app_database';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';

const repository = new MongoUserRepository();

if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(mongoUri)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
}

// Middleware

const metricsMiddleware = promBundle({ includeMethod: true });
app.use(metricsMiddleware);

try {
  const swaggerDocument = YAML.load(fs.readFileSync('./openapi.yaml', 'utf8'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (e) {
  console.log('Swagger not loaded:', e.message);
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// JWT auth middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Auth Routes

// Register
app.post('/createuser', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    const existing = await repository.findByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const newUser = await repository.create({ username, password_hash });

    res.status(201).json({ message: `Welcome ${username}!`, userId: newUser._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    const user = await repository.findByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User Routes

// Get user profile + statistics
app.get('/users/:id', authMiddleware, async (req, res) => {
  try {
    const user = await repository.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const response = user.toObject();
    response.statistics.games_played = user.statistics.total_games;
    response.statistics.wins = user.statistics.total_wins;
    response.statistics.losses = user.statistics.total_losses;
    delete response.password_hash;

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user statistics
app.get('/users/:id/stats', authMiddleware, async (req, res) => {
  try {
    const user = await repository.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const stats = {
      games_played: user.statistics.total_games,
      wins: user.statistics.total_wins,
      losses: user.statistics.total_losses
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user game history (without moves array for a lighter response)
app.get('/users/:id/history', authMiddleware, async (req, res) => {
  try {
    const games = await repository.findGamesByPlayer(req.params.id);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Game Routes

// Create a new game
app.post('/games', authMiddleware, async (req, res) => {
  const { board_size, strategy, difficulty_level, game_type } = req.body || {};

  if (!board_size) return res.status(400).json({ error: 'board_size is required' });

  try {
    const game = await repository.createGame({
      player_id: req.user.userId,
      game_type: game_type || 'BOT',
      board_size,
      strategy: strategy || 'random',
      difficulty_level: difficulty_level || 'medium'
    });
    res.status(201).json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get game state (including all moves for replay)
app.get('/games/:id', authMiddleware, async (req, res) => {
  try {
    const game = await repository.findGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit a move — saved as subdocument inside the game
app.post('/games/:id/move', authMiddleware, async (req, res) => {
  const { player, coordinates, yen_state } = req.body || {};

  if (!player || !coordinates || coordinates.x === undefined || coordinates.y === undefined || coordinates.z === undefined) {
    return res.status(400).json({ error: 'player and coordinates (x, y, z) are required' });
  }

  try {
    const game = await repository.findGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

    game.moves.push({ move_number: game.moves.length + 1, player, coordinates, yen_state });
    await game.save();

    res.status(201).json(game.moves[game.moves.length - 1]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Finish a game — update result and update user statistics atomically
app.put('/games/:id/finish', authMiddleware, async (req, res) => {
  const { result, yen_final_state, duration_seconds } = req.body || {};

  if (!result) return res.status(400).json({ error: 'result is required (WIN or LOSS)' });

  try {
    const game = await repository.findGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

    const updatedGame = await repository.updateGame(req.params.id, {
      status: 'FINISHED',
      result,
      yen_final_state,
      duration_seconds: duration_seconds || 0
    });

    const updatedUser = await repository.updateStats(game.player_id, {
      result,
      type: game.game_type,
      difficulty: game.difficulty_level
    });

    const response = updatedGame.toObject();
    response.games_played = updatedUser.statistics.total_games;
    response.wins = updatedUser.statistics.total_wins;
    response.losses = updatedUser.statistics.total_losses;

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all moves of a game ordered by move_number (for replay)
app.get('/games/:id/moves', authMiddleware, async (req, res) => {
  try {
    const game = await repository.findGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const sortedMoves = game.moves.sort((a, b) => a.move_number - b.move_number);
    res.json(sortedMoves);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start

if (require.main === module) {
  app.listen(port, () => {
    console.log(`User Service listening at http://localhost:${port}`);
  });
}

module.exports = app;