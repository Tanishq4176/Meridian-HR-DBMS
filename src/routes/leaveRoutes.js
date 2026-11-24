const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  let { employeeId, status } = req.query;
  if (req.user.role !== 'HR_ADMIN') {
    if (employeeId && Number.parseInt(employeeId, 10) !== req.user.employee_id) return res.status(403).json({ success: false, error: 'You can access only your own leave requests.' });
    employeeId = req.user.employee_id;
  }
  try {
    let query = `SELECT l.leave_id, l.employee_id, e.employee_code,
      CONCAT(e.first_name, ' ', e.last_name) AS full_name, d.department_name,
      l.leave_type, l.start_date, l.end_date, l.total_days, l.reason, l.status,
      l.applied_on, CONCAT(a.first_name, ' ', a.last_name) AS actioned_by_name,
      l.actioned_on, l.admin_remarks FROM leaves l
      JOIN employees e ON l.employee_id = e.employee_id
      JOIN departments d ON e.department_id = d.department_id
      LEFT JOIN employees a ON l.actioned_by = a.employee_id WHERE 1=1`;
    const params = [];
    if (employeeId) { query += ' AND l.employee_id = ?'; params.push(employeeId); }
    if (status) { query += ' AND l.status = ?'; params.push(status); }
    query += ' ORDER BY l.applied_on DESC LIMIT 200';
    const [rows] = await pool.query(query, params);
    return res.json({ success: true, count: rows.length, leaves: rows });
  } catch (error) {
    console.error('Leave list error:', error);
    return res.status(500).json({ success: false, error: 'Could not retrieve leave requests.' });
  }
});

router.post('/', async (req, res) => {
  const { leave_type, start_date, end_date, total_days, reason } = req.body;
  if (!leave_type || !start_date || !end_date || !total_days || !reason) return res.status(400).json({ success: false, error: 'Please complete all leave request fields.' });
  try {
    const [result] = await pool.query(`INSERT INTO leaves (employee_id, leave_type, start_date, end_date, total_days, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`, [req.user.employee_id, leave_type, start_date, end_date, total_days, reason.trim()]);
    return res.status(201).json({ success: true, message: 'Leave request submitted.', leave_id: result.insertId });
  } catch (error) {
    console.error('Apply leave error:', error);
    return res.status(400).json({ success: false, error: error.message || 'Leave request could not be submitted.' });
  }
});

router.put('/:leaveId/status', requireRole('HR_ADMIN'), async (req, res) => {
  const leaveId = Number.parseInt(req.params.leaveId, 10);
  const { status, admin_remarks } = req.body;
  if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid leave status.' });
  try {
    await pool.query(`UPDATE leaves SET status = ?, actioned_by = ?, actioned_on = NOW(), admin_remarks = ? WHERE leave_id = ?`,
      [status, req.user.employee_id, admin_remarks ? admin_remarks.trim() : null, leaveId]);
    return res.json({ success: true, message: `Leave request ${status.toLowerCase()}.` });
  } catch (error) {
    console.error('Update leave status error:', error);
    return res.status(409).json({ success: false, error: error.message || 'Leave status could not be updated.' });
  }
});
module.exports = router;
