'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const task = process.argv[2] || 'setup';
const files = { setup: 'database/setup.sql', seed: 'database/seed.sql' };
if (!Object.prototype.hasOwnProperty.call(files, task)) {
  console.error('Usage: node scripts/run-sql.js <setup|seed>');
  process.exit(2);
}
const inputFile = path.resolve(__dirname, '..', files[task]);
const sql = fs.readFileSync(inputFile, 'utf8');
const args = [
  '--default-character-set=utf8mb4',
  '-u', process.env.DB_USER || 'root',
  '-h', process.env.DB_HOST || '127.0.0.1',
  '-P', process.env.DB_PORT || '3306'
];
if (process.env.DB_PASSWORD) args.push(`--password=${process.env.DB_PASSWORD}`);
const database = task === 'seed' ? (process.env.DB_NAME || 'meridian_hr') : undefined;
if (database) args.push(database);

let lastError;
for (const executable of ['mariadb', 'mysql']) {
  const result = spawnSync(executable, args, {
    cwd: path.resolve(__dirname, '..'),
    input: sql,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: process.env
  });
  if (result.error && result.error.code === 'ENOENT') {
    lastError = result.error;
    continue;
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status === null ? 1 : result.status);
}
console.error('Could not find either the mariadb or mysql command-line client on PATH.');
if (lastError) console.error(lastError.message);
process.exit(1);
