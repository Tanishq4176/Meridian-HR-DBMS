DELIMITER //
DROP PROCEDURE IF EXISTS sp_calculate_payroll//
CREATE PROCEDURE sp_calculate_payroll(
  IN p_employee_id INT, IN p_period_id INT, IN p_processed_by INT,
  OUT p_payroll_id INT, OUT p_net_salary DECIMAL(12,2),
  OUT p_status_code INT, OUT p_status_message VARCHAR(255)
)
proc: BEGIN
  DECLARE v_salary_id INT DEFAULT NULL;
  DECLARE v_basic DECIMAL(12,2) DEFAULT 0;
  DECLARE v_hra DECIMAL(12,2) DEFAULT 0;
  DECLARE v_special DECIMAL(12,2) DEFAULT 0;
  DECLARE v_pf DECIMAL(12,2) DEFAULT 0;
  DECLARE v_pt DECIMAL(12,2) DEFAULT 0;
  DECLARE v_start DATE;
  DECLARE v_end DATE;
  DECLARE v_days INT DEFAULT 0;
  DECLARE v_present DECIMAL(5,1) DEFAULT 0;
  DECLARE v_paid_leave DECIMAL(5,1) DEFAULT 0;
  DECLARE v_unpaid_leave DECIMAL(5,1) DEFAULT 0;
  DECLARE v_late INT DEFAULT 0;
  DECLARE v_gross DECIMAL(12,2) DEFAULT 0;
  DECLARE v_daily DECIMAL(12,2) DEFAULT 0;
  DECLARE v_unpaid_deduction DECIMAL(12,2) DEFAULT 0;
  DECLARE v_late_penalty DECIMAL(12,2) DEFAULT 0;
  DECLARE v_tax DECIMAL(12,2) DEFAULT 0;
  DECLARE v_total_deduction DECIMAL(12,2) DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET p_payroll_id = NULL; SET p_net_salary = 0; SET p_status_code = 500;
    SET p_status_message = 'Payroll transaction failed and was rolled back.';
  END;

  SET p_payroll_id = NULL; SET p_net_salary = 0; SET p_status_code = 0; SET p_status_message = 'Success';
  IF NOT EXISTS (SELECT 1 FROM employees WHERE employee_id = p_employee_id AND status = 'ACTIVE') THEN
    SET p_status_code = 404; SET p_status_message = 'Active employee not found'; LEAVE proc;
  END IF;
  SELECT start_date, end_date, total_working_days INTO v_start, v_end, v_days
    FROM payroll_periods WHERE period_id = p_period_id;
  IF v_start IS NULL THEN SET p_status_code = 404; SET p_status_message = 'Payroll period not found'; LEAVE proc; END IF;
  IF EXISTS (SELECT 1 FROM payrolls WHERE employee_id = p_employee_id AND period_id = p_period_id) THEN
    SET p_status_code = 409; SET p_status_message = 'This employee has already been processed for the selected period'; LEAVE proc;
  END IF;
  SELECT salary_id, basic_salary, hra, special_allowance, provident_fund, professional_tax
    INTO v_salary_id, v_basic, v_hra, v_special, v_pf, v_pt
    FROM salary_structures WHERE employee_id = p_employee_id AND is_active = TRUE
    ORDER BY effective_date DESC LIMIT 1;
  IF v_salary_id IS NULL THEN SET p_status_code = 422; SET p_status_message = 'No active salary structure found'; LEAVE proc; END IF;

  SELECT COALESCE(SUM(CASE WHEN status = 'PRESENT' THEN 1 WHEN status = 'HALF_DAY' THEN 0.5 ELSE 0 END),0),
         COALESCE(SUM(is_late = TRUE),0)
    INTO v_present, v_late FROM attendance
    WHERE employee_id = p_employee_id AND work_date BETWEEN v_start AND v_end;
  SELECT COALESCE(SUM(total_days),0) INTO v_paid_leave FROM leaves
    WHERE employee_id = p_employee_id AND status = 'APPROVED'
      AND leave_type IN ('CASUAL','SICK','PAID') AND start_date <= v_end AND end_date >= v_start;
  SELECT COALESCE(SUM(total_days),0) INTO v_unpaid_leave FROM leaves
    WHERE employee_id = p_employee_id AND status = 'APPROVED' AND leave_type = 'UNPAID'
      AND start_date <= v_end AND end_date >= v_start;
  SELECT v_unpaid_leave + COALESCE(COUNT(*),0) INTO v_unpaid_leave FROM attendance
    WHERE employee_id = p_employee_id AND status = 'ABSENT' AND work_date BETWEEN v_start AND v_end;

  SET v_gross = v_basic + v_hra + v_special;
  SET v_daily = fn_calculate_daily_rate(v_gross, v_days);
  SET v_unpaid_deduction = ROUND(v_unpaid_leave * v_daily, 2);
  SET v_late_penalty = IF(v_late > 3, ROUND((v_late - 3) * 0.5 * v_daily, 2), 0);
  SET v_tax = fn_calculate_monthly_tds(v_gross * 12);
  SET v_total_deduction = v_pf + v_pt + v_unpaid_deduction + v_late_penalty + v_tax;
  SET p_net_salary = GREATEST(v_gross - v_total_deduction, 0);

  START TRANSACTION;
  INSERT INTO payrolls (employee_id, period_id, salary_id, present_days, approved_paid_leave_days,
    unpaid_leave_days, late_days, gross_earnings, total_deductions, net_salary, payment_status,
    processed_by, payment_date, remarks)
  VALUES (p_employee_id, p_period_id, v_salary_id, v_present, v_paid_leave, v_unpaid_leave,
    v_late, v_gross, v_total_deduction, p_net_salary, 'CALCULATED', p_processed_by, v_end,
    'Calculated by Meridian HR payroll procedure');
  SET p_payroll_id = LAST_INSERT_ID();
  INSERT INTO payroll_items (payroll_id,item_type,item_name,amount,description) VALUES
    (p_payroll_id,'EARNING','Basic salary',v_basic,'Base monthly compensation');
  IF v_hra > 0 THEN INSERT INTO payroll_items (payroll_id,item_type,item_name,amount,description) VALUES (p_payroll_id,'EARNING','House rent allowance',v_hra,'Housing allowance'); END IF;
  IF v_special > 0 THEN INSERT INTO payroll_items (payroll_id,item_type,item_name,amount,description) VALUES (p_payroll_id,'EARNING','Special allowance',v_special,'Additional allowance'); END IF;
  IF v_pf > 0 THEN INSERT INTO payroll_items (payroll_id,item_type,item_name,amount,description) VALUES (p_payroll_id,'DEDUCTION','Provident fund',v_pf,'Retirement contribution'); END IF;
  IF v_pt > 0 THEN INSERT INTO payroll_items (payroll_id,item_type,item_name,amount,description) VALUES (p_payroll_id,'DEDUCTION','Professional tax',v_pt,'Professional tax'); END IF;
  IF v_unpaid_deduction > 0 THEN INSERT INTO payroll_items (payroll_id,item_type,item_name,amount,description) VALUES (p_payroll_id,'DEDUCTION','Unpaid leave deduction',v_unpaid_deduction,'Unpaid leave and absence'); END IF;
  IF v_late_penalty > 0 THEN INSERT INTO payroll_items (payroll_id,item_type,item_name,amount,description) VALUES (p_payroll_id,'DEDUCTION','Late attendance adjustment',v_late_penalty,'Late marks above the three-mark allowance'); END IF;
  IF v_tax > 0 THEN INSERT INTO payroll_items (payroll_id,item_type,item_name,amount,description) VALUES (p_payroll_id,'DEDUCTION','Income tax estimate',v_tax,'Illustrative monthly tax calculation'); END IF;
  COMMIT;
  SET p_status_code = 200; SET p_status_message = 'Payroll calculated successfully';
