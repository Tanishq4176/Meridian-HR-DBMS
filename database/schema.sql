SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS payroll_items;
DROP TABLE IF EXISTS payrolls;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS leaves;
DROP TABLE IF EXISTS salary_structures;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS payroll_periods;

CREATE TABLE departments (
  department_id INT AUTO_INCREMENT PRIMARY KEY,
  department_name VARCHAR(70) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employees (
  employee_id INT AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(25),
  department_id INT NOT NULL,
  designation VARCHAR(70) NOT NULL,
  role ENUM('HR_ADMIN','EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
  password_hash VARCHAR(255) NOT NULL,
  hire_date DATE NOT NULL,
  status ENUM('ACTIVE','INACTIVE','TERMINATED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(department_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE salary_structures (
  salary_id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  basic_salary DECIMAL(12,2) NOT NULL,
  hra DECIMAL(12,2) NOT NULL DEFAULT 0,
  special_allowance DECIMAL(12,2) NOT NULL DEFAULT 0,
  provident_fund DECIMAL(12,2) NOT NULL DEFAULT 0,
  professional_tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  effective_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_salary_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  CONSTRAINT chk_salary_basic CHECK (basic_salary >= 0),
  CONSTRAINT chk_salary_hra CHECK (hra >= 0),
  CONSTRAINT chk_salary_special CHECK (special_allowance >= 0),
  CONSTRAINT chk_salary_pf CHECK (provident_fund >= 0),
  CONSTRAINT chk_salary_pt CHECK (professional_tax >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendance (
  attendance_id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  work_date DATE NOT NULL,
  status ENUM('PRESENT','ABSENT','HALF_DAY','ON_LEAVE') NOT NULL,
  check_in_time TIME,
  check_out_time TIME,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  late_minutes INT NOT NULL DEFAULT 0,
  remarks VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_emp_work_date (employee_id, work_date),
  KEY idx_attendance_date_status (work_date, status),
  KEY idx_attendance_late (is_late, work_date, late_minutes),
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  CONSTRAINT chk_attendance_late_min CHECK (late_minutes >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE leaves (
  leave_id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  leave_type ENUM('CASUAL','SICK','PAID','UNPAID') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(4,1) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  applied_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actioned_by INT,
  actioned_on TIMESTAMP NULL,
  admin_remarks VARCHAR(255),
  KEY idx_leave_employee_status (employee_id, status, start_date, end_date),
  CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_actioned_by FOREIGN KEY (actioned_by) REFERENCES employees(employee_id) ON DELETE SET NULL,
  CONSTRAINT chk_leave_dates CHECK (start_date <= end_date),
  CONSTRAINT chk_leave_days CHECK (total_days > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_periods (
  period_id INT AUTO_INCREMENT PRIMARY KEY,
  period_name VARCHAR(30) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_working_days INT NOT NULL,
  status ENUM('OPEN','PROCESSING','FINALIZED','CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_period_dates CHECK (start_date <= end_date),
  CONSTRAINT chk_period_days CHECK (total_working_days > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payrolls (
  payroll_id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  period_id INT NOT NULL,
  salary_id INT NOT NULL,
  present_days DECIMAL(4,1) NOT NULL DEFAULT 0,
  approved_paid_leave_days DECIMAL(4,1) NOT NULL DEFAULT 0,
  unpaid_leave_days DECIMAL(4,1) NOT NULL DEFAULT 0,
  late_days INT NOT NULL DEFAULT 0,
  gross_earnings DECIMAL(12,2) NOT NULL,
  total_deductions DECIMAL(12,2) NOT NULL,
  net_salary DECIMAL(12,2) NOT NULL,
  payment_status ENUM('CALCULATED','PROCESSED','PAID') NOT NULL DEFAULT 'CALCULATED',
  processed_by INT NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_date DATE,
  remarks VARCHAR(255),
  UNIQUE KEY uq_employee_period (employee_id, period_id),
  KEY idx_payroll_period_employee (period_id, employee_id),
  CONSTRAINT fk_payroll_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_period FOREIGN KEY (period_id) REFERENCES payroll_periods(period_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_salary FOREIGN KEY (salary_id) REFERENCES salary_structures(salary_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_processor FOREIGN KEY (processed_by) REFERENCES employees(employee_id) ON DELETE RESTRICT,
  CONSTRAINT chk_payroll_gross CHECK (gross_earnings >= 0),
  CONSTRAINT chk_payroll_deductions CHECK (total_deductions >= 0),
  CONSTRAINT chk_payroll_net CHECK (net_salary >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  payroll_id INT NOT NULL,
  item_type ENUM('EARNING','DEDUCTION') NOT NULL,
  item_name VARCHAR(60) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payroll_item_parent FOREIGN KEY (payroll_id) REFERENCES payrolls(payroll_id) ON DELETE CASCADE,
  CONSTRAINT chk_payroll_item_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL,
  record_id INT NOT NULL,
  action ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  actor_employee_id INT,
  old_values LONGTEXT,
  new_values LONGTEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
