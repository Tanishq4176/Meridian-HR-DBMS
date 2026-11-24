USE meridian_hr;

-- 1. Attendance summary by employee for one selected period.
SET @report_period_id = 2;
SELECT e.employee_code, CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
       d.department_name, pp.period_name, pp.total_working_days,
       COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 WHEN a.status = 'HALF_DAY' THEN 0.5 ELSE 0 END),0) AS days_present,
       COALESCE(SUM(a.status = 'ABSENT'),0) AS days_absent,
       COALESCE(SUM(a.status = 'ON_LEAVE'),0) AS days_on_leave,
       COALESCE(SUM(a.is_late = TRUE),0) AS late_marks,
       ROUND((COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 WHEN a.status = 'HALF_DAY' THEN 0.5 ELSE 0 END),0)
         + COALESCE(SUM(a.status = 'ON_LEAVE'),0)) / pp.total_working_days * 100, 1) AS attendance_percentage
FROM employees e
JOIN departments d ON d.department_id = e.department_id
JOIN payroll_periods pp ON pp.period_id = @report_period_id
LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.work_date BETWEEN pp.start_date AND pp.end_date
WHERE e.status = 'ACTIVE'
GROUP BY e.employee_id, e.employee_code, e.first_name, e.last_name, d.department_name, pp.period_name, pp.total_working_days
ORDER BY e.employee_code;

-- 2. Payroll summary by department.
SELECT d.department_name, COUNT(p.payroll_id) AS employees_processed,
       SUM(p.gross_earnings) AS gross_payroll, SUM(p.total_deductions) AS total_deductions,
       SUM(p.net_salary) AS net_payroll, ROUND(AVG(p.net_salary),2) AS average_net_pay
FROM payrolls p
JOIN employees e ON e.employee_id = p.employee_id
JOIN departments d ON d.department_id = e.department_id
WHERE p.period_id = @report_period_id
GROUP BY d.department_id, d.department_name
ORDER BY net_payroll DESC;

-- 3. Late arrivals in the selected period.
SELECT e.employee_code, CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
       a.work_date, a.check_in_time, a.late_minutes, a.remarks
FROM attendance a
JOIN employees e ON e.employee_id = a.employee_id
JOIN payroll_periods pp ON pp.period_id = @report_period_id
WHERE a.work_date BETWEEN pp.start_date AND pp.end_date AND a.is_late = TRUE
ORDER BY a.late_minutes DESC, a.work_date;
