const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';

module.exports = function authRoutes(repository) {
    const router = express.Router();

    // Register
    router.post('/createuser', async function createUser(req, res) {
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
    router.post('/login', async function login(req, res) {
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

    // Check if username exists — public, no JWT needed
    router.get('/exists/:username', async function usernameExists(req, res) {
        try {
            const exists = await repository.usernameExists(String(req.params.username));
            res.json({ exists });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};