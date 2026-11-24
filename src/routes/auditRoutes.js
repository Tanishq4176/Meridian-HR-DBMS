const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken, requireRole('HR_ADMIN'));
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT a.log_id, a.table_name, a.record_id, a.action,
      a.actor_employee_id, CONCAT(e.first_name, ' ', e.last_name) AS actor_name,
      e.employee_code AS actor_code, a.old_values, a.new_values, a.ip_address, a.created_at
      FROM audit_logs a LEFT JOIN employees e ON a.actor_employee_id = e.employee_id
      ORDER BY a.log_id DESC LIMIT 100`);
    return res.json({ success: true, count: rows.length, logs: rows });
  } catch (error) {
    console.error('Audit log error:', error);
    return res.status(500).json({ success: false, error: 'Could not retrieve audit records.' });
  }
});
module.exports = router;
