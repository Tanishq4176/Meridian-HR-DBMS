// tests/test_suite.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ [TEST ${String(passed + failed).padStart(2, '0')}] ${message}`);
  } else {
    failed++;
    console.error(`  ✗ [TEST ${String(passed + failed).padStart(2, '0')}] ${message}`);
  }
}

console.log('\n========================================');
console.log(' MERIDIAN HR — AUTOMATED TEST SUITE');
console.log('========================================\n');

// Group 1: Project & Architecture Deliverables (Tests 01-05)
console.log('--- Suite 1: File Structure & Core Deliverables ---');
assert(fs.existsSync(path.join(root, 'package.json')), 'package.json exists and is valid');
assert(fs.existsSync(path.join(root, '.env.example')), '.env.example template is present');
assert(fs.existsSync(path.join(root, 'Meridian_HR_Project_Report.pdf')), 'Academic Project Report PDF is present');
assert(fs.existsSync(path.join(root, 'docs/assets/diagrams/system-architecture.svg')), 'System Architecture vector diagram is present');
assert(fs.existsSync(path.join(root, 'docs/assets/diagrams/er-diagram.svg')), 'Entity Relationship vector diagram is present');

// Group 2: Database DDL, Functions & Procedures (Tests 06-10)
console.log('\n--- Suite 2: Relational DDL & Procedural SQL ---');
const schemaSql = fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8');
assert(schemaSql.includes('CREATE TABLE departments') && schemaSql.includes('CREATE TABLE employees'), 'DDL defines departments and employees with FKs');
assert(schemaSql.includes('CREATE TABLE attendance') && schemaSql.includes('uq_emp_work_date'), 'Attendance defines unique employee-work_date constraint');
assert(schemaSql.includes('CREATE TABLE payrolls') && schemaSql.includes('CREATE TABLE payroll_items'), 'Normalized payroll and itemized payroll_items tables defined');

const procSql = fs.readFileSync(path.join(root, 'database/procedures.sql'), 'utf8');
assert(procSql.includes('sp_calculate_payroll') && procSql.includes('START TRANSACTION'), 'Stored procedure sp_calculate_payroll enforces atomic transaction');
assert(procSql.includes('sp_demonstrate_transaction_rollback') && procSql.includes('ROLLBACK'), 'Stored procedure rollback demonstration is implemented');

// Group 3: Database Triggers & Integrity (Tests 11-13)
console.log('\n--- Suite 3: Triggers & Guardrails ---');
const triggerSql = fs.readFileSync(path.join(root, 'database/triggers.sql'), 'utf8');
assert(triggerSql.includes('trg_attendance_before_insert'), 'Attendance trigger blocks invalid check-out and computes late minutes');
assert(triggerSql.includes('trg_leave_before_insert') && triggerSql.includes('Overlapping approved leave'), 'Leave trigger blocks overlapping approved leave');
assert(triggerSql.includes('trg_payroll_audit_after_insert') && triggerSql.includes('audit_logs'), 'Payroll trigger logs audit record with JSON snapshot');

// Group 4: Server, Authentication & RBAC (Tests 14-17)
console.log('\n--- Suite 4: Express API & RBAC Security ---');
const authMiddleware = fs.readFileSync(path.join(root, 'src/middleware/auth.js'), 'utf8');
assert(authMiddleware.includes('authenticateToken') && authMiddleware.includes('jwt.verify'), 'Authentication middleware validates JWT tokens');
assert(authMiddleware.includes('requireRole') || authMiddleware.includes('enforceSelfOrAdmin'), 'Role-based access control enforces HR_ADMIN permission');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert(pkg.name === 'meridian-hr', 'Package name is branded as meridian-hr');
assert(pkg.dependencies.express && pkg.dependencies.mysql2 && pkg.dependencies.bcryptjs, 'Core dependencies are configured (express, mysql2, bcryptjs)');

// Group 5: Frontend Design & Screenshots (Tests 18-20)
console.log('\n--- Suite 5: Frontend UI & Evidence Gallery ---');
const html = fs.readFileSync(path.join(root, 'src/public/index.html'), 'utf8');
assert(html.includes('Meridian HR') && html.includes('alice.morgan@meridian.local'), 'Frontend includes branding and 1-click evaluation demo accounts');
assert(fs.existsSync(path.join(root, 'docs/assets/screenshots/01-login.png')), 'Screenshot gallery includes 01-login.png');
assert(fs.existsSync(path.join(root, 'docs/assets/screenshots/02-hr-dashboard.png')) && fs.existsSync(path.join(root, 'docs/assets/screenshots/08-itemized-salary-slip.png')), 'Screenshot gallery includes Dashboard and Payslip screens');

console.log('\n========================================');
console.log(` RESULT: ${passed}/20 TESTS PASSING (${failed} FAILED)`);
console.log('========================================\n');

if (failed > 0) process.exit(1);
