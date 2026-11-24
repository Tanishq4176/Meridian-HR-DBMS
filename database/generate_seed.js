'use strict';
const fs = require('node:fs');
const path = require('node:path');

const quote = (value) => value === null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
const departments = [
  [1, 'People & Culture', 'People operations, hiring and employee experience'],
  [2, 'Engineering', 'Product engineering, infrastructure and quality'],
  [3, 'Finance', 'Accounting, planning and compliance'],
  [4, 'Commercial', 'Marketing, partnerships and sales'],
  [5, 'Operations', 'Business operations and customer support']
];
const adminHash = '$2b$10$Fuw2o5MEL5KbrWtatGGYaea17..nAff99Na7gm/0cVUddyUxRH4dq';
const employeeHash = '$2b$10$B6foq2PtaZiyK1zyUc.Re.JXTfM2TDkT6L.cNHhd1my595grgnfq.';
const employees = [
  [1,'MDN001','Alice','Morgan','alice.morgan@meridian.local','+91 98100 10001',1,'Head of People','HR_ADMIN',adminHash,'2022-01-15',95000,38000,17000,11400,200],
  [2,'MDN002','Robert','Chen','robert.chen@meridian.local','+91 98100 10002',2,'Engineering Manager','HR_ADMIN',adminHash,'2022-03-01',88000,35200,16800,10560,200],
  [3,'MDN003','Sarah','Jenkins','sarah.jenkins@meridian.local','+91 98100 10003',2,'Senior Product Designer','EMPLOYEE',employeeHash,'2023-04-10',72000,28800,12000,8640,200],
  [4,'MDN004','David','Miller','david.miller@meridian.local','+91 98100 10004',2,'Backend Engineer','EMPLOYEE',employeeHash,'2023-08-21',68000,27200,10000,8160,200],
  [5,'MDN005','Elena','Rostova','elena.rostova@meridian.local','+91 98100 10005',3,'Finance Analyst','EMPLOYEE',employeeHash,'2024-02-12',62000,24800,9000,7440,200],
  [6,'MDN006','Aisha','Khan','aisha.khan@meridian.local','+91 98100 10006',4,'Marketing Lead','EMPLOYEE',employeeHash,'2024-05-06',58000,23200,8500,6960,200],
  [7,'MDN007','Liam','Patel','liam.patel@meridian.local','+91 98100 10007',5,'Operations Specialist','EMPLOYEE',employeeHash,'2024-07-18',48000,19200,7000,5760,200]
];
const periods = [
  [1,'September 2026','2026-09-01','2026-09-30',22,'CLOSED'],
  [2,'October 2026','2026-10-01','2026-10-31',22,'FINALIZED'],
  [3,'November 2026','2026-11-01','2026-11-30',21,'OPEN']
];
const leaves = [
  [3,'CASUAL','2026-10-12','2026-10-12',1,'Personal appointment','APPROVED',1,'2026-10-08 10:30:00','Approved'],
  [5,'SICK','2026-11-26','2026-11-27',2,'Medical appointment','PENDING',null,null,null],
  [6,'PAID','2026-09-18','2026-09-18',1,'Personal day','APPROVED',1,'2026-09-15 12:00:00','Approved']
];
const pad = (value) => String(value).padStart(2, '0');
const isWeekday = (date) => ![0, 6].includes(date.getDay());
const approvedLeave = (employeeId, isoDate) => leaves.find((leave) => leave[0] === employeeId && leave[6] === 'APPROVED' && isoDate >= leave[2] && isoDate <= leave[3]);
const attendance = [];
for (const period of periods) {
  const start = new Date(`${period[2]}T00:00:00`);
  const end = new Date(`${period[3]}T00:00:00`);
  const cutoff = period[0] === 3 ? new Date('2026-11-23T00:00:00') : end;
  for (const date = new Date(start); date <= end && date <= cutoff; date.setDate(date.getDate() + 1)) {
    if (!isWeekday(date)) continue;
    const iso = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
    for (const employee of employees) {
      const empId = employee[0];
      const leave = approvedLeave(empId, iso);
      if (leave) {
        attendance.push(`(${empId},${quote(iso)},'ON_LEAVE',NULL,NULL,'Approved ${leave[1].toLowerCase()} leave')`);
        continue;
      }
      const absent = ((date.getDate() + empId * 7 + period[0] * 3) % 47 === 0) && empId !== 1;
      if (absent) {
        attendance.push(`(${empId},${quote(iso)},'ABSENT',NULL,NULL,'Unplanned absence')`);
        continue;
      }
      const isLate = ((date.getDate() + empId * 5 + period[0]) % (empId === 4 ? 8 : 17) === 0);
      const minute = isLate ? 18 + ((date.getDate() + empId) % 23) : (empId % 2 ? 50 + (date.getDate() % 10) : 3 + (date.getDate() % 10));
      const hour = isLate ? 9 : (empId % 2 ? 8 : 9);
      const mins = minute % 60;
      const checkIn = `${pad(hour)}:${pad(mins)}:00`;
      const checkOut = `18:${pad((date.getDate() + empId) % 18)}:00`;
      const remark = isLate ? ((empId + date.getDate()) % 2 ? 'Traffic delay' : 'Public transport delay') : 'On time';
      attendance.push(`(${empId},${quote(iso)},'PRESENT',${quote(checkIn)},${quote(checkOut)},${quote(remark)})`);
    }
  }
}

