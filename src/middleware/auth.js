const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'maude-murder-mystery-secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Access denied. Invalid token.' });
  }
};

module.exports = auth;