const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';

function authMiddleware(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1]; // Bearer <token>
    if (!token) return res.status(401).json({ error: 'No token provided' });

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
}

module.exports = authMiddleware;