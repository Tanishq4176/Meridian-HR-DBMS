const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken, requireRole('HR_ADMIN'));

router.get('/attendance-summary', async (req, res) => {
  const periodId = Number.parseInt(req.query.periodId || 1, 10);
  try {
    const [rows] = await pool.query(`SELECT e.employee_id, e.employee_code,
      CONCAT(e.first_name, ' ', e.last_name) AS full_name, d.department_name, e.designation,
      pp.period_name, pp.total_working_days,
      COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 WHEN a.status = 'HALF_DAY' THEN 0.5 ELSE 0 END), 0) AS days_present,
      COALESCE(SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END), 0) AS days_absent,
      COALESCE(SUM(CASE WHEN a.status = 'ON_LEAVE' THEN 1 ELSE 0 END), 0) AS days_on_leave,
      COALESCE(SUM(CASE WHEN a.is_late = TRUE THEN 1 ELSE 0 END), 0) AS late_marks,
      ROUND((COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 WHEN a.status = 'HALF_DAY' THEN 0.5 ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN a.status = 'ON_LEAVE' THEN 1 ELSE 0 END), 0)) / pp.total_working_days * 100, 1) AS attendance_percentage
      FROM employees e JOIN departments d ON e.department_id = d.department_id
      JOIN payroll_periods pp ON pp.period_id = ?
      LEFT JOIN attendance a ON e.employee_id = a.employee_id AND a.work_date BETWEEN pp.start_date AND pp.end_date
      WHERE e.status = 'ACTIVE'
      GROUP BY e.employee_id, e.employee_code, e.first_name, e.last_name, d.department_name, e.designation, pp.period_name, pp.total_working_days
      ORDER BY e.employee_id`, [periodId]);
    return res.json({ success: true, period_id: periodId, count: rows.length, summary: rows });
  } catch (error) {
    console.error('Attendance summary error:', error);
    return res.status(500).json({ success: false, error: 'Could not generate attendance summary.' });
  }
});

router.get('/late-marks', async (req, res) => {
  const periodId = Number.parseInt(req.query.periodId || 1, 10);
  try {
    const [rows] = await pool.query(`SELECT e.employee_id, e.employee_code,
      CONCAT(e.first_name, ' ', e.last_name) AS full_name, d.department_name, e.designation,
      a.work_date, a.check_in_time, a.late_minutes, a.remarks
      FROM attendance a JOIN employees e ON a.employee_id = e.employee_id
      JOIN departments d ON e.department_id = d.department_id
      JOIN payroll_periods pp ON pp.period_id = ?
      WHERE a.work_date BETWEEN pp.start_date AND pp.end_date AND a.is_late = TRUE
      ORDER BY a.late_minutes DESC, a.work_date`, [periodId]);
    return res.json({ success: true, period_id: periodId, count: rows.length, late_marks: rows });
  } catch (error) {
    console.error('Late marks error:', error);
    return res.status(500).json({ success: false, error: 'Could not generate late marks report.' });
  }
});

router.get('/departmental', async (req, res) => {
  const periodId = Number.parseInt(req.query.periodId || 1, 10);
  try {
    const [rows] = await pool.query(`SELECT d.department_name, COUNT(p.payroll_id) AS employee_count,
      SUM(p.gross_earnings) AS total_gross_earnings, SUM(p.total_deductions) AS total_deductions,
      SUM(p.net_salary) AS total_net_disbursed, ROUND(AVG(p.net_salary), 2) AS average_net_salary
      FROM payrolls p JOIN employees e ON p.employee_id = e.employee_id
      JOIN departments d ON e.department_id = d.department_id
      WHERE p.period_id = ? GROUP BY d.department_id, d.department_name ORDER BY total_net_disbursed DESC`, [periodId]);
    return res.json({ success: true, period_id: periodId, departments: rows });
  } catch (error) {
    console.error('Department report error:', error);
    return res.status(500).json({ success: false, error: 'Could not generate departmental report.' });
  }
});
module.exports = router;
