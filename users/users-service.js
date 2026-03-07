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

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/app_database';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';

if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(mongoUri)
      .then(() => console.log('Connected to MongoDB'))
      .catch(err => console.error('MongoDB connection error:', err));
}

// Models

const userSchema = new mongoose.Schema({
  username:      { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  created_at:    { type: Date, default: Date.now },
  statistics: {
    games_played: { type: Number, default: 0 },
    wins:         { type: Number, default: 0 },
    losses:       { type: Number, default: 0 }
  }
});
const User = mongoose.model('User', userSchema);

const moveSchema = new mongoose.Schema({
  move_number: { type: Number, required: true },
  player:      { type: String, required: true },          // 'HUMAN' or 'BOT'
  coordinates: {
    x: { type: Number, required: true },                  // barycentric coordinates
    y: { type: Number, required: true },
    z: { type: Number, required: true }
  },
  yen_state:   { type: String },                          // board state after this move
  created_at:  { type: Date, default: Date.now }
}, { _id: false });                                       // subdocument, no separate _id needed

const gameSchema = new mongoose.Schema({
  player_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  board_size:       { type: Number, required: true },
  strategy:         { type: String, default: 'random' },
  difficulty_level: { type: String, default: 'medium' },  // 'easy', 'medium', 'hard'
  status:           { type: String, enum: ['IN_PROGRESS', 'FINISHED'], default: 'IN_PROGRESS' },
  result:           { type: String, enum: ['WIN', 'LOSS', null], default: null },
  duration_seconds: { type: Number, default: 0 },
  yen_final_state:  { type: String },
  created_at:       { type: Date, default: Date.now },
  moves:            [moveSchema]                           // array of subdocuments, no joins needed
});
const Game = mongoose.model('Game', gameSchema);

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

  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password_hash });
    await newUser.save();

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

  try {
    const user = await User.findOne({ username });
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
    const user = await User.findById(req.params.id).select('-password_hash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user statistics
app.get('/users/:id/stats', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('statistics');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.statistics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user game history (without moves array for a lighter response)
app.get('/users/:id/history', authMiddleware, async (req, res) => {
  try {
    const games = await Game.find({ player_id: req.params.id })
        .select('-moves')
        .sort({ created_at: -1 });
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Game Routes

// Create a new game
app.post('/games', authMiddleware, async (req, res) => {
  const { board_size, strategy, difficulty_level } = req.body || {};

  if (!board_size) return res.status(400).json({ error: 'board_size is required' });

  try {
    const game = new Game({
      player_id: req.user.userId,
      board_size,
      strategy: strategy || 'random',
      difficulty_level: difficulty_level || 'medium'
    });
    await game.save();
    res.status(201).json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get game state (including all moves for replay)
app.get('/games/:id', authMiddleware, async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
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
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

    const move_number = game.moves.length + 1;
    game.moves.push({ move_number, player, coordinates, yen_state });
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
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

    game.status = 'FINISHED';
    game.result = result;
    game.yen_final_state = yen_final_state;
    game.duration_seconds = duration_seconds || 0;
    await game.save();

    // Update user statistics
    const statsUpdate = { $inc: { 'statistics.games_played': 1 } };
    if (result === 'WIN')  statsUpdate.$inc['statistics.wins'] = 1;
    if (result === 'LOSS') statsUpdate.$inc['statistics.losses'] = 1;
    await User.findByIdAndUpdate(game.player_id, statsUpdate);

    res.json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all moves of a game ordered by move_number (for replay)
app.get('/games/:id/moves', authMiddleware, async (req, res) => {
  try {
    const game = await Game.findById(req.params.id).select('moves');
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