END//

DROP PROCEDURE IF EXISTS sp_process_bulk_payroll//
CREATE PROCEDURE sp_process_bulk_payroll(IN p_period_id INT, IN p_processed_by INT, OUT p_processed INT, OUT p_errors INT)
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE emp_id INT;
  DECLARE out_id INT;
  DECLARE out_net DECIMAL(12,2);
  DECLARE out_code INT;
  DECLARE out_message VARCHAR(255);
  DECLARE employee_cursor CURSOR FOR SELECT employee_id FROM employees WHERE status = 'ACTIVE';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  SET p_processed = 0; SET p_errors = 0;
  OPEN employee_cursor;
  process_loop: LOOP
    FETCH employee_cursor INTO emp_id;
    IF done THEN LEAVE process_loop; END IF;
    CALL sp_calculate_payroll(emp_id, p_period_id, p_processed_by, out_id, out_net, out_code, out_message);
    IF out_code = 200 THEN SET p_processed = p_processed + 1; ELSE SET p_errors = p_errors + 1; END IF;
  END LOOP;
  CLOSE employee_cursor;
END//

DROP PROCEDURE IF EXISTS sp_demonstrate_transaction_rollback//
CREATE PROCEDURE sp_demonstrate_transaction_rollback(IN p_employee_id INT, IN p_period_id INT, IN p_processed_by INT, OUT p_status VARCHAR(50), OUT p_message VARCHAR(255))
BEGIN
  DECLARE v_salary_id INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK; SET p_status = 'ROLLBACK_VERIFIED'; SET p_message = 'Invalid payroll row was rejected and rolled back.';
  END;
  SELECT salary_id INTO v_salary_id FROM salary_structures WHERE employee_id = p_employee_id AND is_active = TRUE ORDER BY effective_date DESC LIMIT 1;
  START TRANSACTION;
  INSERT INTO payrolls (employee_id,period_id,salary_id,present_days,approved_paid_leave_days,unpaid_leave_days,late_days,gross_earnings,total_deductions,net_salary,payment_status,processed_by)
  VALUES (p_employee_id,p_period_id,v_salary_id,20,0,0,0,-500,0,0,'CALCULATED',p_processed_by);
  COMMIT; SET p_status = 'FAILED_TO_CATCH'; SET p_message = 'The invalid row was unexpectedly accepted.';
END//
DELIMITER ;
