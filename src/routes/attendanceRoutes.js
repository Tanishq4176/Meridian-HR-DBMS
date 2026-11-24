const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  let { employeeId, periodId, startDate, endDate } = req.query;
  if (req.user.role !== 'HR_ADMIN') {
    if (employeeId && Number.parseInt(employeeId, 10) !== req.user.employee_id) return res.status(403).json({ success: false, error: 'You can access only your own attendance.' });
    employeeId = req.user.employee_id;
  }
  try {
    let query = `SELECT a.attendance_id, a.employee_id, e.employee_code,
      CONCAT(e.first_name, ' ', e.last_name) AS full_name, d.department_name,
      a.work_date, a.status, a.check_in_time, a.check_out_time, a.is_late, a.late_minutes, a.remarks
      FROM attendance a JOIN employees e ON a.employee_id = e.employee_id
      JOIN departments d ON e.department_id = d.department_id WHERE 1=1`;
    const params = [];
    if (employeeId) { query += ' AND a.employee_id = ?'; params.push(employeeId); }
    if (periodId) { query += ' AND a.work_date BETWEEN (SELECT start_date FROM payroll_periods WHERE period_id = ?) AND (SELECT end_date FROM payroll_periods WHERE period_id = ?)'; params.push(periodId, periodId); }
    else if (startDate && endDate) { query += ' AND a.work_date BETWEEN ? AND ?'; params.push(startDate, endDate); }
    query += ' ORDER BY a.work_date DESC, a.check_in_time DESC LIMIT 500';
    const [rows] = await pool.query(query, params);
    return res.json({ success: true, count: rows.length, attendance: rows });
  } catch (error) {
    console.error('Attendance list error:', error);
    return res.status(500).json({ success: false, error: 'Could not retrieve attendance records.' });
  }
});

router.post('/clock-in', async (req, res) => {
  const employeeId = req.user.employee_id;
  const now = new Date();
  const workDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeString = now.toTimeString().slice(0, 8);
  try {
    const [existing] = await pool.query(
      'SELECT attendance_id, status, check_in_time, check_out_time FROM attendance WHERE employee_id = ? AND work_date = ?',
      [employeeId, workDate]
    );
    let message;
    if (!existing.length) {
      await pool.query(
        "INSERT INTO attendance (employee_id, work_date, status, check_in_time, remarks) VALUES (?, ?, 'PRESENT', ?, 'Self-service clock-in')",
        [employeeId, workDate, timeString]
      );
      message = 'Clock-in recorded successfully.';
    } else if (existing[0].check_in_time && !existing[0].check_out_time) {
      await pool.query(
        `UPDATE attendance SET check_out_time = ?, remarks = CONCAT(COALESCE(remarks, ''), ' | Self-service clock-out') WHERE attendance_id = ?`,
        [timeString, existing[0].attendance_id]
      );
      message = 'Clock-out recorded successfully.';
    } else if (existing[0].check_in_time && existing[0].check_out_time) {
      return res.status(409).json({ success: false, error: 'Your attendance for today is already complete.' });
    } else {
      return res.status(400).json({ success: false, error: 'Attendance cannot be clocked for this date. Contact your people team if this looks incorrect.' });
    }
    const [rows] = await pool.query(
      'SELECT attendance_id, work_date, status, check_in_time, check_out_time, is_late, late_minutes FROM attendance WHERE employee_id = ? AND work_date = ?',
      [employeeId, workDate]
    );
    return res.json({ success: true, message, record: rows[0] });
  } catch (error) {
    console.error('Clock action error:', error);
    return res.status(400).json({ success: false, error: error.message || 'Attendance could not be recorded.' });
  }
});

module.exports = router;
