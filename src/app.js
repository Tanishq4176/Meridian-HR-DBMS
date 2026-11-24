const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const pool = require('./config/db');

const app = express();
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(value => value.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS policy: origin not allowed.'));
  },
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/salary', require('./routes/salaryRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/audit-logs', require('./routes/auditRoutes'));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1 AS database_check');
    return res.json({
      status: 'ONLINE', system: 'Meridian HR', version: '1.0.1',
      database: 'ONLINE', timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check database error:', error.code || 'UNKNOWN', error.message);
    return res.status(503).json({
      status: 'DEGRADED', system: 'Meridian HR', version: '1.0.1',
      database: 'OFFLINE',
      help: process.env.NODE_ENV !== 'production'
        ? (error.code || error.message)
        : 'Database connection unavailable.',
      timestamp: new Date().toISOString()
    });
  }
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  return next();
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: 'An internal server error occurred.' });
});

module.exports = app;
