const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireRole, enforceSelfOrAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken);

router.get('/:employeeId', enforceSelfOrAdmin('employeeId'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT salary_id, employee_id, basic_salary, hra, special_allowance,
      provident_fund, professional_tax, effective_date, is_active, created_at, updated_at
      FROM salary_structures WHERE employee_id = ? ORDER BY effective_date DESC, salary_id DESC`,
      [Number.parseInt(req.params.employeeId, 10)]);
    return res.json({ success: true, count: rows.length, history: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Could not retrieve salary history.' });
  }
});

router.post('/:employeeId', requireRole('HR_ADMIN'), async (req, res) => {
  const employeeId = Number.parseInt(req.params.employeeId, 10);
  const { basic_salary, hra = 0, special_allowance = 0, provident_fund = 0, professional_tax = 0, effective_date } = req.body;
  if (basic_salary === undefined || !effective_date) return res.status(400).json({ success: false, error: 'Basic salary and effective date are required.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE salary_structures SET is_active = FALSE WHERE employee_id = ?', [employeeId]);
    const [result] = await connection.query(`INSERT INTO salary_structures
      (employee_id, basic_salary, hra, special_allowance, provident_fund, professional_tax, effective_date, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [employeeId, basic_salary, hra, special_allowance, provident_fund, professional_tax, effective_date]);
    await connection.commit();
    return res.json({ success: true, message: 'Salary structure revised successfully.', salary_id: result.insertId });
  } catch (error) {
    await connection.rollback();
    console.error('Salary revision error:', error);
    return res.status(400).json({ success: false, error: error.message || 'Could not revise salary structure.' });
  } finally { connection.release(); }
});
module.exports = router;
