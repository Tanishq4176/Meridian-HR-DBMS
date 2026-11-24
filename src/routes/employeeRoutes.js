const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authenticateToken, requireRole, enforceSelfOrAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken);

router.get('/', requireRole('HR_ADMIN'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT e.employee_id, e.employee_code, e.first_name, e.last_name, e.email, e.phone,
             d.department_id, d.department_name, e.designation, e.role, e.hire_date, e.status,
             s.basic_salary, (s.basic_salary + s.hra + s.special_allowance) AS gross_salary
      FROM employees e JOIN departments d ON e.department_id = d.department_id
      LEFT JOIN salary_structures s ON e.employee_id = s.employee_id AND s.is_active = TRUE
      ORDER BY e.employee_id ASC`);
    return res.json({ success: true, count: rows.length, employees: rows });
  } catch (error) {
    console.error('List employees error:', error);
    return res.status(500).json({ success: false, error: 'Could not retrieve employees.' });
  }
});

router.get('/:employeeId', enforceSelfOrAdmin('employeeId'), async (req, res) => {
  const employeeId = Number.parseInt(req.params.employeeId, 10);
  try {
    const [rows] = await pool.query(`
      SELECT e.employee_id, e.employee_code, e.first_name, e.last_name, e.email, e.phone,
             d.department_name, e.designation, e.role, e.hire_date, e.status,
             s.basic_salary, s.hra, s.special_allowance, s.provident_fund, s.professional_tax,
             (s.basic_salary + s.hra + s.special_allowance) AS gross_monthly
      FROM employees e JOIN departments d ON e.department_id = d.department_id
      LEFT JOIN salary_structures s ON e.employee_id = s.employee_id AND s.is_active = TRUE
      WHERE e.employee_id = ?`, [employeeId]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Employee not found.' });
    return res.json({ success: true, employee: rows[0] });
  } catch (error) {
    console.error('Get employee error:', error);
    return res.status(500).json({ success: false, error: 'Could not retrieve employee.' });
  }
});

router.post('/', requireRole('HR_ADMIN'), async (req, res) => {
  const { employee_code, first_name, last_name, email, phone, department_id, designation, role,
    password, hire_date, basic_salary, hra = 0, special_allowance = 0, provident_fund = 0, professional_tax = 0 } = req.body;
  if (!employee_code || !first_name || !last_name || !email || !department_id || !designation || !hire_date || basic_salary === undefined) {
    return res.status(400).json({ success: false, error: 'Please complete all required employee fields.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const passwordHash = await bcrypt.hash(password || 'Employee123!', 10);
    const [employeeResult] = await connection.query(
      `INSERT INTO employees (employee_code, first_name, last_name, email, phone, department_id,
       designation, role, password_hash, hire_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [employee_code.trim().toUpperCase(), first_name.trim(), last_name.trim(), email.trim().toLowerCase(),
       phone ? phone.trim() : null, department_id, designation.trim(), role || 'EMPLOYEE', passwordHash, hire_date]
    );
    await connection.query(
      `INSERT INTO salary_structures (employee_id, basic_salary, hra, special_allowance,
       provident_fund, professional_tax, effective_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [employeeResult.insertId, basic_salary, hra, special_allowance, provident_fund, professional_tax, hire_date]
    );
    await connection.commit();
    return res.status(201).json({ success: true, message: 'Employee created successfully.', employee_id: employeeResult.insertId, employee_code });
  } catch (error) {
    await connection.rollback();
    console.error('Create employee error:', error);
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Employee code or email already exists.' });
    return res.status(500).json({ success: false, error: 'Could not create employee.' });
  } finally { connection.release(); }
});
module.exports = router;
