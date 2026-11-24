const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { getJwtSecret } = require('../middleware/auth');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password are required.' });
  try {
    // Fail with a clear setup message before querying or signing a token.
    try { getJwtSecret(); } catch (secretError) {
      console.error('Login configuration error:', secretError.message);
      return res.status(500).json({ success: false, error: 'JWT_SECRET is missing. Create the project .env file and set JWT_SECRET, then restart the server.' });
    }

    const [rows] = await pool.query(
      `SELECT e.employee_id, e.employee_code, e.first_name, e.last_name, e.email, e.role,
              e.status, e.password_hash, d.department_name, e.designation
       FROM employees e JOIN departments d ON e.department_id = d.department_id
       WHERE e.email = ?`, [email.trim().toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    const employee = rows[0];
    if (employee.status !== 'ACTIVE') return res.status(403).json({ success: false, error: 'This account is inactive. Contact HR.' });
    if (!(await bcrypt.compare(password, employee.password_hash))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }
    const token = jwt.sign({ employee_id: employee.employee_id, employee_code: employee.employee_code, role: employee.role, email: employee.email }, getJwtSecret(), { expiresIn: '8h' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
    return res.json({ success: true, token, user: {
      employee_id: employee.employee_id, employee_code: employee.employee_code,
      first_name: employee.first_name, last_name: employee.last_name, email: employee.email,
      role: employee.role, department: employee.department_name, designation: employee.designation
    }});
  } catch (error) {
    console.error('Login error:', error.code || 'UNKNOWN', error.message);

    // Return actionable hints for local development without exposing internals in production.
    if (process.env.NODE_ENV !== 'production') {
      const databaseHints = {
        ECONNREFUSED: 'The database server is not running or DB_HOST / DB_PORT is incorrect. Start MariaDB/MySQL and check .env.',
        ETIMEDOUT: 'The database connection timed out. Check that MariaDB/MySQL is running and reachable.',
        ER_ACCESS_DENIED_ERROR: 'The database rejected DB_USER / DB_PASSWORD. Correct those values in .env.',
        ER_BAD_DB_ERROR: 'The meridian_hr database does not exist. Run npm run setup from the project folder.',
        ER_NO_SUCH_TABLE: 'The database tables are missing. Run npm run setup from the project folder.'
      };
      const hint = databaseHints[error.code];
      if (hint) return res.status(503).json({ success: false, error: hint });
    }

    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production'
        ? `Authentication failed during server setup: ${error.message}`
        : 'Unable to authenticate at this time.'
    });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Signed out successfully.' });
});

router.get('/me', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.cookies && req.cookies.token);
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const [rows] = await pool.query(
      `SELECT e.employee_id, e.employee_code, e.first_name, e.last_name, e.email, e.role,
              e.status, d.department_name, e.designation
       FROM employees e JOIN departments d ON e.department_id = d.department_id
       WHERE e.employee_id = ?`, [decoded.employee_id]
    );
    if (!rows.length || rows[0].status !== 'ACTIVE') return res.status(401).json({ success: false, error: 'User is no longer active.' });
    return res.json({ success: true, user: rows[0] });
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid session token.' });
  }
});

module.exports = router;
