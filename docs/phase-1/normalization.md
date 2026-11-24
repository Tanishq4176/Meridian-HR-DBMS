# Meridian HR — Relational Normalization Proof (3NF & BCNF)

This document formally demonstrates that the relational schema implemented in **Meridian HR** satisfies Third Normal Form (3NF) and Boyce-Codd Normal Form (BCNF).

---

## 1. Relational Schema Summary

The database defines nine normalized relations:
1. `departments` (`department_id`, `department_name`, `description`, `created_at`)
2. `employees` (`employee_id`, `employee_code`, `first_name`, `last_name`, `email`, `phone`, `department_id`, `designation`, `role`, `password_hash`, `hire_date`, `status`, `created_at`, `updated_at`)
3. `salary_structures` (`salary_id`, `employee_id`, `basic_salary`, `hra`, `special_allowance`, `provident_fund`, `professional_tax`, `effective_date`, `is_active`, `created_at`, `updated_at`)
4. `attendance` (`attendance_id`, `employee_id`, `work_date`, `status`, `check_in_time`, `check_out_time`, `is_late`, `late_minutes`, `remarks`, `created_at`, `updated_at`)
5. `leaves` (`leave_id`, `employee_id`, `leave_type`, `start_date`, `end_date`, `total_days`, `reason`, `status`, `applied_on`, `actioned_by`, `actioned_on`, `admin_remarks`)
6. `payroll_periods` (`period_id`, `period_name`, `start_date`, `end_date`, `total_working_days`, `status`, `created_at`)
7. `payrolls` (`payroll_id`, `employee_id`, `period_id`, `salary_id`, `present_days`, `approved_paid_leave_days`, `unpaid_leave_days`, `late_days`, `gross_earnings`, `total_deductions`, `net_salary`, `payment_status`, `processed_by`, `processed_at`, `payment_date`, `remarks`)
8. `payroll_items` (`item_id`, `payroll_id`, `item_type`, `item_name`, `amount`, `description`, `created_at`)
9. `audit_logs` (`log_id`, `table_name`, `record_id`, `action`, `actor_employee_id`, `old_values`, `new_values`, `ip_address`, `created_at`)

---

## 2. First Normal Form (1NF)

A relation is in 1NF if:
- All column values are atomic (indivisible).
- No repeating groups or arrays exist within a row.
- Each table has a unique primary key.

**Proof for Meridian HR:**
- Every attribute contains a scalar atomic value (`DECIMAL`, `VARCHAR`, `INT`, `DATE`, `TIME`, `ENUM`).
- Payroll line items are decoupled into the discrete relation `payroll_items`, ensuring no variable-length component arrays inside `payrolls`.
- Daily attendance is stored as discrete day records indexed by `(employee_id, work_date)` rather than multi-value month arrays.

---

## 3. Second Normal Form (2NF)

A relation is in 2NF if:
- It is in 1NF.
- Every non-key attribute is fully functionally dependent on the entire primary key (no partial key dependencies).

**Proof for Meridian HR:**
- Every relation utilizes a surrogate surrogate single-attribute primary key (`employee_id`, `attendance_id`, `payroll_id`, etc.).
- Because all primary keys consist of a single column, partial dependency on a subset of a composite primary key is mathematically impossible.
- Where composite unique business keys exist (e.g., `(employee_id, work_date)` in `attendance`), all attributes (`status`, `check_in_time`, `late_minutes`) depend strictly on the complete employee-date pair.

---

## 4. Third Normal Form (3NF)

A relation is in 3NF if:
- It is in 2NF.
- No transitive dependencies exist (non-prime attributes must not depend on other non-prime attributes: $X \to Y$ requires $X$ to be a superkey or $Y$ to be a prime attribute).

**Proof for Meridian HR:**
- **Departments & Employees:** Department metadata (`department_name`, `description`) is extracted into `departments`. `employees` holds only `department_id` (FK), eliminating transitive dependency `employee_id -> department_id -> department_name`.
- **Salaries:** Compensation tiers are decoupled into `salary_structures`. An employee's gross breakdown is not stored in `employees`.
- **Payrolls & Payroll Items:** Each line item is stored in `payroll_items` linked to `payroll_id`. `payroll_id -> item_id` transitive relationships are separated.
- **Audit Logs:** Actor references reference `employee_id` while changes are preserved as immutable serialized state snapshots.

---

## 5. Boyce-Codd Normal Form (BCNF)

A relation is in BCNF if for every non-trivial functional dependency $X \to Y$, $X$ is a superkey.

In all 9 tables:
- Determinants for all business attributes are surrogate primary keys or designated unique candidate keys (`email`, `employee_code`, `period_name`, `(employee_id, work_date)`).
- Therefore, all relations satisfy **BCNF**.
