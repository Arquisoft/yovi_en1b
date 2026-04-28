const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';

/**
 * Registers authentication-related routes on an Express router.
 *
 * Exposed endpoints:
 *   POST   /createuser        — Register a new user account (public).
 *   POST   /login             — Authenticate and receive a JWT token (public).
 *   DELETE /deleteuser        — Delete the authenticated user's account (requires auth).
 *   GET    /exists/:username  — Check whether a username is already taken (public).
 *
 * @param {object} repository - Data access object (MongoUserRepository or compatible).
 * @returns {express.Router}
 */
module.exports = function authRoutes(repository) {
    const router = express.Router();

    /**
     * POST /createuser
     * Registers a new user account.
     * Hashes the password with bcrypt (10 salt rounds) before persisting.
     *
     * @body {string}  username - Desired username (required).
     * @body {string}  password - Plain-text password (required, stored as bcrypt hash).
     * @body {boolean} [is_test] - If true, marks the account as a test user for cleanup purposes.
     *
     * @returns {201} { message, userId } on success.
     * @returns {400} If username or password are missing or not strings.
     * @returns {409} If the username is already taken.
     */
    router.post('/createuser', async function createUser(req, res) {
        const { username, password, is_test } = req.body || {};

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
            const newUser = await repository.create({ username, password_hash, is_test: !!is_test });

            res.status(201).json({ message: `Welcome ${username}!`, userId: newUser._id });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /login
     * Authenticates a user and returns a signed JWT valid for 24 hours.
     * The token payload contains { userId, username }.
     *
     * @body {string} username - Registered username (required).
     * @body {string} password - Plain-text password to verify against the stored hash (required).
     *
     * @returns {200} { token, username, userId } on success.
     * @returns {400} If username or password are missing or not strings.
     * @returns {401} If the username does not exist or the password does not match.
     */
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

            const token = jwt.sign(
                { userId: user._id, username: user.username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            res.json({ token, username: user.username, userId: user._id });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * DELETE /deleteuser
     * Deletes the account of the currently authenticated user.
     * Intended for use by automated tests to clean up created accounts after a test run.
     * Requires a valid JWT in the Authorization header.
     *
     * @returns {200} { message } on success.
     * @returns {404} If the user no longer exists.
     */
    router.delete('/deleteuser', authMiddleware, async function deleteUser(req, res) {
        try {
            const deleted = await repository.deleteById(req.user.userId);
            if (!deleted) return res.status(404).json({ error: 'User not found' });
            res.json({ message: 'User deleted successfully' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /exists/:username
     * Checks whether a given username is already registered.
     * Public — no authentication required. Used by the frontend to provide
     * real-time availability feedback on the registration form.
     *
     * @param {string} username - The username to check.
     *
     * @returns {200} { exists: boolean }
     */
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