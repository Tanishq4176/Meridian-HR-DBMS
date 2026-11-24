DELIMITER //
DROP TRIGGER IF EXISTS trg_attendance_before_insert//
CREATE TRIGGER trg_attendance_before_insert BEFORE INSERT ON attendance FOR EACH ROW
BEGIN
  DECLARE leave_count INT DEFAULT 0;
  IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL AND NEW.check_out_time < NEW.check_in_time THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-out time cannot be earlier than check-in time';
  END IF;
  SELECT COUNT(*) INTO leave_count FROM leaves WHERE employee_id = NEW.employee_id AND status = 'APPROVED' AND NEW.work_date BETWEEN start_date AND end_date;
  IF leave_count > 0 AND NEW.status <> 'ON_LEAVE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee has approved leave for this date';
  END IF;
  IF NEW.check_in_time IS NOT NULL THEN
    IF NEW.check_in_time > '09:15:00' THEN
      SET NEW.is_late = TRUE;
      SET NEW.late_minutes = ROUND(TIME_TO_SEC(TIMEDIFF(NEW.check_in_time, '09:00:00')) / 60);
    ELSE
      SET NEW.is_late = FALSE; SET NEW.late_minutes = 0;
    END IF;
  END IF;
END//

DROP TRIGGER IF EXISTS trg_attendance_before_update//
CREATE TRIGGER trg_attendance_before_update BEFORE UPDATE ON attendance FOR EACH ROW
BEGIN
  DECLARE leave_count INT DEFAULT 0;
  IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL AND NEW.check_out_time < NEW.check_in_time THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-out time cannot be earlier than check-in time';
  END IF;
  SELECT COUNT(*) INTO leave_count FROM leaves WHERE employee_id = NEW.employee_id AND status = 'APPROVED' AND NEW.work_date BETWEEN start_date AND end_date;
  IF leave_count > 0 AND NEW.status <> 'ON_LEAVE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee has approved leave for this date';
  END IF;
  IF NEW.check_in_time IS NOT NULL THEN
    IF NEW.check_in_time > '09:15:00' THEN
      SET NEW.is_late = TRUE;
      SET NEW.late_minutes = ROUND(TIME_TO_SEC(TIMEDIFF(NEW.check_in_time, '09:00:00')) / 60);
    ELSE
      SET NEW.is_late = FALSE; SET NEW.late_minutes = 0;
    END IF;
  END IF;
END//

DROP TRIGGER IF EXISTS trg_leave_before_insert//
CREATE TRIGGER trg_leave_before_insert BEFORE INSERT ON leaves FOR EACH ROW
BEGIN
  DECLARE overlap_count INT DEFAULT 0;
  IF NEW.start_date > NEW.end_date OR NEW.total_days <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid leave dates or day count';
  END IF;
  IF NEW.status = 'APPROVED' THEN
    SELECT COUNT(*) INTO overlap_count FROM leaves WHERE employee_id = NEW.employee_id AND status = 'APPROVED'
      AND start_date <= NEW.end_date AND end_date >= NEW.start_date;
    IF overlap_count > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping approved leave already exists'; END IF;
  END IF;
END//

DROP TRIGGER IF EXISTS trg_leave_before_update//
CREATE TRIGGER trg_leave_before_update BEFORE UPDATE ON leaves FOR EACH ROW
BEGIN
  DECLARE overlap_count INT DEFAULT 0;
  IF NEW.start_date > NEW.end_date OR NEW.total_days <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid leave dates or day count';
  END IF;
  IF NEW.status = 'APPROVED' THEN
    SELECT COUNT(*) INTO overlap_count FROM leaves WHERE employee_id = NEW.employee_id AND status = 'APPROVED'
      AND leave_id <> NEW.leave_id AND start_date <= NEW.end_date AND end_date >= NEW.start_date;
    IF overlap_count > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping approved leave already exists'; END IF;
  END IF;
END//

DROP TRIGGER IF EXISTS trg_salary_audit_after_update//
CREATE TRIGGER trg_salary_audit_after_update AFTER UPDATE ON salary_structures FOR EACH ROW
BEGIN
  INSERT INTO audit_logs (table_name, record_id, action, actor_employee_id, old_values, new_values)
  VALUES ('salary_structures', NEW.salary_id, 'UPDATE', NULL,
    JSON_OBJECT('basic_salary',OLD.basic_salary,'hra',OLD.hra,'special_allowance',OLD.special_allowance,'is_active',OLD.is_active),
    JSON_OBJECT('basic_salary',NEW.basic_salary,'hra',NEW.hra,'special_allowance',NEW.special_allowance,'is_active',NEW.is_active));
END//

DROP TRIGGER IF EXISTS trg_payroll_audit_after_insert//
CREATE TRIGGER trg_payroll_audit_after_insert AFTER INSERT ON payrolls FOR EACH ROW
BEGIN
  INSERT INTO audit_logs (table_name, record_id, action, actor_employee_id, new_values)
  VALUES ('payrolls', NEW.payroll_id, 'INSERT', NEW.processed_by,
    JSON_OBJECT('employee_id',NEW.employee_id,'period_id',NEW.period_id,'gross_earnings',NEW.gross_earnings,
      'total_deductions',NEW.total_deductions,'net_salary',NEW.net_salary,'payment_status',NEW.payment_status));
END//
DELIMITER ;
