const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const INSECURE_DEFAULTS = ['secret', 'jwt_secret', 'changeme', 'password', '12345678'];

function validateJwtSecret(secret, env = process.env.NODE_ENV) {
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    throw new Error('JWT_SECRET is required.');
  }
  const value = secret.trim();
  if (env === 'production' && (value.length < 32 || INSECURE_DEFAULTS.includes(value))) {
    throw new Error('JWT_SECRET must be a unique value of at least 32 characters in production.');
  }
  return value;
}

function getJwtSecret() { return validateJwtSecret(process.env.JWT_SECRET); }

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.cookies && req.cookies.token);
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required.' });
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const [rows] = await pool.query(
      'SELECT employee_id, employee_code, email, role, status FROM employees WHERE employee_id = ?',
      [decoded.employee_id]
    );
    if (!rows.length || rows[0].status !== 'ACTIVE') {
      return res.status(401).json({ success: false, error: 'This account is inactive or no longer exists.' });
    }
    req.user = rows[0];
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Your session is invalid or has expired.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthenticated.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

function enforceSelfOrAdmin(paramKey = 'employeeId') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthenticated.' });
    const rawId = req.params[paramKey] || req.query[paramKey] || req.body[paramKey];
    const targetId = Number.parseInt(rawId, 10);
    if (req.user.role === 'HR_ADMIN' || req.user.employee_id === targetId) return next();
    return res.status(403).json({ success: false, error: 'You can access only your own records.' });
  };
}

module.exports = { authenticateToken, requireRole, enforceSelfOrAdmin, validateJwtSecret, getJwtSecret, INSECURE_DEFAULTS };