const sql = [
  'USE meridian_hr;',
  'DELETE FROM payroll_items;','DELETE FROM payrolls;','DELETE FROM attendance;',
  'DELETE FROM leaves;','DELETE FROM salary_structures;','DELETE FROM audit_logs;',
  'DELETE FROM employees;','DELETE FROM departments;','DELETE FROM payroll_periods;','',
  '-- Sample organisation departments',
  'INSERT INTO departments (department_id, department_name, description) VALUES',
  departments.map((row) => `(${row[0]},${quote(row[1])},${quote(row[2])})`).join(',\n')+';','',
  '-- Fictional demo employees. Admin123! for HR admins; Employee123! for employees.',
  'INSERT INTO employees (employee_id,employee_code,first_name,last_name,email,phone,department_id,designation,role,password_hash,hire_date,status) VALUES',
  employees.map((row) => `(${row.slice(0,11).map((value) => typeof value === 'number' ? value : quote(value)).join(',')},'ACTIVE')`).join(',\n')+';','',
  'INSERT INTO salary_structures (employee_id,basic_salary,hra,special_allowance,provident_fund,professional_tax,effective_date,is_active) VALUES',
  employees.map((row) => `(${row[0]},${row[11]},${row[12]},${row[13]},${row[14]},${row[15]},${quote(row[10])},TRUE)`).join(',\n')+';','',
  'INSERT INTO payroll_periods (period_id,period_name,start_date,end_date,total_working_days,status) VALUES',
  periods.map((row) => `(${row[0]},${quote(row[1])},${quote(row[2])},${quote(row[3])},${row[4]},${quote(row[5])})`).join(',\n')+';','',
  'INSERT INTO leaves (employee_id,leave_type,start_date,end_date,total_days,reason,status,actioned_by,actioned_on,admin_remarks) VALUES',
  leaves.map((row) => `(${row.map((value, index) => index === 0 || index === 4 || index === 7 ? (value === null ? 'NULL' : value) : quote(value)).join(',')})`).join(',\n')+';','',
  `-- ${attendance.length} weekday attendance rows through 23 November 2026.`,
  'INSERT INTO attendance (employee_id,work_date,status,check_in_time,check_out_time,remarks) VALUES',
  attendance.join(',\n')+';','',
  '-- Process two complete historical payroll cycles; November remains open.',
  'CALL sp_process_bulk_payroll(1,1,@september_processed,@september_errors);',
  'CALL sp_process_bulk_payroll(2,1,@october_processed,@october_errors);',
  "SELECT 'Meridian HR sample organisation created' AS status, @september_processed AS september_payroll_records, @october_processed AS october_payroll_records;"
].join('\n');

const output = path.join(__dirname, 'seed.sql');
fs.writeFileSync(output, sql + '\n', 'utf8');
console.log(`Wrote ${attendance.length} attendance rows to ${output}`);
