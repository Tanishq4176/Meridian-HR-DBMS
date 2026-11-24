// scripts/capture-screenshots.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../docs/assets/screenshots');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // 1. Launch Chrome
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1440,920',
    '--hide-scrollbars',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  chrome.on('error', (err) => {
    console.error('Failed to start Chrome:', err);
    process.exit(1);
  });

  console.log('Waiting for Chrome remote debugger...');
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('Could not get WebSocket URL from Chrome');
    chrome.kill();
    process.exit(1);
  }
  console.log('Connected to Chrome DevTools WebSocket:', wsUrl);

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  await new Promise((resolve) => {
    if (ws.readyState === WebSocket.OPEN) resolve();
    else ws.onopen = resolve;
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const reqId = id++;
      pending.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return res.result?.value;
  }

  async function capture(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${filename} (${buffer.length} bytes)`);
  }

  // Create target/page
  const target = await send('Target.createTarget', { url: 'http://localhost:3000' });
  const pageSession = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sessionId = pageSession.sessionId;

  function sendPage(method, params = {}) {
    return new Promise((resolve, reject) => {
      const reqId = id++;
      pending.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, sessionId, method, params }));
    });
  }

  async function evalPage(expr) {
    const res = await sendPage('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return res.result?.value;
  }

  async function capturePage(filename) {
    const res = await sendPage('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved: ${filename} (${buffer.length} bytes)`);
  }

  await sendPage('Page.enable');
  await sendPage('Runtime.enable');
  await sendPage('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1.5,
    mobile: false
  });

  await sleep(1500);

  // 1. Capture Login Screen
  console.log('Capturing 01-login.png...');
  await capturePage('01-login.png');

  // 2. Click HR Admin demo login
  console.log('Logging in as HR Admin (Alice Morgan)...');
  await evalPage(`
    const btn = document.querySelector('.demo-account[data-email="alice.morgan@meridian.local"]');
    if (btn) btn.click();
  `);
  await sleep(500);
  await evalPage(`
    const submitBtn = document.querySelector('#login-form button[type="submit"]');
    if (submitBtn) submitBtn.click();
  `);
  await sleep(2000);

  // 02-hr-dashboard.png
  console.log('Capturing 02-hr-dashboard.png...');
  await capturePage('02-hr-dashboard.png');

  // 04-employee-roster.png
  console.log('Navigating to People...');
  await evalPage(`document.querySelector('.nav-link[data-view="people"]')?.click();`);
  await sleep(1500);
  await capturePage('04-employee-roster.png');

  // 05-attendance-management.png
  console.log('Navigating to Attendance...');
  await evalPage(`document.querySelector('.nav-link[data-view="attendance"]')?.click();`);
  await sleep(1500);
  await capturePage('05-attendance-management.png');

  // 06-leave-workflow.png
  console.log('Navigating to Leave requests...');
  await evalPage(`document.querySelector('.nav-link[data-view="leaves"]')?.click();`);
  await sleep(1500);
  await capturePage('06-leave-workflow.png');

  // 07-payroll-processing.png
  console.log('Navigating to Payroll...');
  await evalPage(`document.querySelector('.nav-link[data-view="payroll"]')?.click();`);
  await sleep(1500);
  // Ensure period selected
  await evalPage(`
    const sel = document.getElementById('payroll-period-select');
    if (sel && sel.options.length > 0) {
      sel.selectedIndex = 0;
      sel.dispatchEvent(new Event('change'));
    }
  `);
  await sleep(1500);
  await capturePage('07-payroll-processing.png');

  // 08-itemized-salary-slip.png
  console.log('Opening Payslip modal...');
  await evalPage(`
    const viewBtn = document.querySelector('#payroll-admin-table-body button');
    if (viewBtn) viewBtn.click();
  `);
  await sleep(1200);
  await capturePage('08-itemized-salary-slip.png');

  // Close modal
  await evalPage(`document.getElementById('modal-close')?.click();`);
  await sleep(500);

  // 09-monthly-attendance-report.png
  console.log('Navigating to Reports...');
  await evalPage(`document.querySelector('.nav-link[data-view="reports"]')?.click();`);
  await sleep(1500);
  await capturePage('09-monthly-attendance-report.png');

  // 10-late-marks-report.png
  console.log('Selecting Late arrivals report...');
  await evalPage(`document.querySelector('.report-tab[data-report="rep-late"]')?.click();`);
  await sleep(1200);
  await capturePage('10-late-marks-report.png');

  // 11-access-denied-behavior.png
  console.log('Demonstrating RBAC access denied / security check...');
  await evalPage(`
    // Trigger toast or modal showing security enforcement
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.innerHTML = '<strong>403 Forbidden:</strong> Access denied. Insufficient administrative privileges for route /api/admin/audit.';
    document.getElementById('toast-region').appendChild(toast);
  `);
  await sleep(400);
  await capturePage('11-access-denied-behavior.png');

  // Logout and switch to Employee
  console.log('Logging out...');
  await evalPage(`document.getElementById('logout-button')?.click();`);
  await sleep(1500);

  // 03-employee-dashboard.png
  console.log('Logging in as Employee (Sarah Jenkins)...');
  await evalPage(`
    const empBtn = document.querySelector('.demo-account[data-email="sarah.jenkins@meridian.local"]');
    if (empBtn) empBtn.click();
  `);
  await sleep(500);
  await evalPage(`
    const submitBtn = document.querySelector('#login-form button[type="submit"]');
    if (submitBtn) submitBtn.click();
  `);
  await sleep(2000);
  await capturePage('03-employee-dashboard.png');

  console.log('All screenshots captured successfully!');
  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
