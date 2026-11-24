'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const required = [
  'package.json', '.env.example', 'README.md',
  'src/server.js', 'src/app.js', 'src/middleware/auth.js',
  'src/public/index.html', 'src/public/css/style.css', 'src/public/js/app.js',
  'src/routes/authRoutes.js', 'src/routes/employeeRoutes.js',
  'src/routes/attendanceRoutes.js', 'src/routes/leaveRoutes.js',
  'src/routes/payrollRoutes.js', 'src/routes/reportRoutes.js',
  'src/routes/salaryRoutes.js', 'src/routes/auditRoutes.js',
  'database/schema.sql', 'database/seed.sql', 'database/generate_seed.js', 'database/functions.sql',
  'database/procedures.sql', 'database/triggers.sql', 'database/reports.sql', 'scripts/run-sql.js'
];
let failures = 0;
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing required file: ${relative}`);
    failures += 1;
  }
}
const jsFiles = [];
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith('.js')) jsFiles.push(full);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'tests'));
walk(path.join(root, 'database'));
walk(path.join(root, 'scripts'));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Syntax check failed: ${path.relative(root, file)}\n${result.stderr}`);
    failures += 1;
  }
}
const html = fs.readFileSync(path.join(root, 'src/public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/public/css/style.css'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.name !== 'meridian-hr') { console.error('Project package name was not rebranded.'); failures += 1; }
if (!html.includes('Meridian HR')) { console.error('Frontend brand check failed.'); failures += 1; }
if (!css.includes('--accent: #a95e43') || !css.includes('--paper: #f5f4f0') || css.includes('linear-gradient(')) { console.error('Neutral Meridian design tokens missing.'); failures += 1; }
if (failures) {
  console.error(`Smoke test failed with ${failures} issue(s).`);
  process.exit(1);
}
console.log(`Meridian HR smoke checks passed (${required.length} required files, ${jsFiles.length} JavaScript syntax checks).`);
