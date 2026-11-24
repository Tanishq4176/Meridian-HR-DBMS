const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken);

router.get('/periods', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payroll_periods ORDER BY start_date DESC');
    return res.json({ success: true, periods: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Could not fetch payroll periods.' });
  }
});

router.get('/', async (req, res) => {
  let { employeeId, periodId } = req.query;
  if (req.user.role !== 'HR_ADMIN') {
    if (employeeId && Number.parseInt(employeeId, 10) !== req.user.employee_id) return res.status(403).json({ success: false, error: 'You can access only your own payroll records.' });
    employeeId = req.user.employee_id;
  }
  try {
    let query = `SELECT p.payroll_id, p.employee_id, e.employee_code,
      CONCAT(e.first_name, ' ', e.last_name) AS full_name, d.department_name, e.designation,
      pp.period_id, pp.period_name, pp.start_date, pp.end_date, pp.total_working_days,
      p.present_days, p.approved_paid_leave_days, p.unpaid_leave_days, p.late_days,
      p.gross_earnings, p.total_deductions, p.net_salary, p.payment_status, p.processed_at, p.payment_date
      FROM payrolls p JOIN employees e ON p.employee_id = e.employee_id
      JOIN departments d ON e.department_id = d.department_id
      JOIN payroll_periods pp ON p.period_id = pp.period_id WHERE 1=1`;
    const params = [];
    if (employeeId) { query += ' AND p.employee_id = ?'; params.push(employeeId); }
    if (periodId) { query += ' AND p.period_id = ?'; params.push(periodId); }
    query += ' ORDER BY pp.start_date DESC, p.payroll_id DESC';
    const [rows] = await pool.query(query, params);
    return res.json({ success: true, count: rows.length, payrolls: rows });
  } catch (error) {
    console.error('List payrolls error:', error);
    return res.status(500).json({ success: false, error: 'Could not retrieve payroll records.' });
  }
});

router.get('/slip/:payrollId', async (req, res) => {
  try {
    const [headers] = await pool.query(`SELECT p.payroll_id, p.employee_id, e.employee_code,
      CONCAT(e.first_name, ' ', e.last_name) AS full_name, e.email, d.department_name, e.designation,
      pp.period_id, pp.period_name, pp.start_date, pp.end_date, pp.total_working_days,
      p.present_days, p.approved_paid_leave_days, p.unpaid_leave_days, p.late_days,
      p.gross_earnings, p.total_deductions, p.net_salary, p.payment_status, p.processed_at, p.payment_date, p.remarks
      FROM payrolls p JOIN employees e ON p.employee_id = e.employee_id
      JOIN departments d ON e.department_id = d.department_id
      JOIN payroll_periods pp ON p.period_id = pp.period_id WHERE p.payroll_id = ?`,
      [Number.parseInt(req.params.payrollId, 10)]);
    if (!headers.length) return res.status(404).json({ success: false, error: 'Payslip not found.' });
    const slip = headers[0];
    if (req.user.role !== 'HR_ADMIN' && slip.employee_id !== req.user.employee_id) return res.status(403).json({ success: false, error: 'You are not authorised to view this payslip.' });
    const [items] = await pool.query('SELECT item_id, item_type, item_name, amount, description FROM payroll_items WHERE payroll_id = ? ORDER BY item_type DESC, item_id ASC', [slip.payroll_id]);
    return res.json({ success: true, slip: { ...slip, earnings: items.filter(item => item.item_type === 'EARNING'), deductions: items.filter(item => item.item_type === 'DEDUCTION'), item_count: items.length } });
  } catch (error) {
    console.error('Payslip error:', error);
    return res.status(500).json({ success: false, error: 'Could not retrieve payslip.' });
  }
});

router.post('/process', requireRole('HR_ADMIN'), async (req, res) => {
  const { periodId, employeeId } = req.body;
  if (!periodId) return res.status(400).json({ success: false, error: 'Choose a payroll period first.' });
  try {
    if (employeeId) {
      const [result] = await pool.query('CALL sp_calculate_payroll(?, ?, ?, @pid, @net, @code, @msg); SELECT @pid AS payroll_id, @net AS net_salary, @code AS status_code, @msg AS status_message;', [employeeId, periodId, req.user.employee_id]);
      const output = result[1][0];
      if (output.status_code === 200) return res.json({ success: true, message: output.status_message, payroll_id: output.payroll_id, net_salary: output.net_salary });
      return res.status(output.status_code === 409 ? 409 : 400).json({ success: false, error: output.status_message });
    }
    const [result] = await pool.query('CALL sp_process_bulk_payroll(?, ?, @processed, @errors); SELECT @processed AS processed_count, @errors AS error_count;', [periodId, req.user.employee_id]);
    const output = result[1][0];
    return res.json({ success: true, message: `Payroll cycle processed. ${output.processed_count} calculated, ${output.error_count} skipped.`, processed_count: output.processed_count, error_count: output.error_count });
  } catch (error) {
    console.error('Payroll processing error:', error);
    return res.status(500).json({ success: false, error: 'Payroll processing failed.' });
  }
});

router.post('/test-rollback', requireRole('HR_ADMIN'), async (req, res) => {
  try {
    const [periods] = await pool.query("SELECT period_id FROM payroll_periods WHERE status = 'OPEN' ORDER BY start_date DESC LIMIT 1");
    if (!periods.length) return res.status(409).json({ success: false, error: 'Create an open payroll period before running the rollback demonstration.' });
    const periodId = periods[0].period_id;
    const [result] = await pool.query('CALL sp_demonstrate_transaction_rollback(?, ?, ?, @result, @message); SELECT @result AS status, @message AS message;', [req.user.employee_id, periodId, req.user.employee_id]);
    const output = result[1][0];
    return res.json({ success: true, demonstration: 'Transaction rollback test', status: output.status, message: output.message });
  } catch (error) {
    console.error('Rollback test error:', error);
    return res.status(500).json({ success: false, error: 'Rollback test failed.' });
  }
});
module.exports = router;
