'use strict';

const TOKEN_KEY = 'meridian_hr_token';
let currentUser = null;
let currentToken = localStorage.getItem(TOKEN_KEY) || '';
let appData = { employees: [], attendance: [], leaves: [], payrolls: [], periods: [] };
let activeReport = 'rep-attendance';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const initials = (user) => `${(user?.first_name || 'M')[0]}${(user?.last_name || 'H')[0]}`.toUpperCase();
const fullName = (person) => [person?.first_name, person?.last_name].filter(Boolean).join(' ') || person?.full_name || '—';
const roleLabel = (role) => role === 'HR_ADMIN' ? 'HR ADMINISTRATOR' : 'EMPLOYEE';
const isHR = () => currentUser?.role === 'HR_ADMIN';
const localISODate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
}).format(Number(value || 0));
const dateText = (value, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!value) return '—';
  const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', options);
};
const dateTimeText = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const timeText = (value) => value ? String(value).slice(0, 5) : '—';
const statusBadge = (status) => {
  const key = String(status || '').toUpperCase();
  const cls = ['ACTIVE', 'PRESENT', 'APPROVED', 'PAID', 'FINALIZED', 'CLOSED', 'PROCESSED'].includes(key)
    ? 'badge-success'
    : ['PENDING', 'OPEN', 'PROCESSING', 'LATE', 'CALCULATED'].includes(key)
      ? 'badge-warning'
      : ['REJECTED', 'ABSENT', 'INACTIVE', 'TERMINATED', 'CANCELLED'].includes(key)
        ? 'badge-danger' : 'badge-neutral';
  return `<span class="badge ${cls}">${esc(key.replaceAll('_', ' '))}</span>`;
};

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    signOut(false);
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!response.ok || body.success === false) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function setText(id, value) { if ($(id)) $(id).textContent = value; }
function showToast(message, type = 'info') {
  const region = $('toast-region');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  region.appendChild(item);
  window.setTimeout(() => item.remove(), 3600);
}
function setTableMessage(id, message, colspan) {
  const body = $(id);
  if (body) body.innerHTML = `<tr><td class="empty-cell" colspan="${colspan}">${esc(message)}</td></tr>`;
}
function setSelectOptions(id, periods, includeAll = false) {
  const select = $(id);
  if (!select) return;
  const oldValue = select.value;
  const all = includeAll ? '<option value="">All available dates</option>' : '';
  select.innerHTML = all + periods.map((period) => `<option value="${period.period_id}">${esc(period.period_name)}</option>`).join('');
  if (oldValue && [...select.options].some((option) => option.value === oldValue)) select.value = oldValue;
  else if (periods.length && !includeAll) select.value = String(periods[0].period_id);
}
function emptyState(message, colspan) { return `<tr><td colspan="${colspan}" class="empty-cell">${esc(message)}</td></tr>`; }

async function login(email, password) {
  setText('login-error', '');
  try {
    const result = await apiFetch('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    });
    currentToken = result.token;
    localStorage.setItem(TOKEN_KEY, currentToken);
    currentUser = result.user;
    renderAuthenticatedUI();
    await loadDashboard();
  } catch (error) {
    setText('login-error', error.message || 'Unable to sign in. Check your details.');
  }
}

async function checkSession() {
  if (!currentToken) return;
  try {
    const result = await apiFetch('/api/auth/me');
    currentUser = result.user;
    renderAuthenticatedUI();
    await loadDashboard();
  } catch (error) {
    console.info('No active Meridian HR session:', error.message);
  }
}

function renderAuthenticatedUI() {
  $('auth-screen').hidden = true;
  $('app-container').hidden = false;
  $('hr-nav-group').hidden = !isHR();
  $('employee-nav-group').hidden = isHR();
  $('dash-actions').hidden = !isHR();
  $('hr-metrics').hidden = !isHR();
  $('hr-dashboard-grid').hidden = !isHR();
  $('employee-overview').hidden = isHR();
  $('employee-dashboard-lower').hidden = isHR();
  $('people-nav-count').textContent = '—';
  $('nav-user-name').textContent = fullName(currentUser);
  $('nav-user-role').textContent = roleLabel(currentUser.role);
  $('nav-avatar').textContent = initials(currentUser);
  $('topbar-avatar').textContent = initials(currentUser);
  $('today-label').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  $('dash-eyebrow').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
  $('dash-greeting').textContent = `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, ${currentUser.first_name}.`;
  $('dash-subtitle').textContent = isHR()
    ? 'A clear view of people, timekeeping and payroll across the organisation.'
    : `${currentUser.department || currentUser.department_name || 'Your team'} · ${currentUser.designation || 'Employee workspace'}`;
  $('employee-welcome-title').textContent = `Good to see you, ${currentUser.first_name}.`;
  $('attendance-page-title').textContent = isHR() ? 'Attendance' : 'My attendance';
  $('leave-page-title').textContent = isHR() ? 'Leave requests' : 'My leave';
  $('apply-leave-button').hidden = isHR();
  $('attendance-clock-button').hidden = isHR();
  $('employee-clock-button').hidden = isHR();
  $('quick-leave-button').hidden = !isHR();
  $('quick-add-person').hidden = !isHR();
  switchView('overview', false);
}

function signOut(showMessage = true) {
  if (currentToken) {
    fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${currentToken}` }, credentials: 'same-origin' }).catch(() => {});
  }
  currentToken = '';
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  if ($('auth-screen')) $('auth-screen').hidden = false;
  if ($('app-container')) $('app-container').hidden = true;
  if (showMessage) setText('login-error', 'You have signed out.');
}

function switchView(view, shouldLoad = true) {
  document.querySelectorAll('.view-section').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  document.querySelectorAll('.nav-link[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const labels = { overview: 'Overview', people: 'People', attendance: 'Attendance', leaves: 'Leave requests', payroll: 'Payroll', payslips: 'Pay statements', reports: 'Reports', audit: 'Audit trail' };
  setText('page-crumb', labels[view] || 'Overview');
  if (!shouldLoad) return;
  if (view === 'overview') loadDashboard();
  if (view === 'people' && isHR()) loadEmployees();
  if (view === 'attendance') loadAttendance();
  if (view === 'leaves') loadLeaves();
  if (view === 'payroll' && isHR()) loadPayroll();
  if (view === 'payslips' && !isHR()) loadPayslips();
  if (view === 'reports' && isHR()) refreshCurrentReport();
  if (view === 'audit' && isHR()) loadAuditLogs();
}

async function loadDashboard() {
  if (!currentUser) return;
  try {
    const [periodData, employeeData, attendanceData, leaveData, payrollData] = await Promise.all([
      apiFetch('/api/payroll/periods'),
      isHR() ? apiFetch('/api/employees') : Promise.resolve({ employees: [] }),
      apiFetch('/api/attendance'),
      apiFetch('/api/leaves'),
      apiFetch('/api/payroll')
    ]);
    appData.periods = periodData.periods || [];
    appData.employees = employeeData.employees || [];
    appData.attendance = attendanceData.attendance || [];
    appData.leaves = leaveData.leaves || [];
    appData.payrolls = payrollData.payrolls || [];
    setSelectOptions('payroll-period-select', appData.periods);
    setSelectOptions('report-period-select', appData.periods);
    if (appData.payrolls.length && $('payroll-period-select')) {
      $('payroll-period-select').value = String(appData.payrolls[0].period_id);
    }
    setSelectOptions('attendance-period-filter', appData.periods, true);
    if (isHR()) renderHrDashboard(); else renderEmployeeDashboard();
  } catch (error) {
    showToast(error.message || 'Could not load the dashboard.', 'error');
  }
}

function renderHrDashboard() {
  const employees = appData.employees.filter((person) => person.status === 'ACTIVE');
  const departments = new Set(employees.map((person) => person.department_name).filter(Boolean));
  const today = localISODate();
  let todaysRows = appData.attendance.filter((row) => String(row.work_date).slice(0, 10) === today);
  let note = 'Today’s recorded attendance';
  if (!todaysRows.length && appData.attendance.length) {
    const latest = String(appData.attendance[0].work_date).slice(0, 10);
    todaysRows = appData.attendance.filter((row) => String(row.work_date).slice(0, 10) === latest);
    note = `Latest records · ${dateText(latest)}`;
  }
  const present = todaysRows.filter((row) => ['PRESENT', 'HALF_DAY'].includes(row.status)).length;
  const pending = appData.leaves.filter((leave) => leave.status === 'PENDING');
  setText('metric-people', employees.length);
  setText('metric-departments', `${departments.size} departments`);
  setText('metric-attendance', `${present} / ${todaysRows.length}`);
  setText('metric-attendance-note', note);
  setText('metric-leaves', pending.length);
  setText('metric-payroll', appData.periods.length);
  setText('metric-payroll-note', `${appData.payrolls.length} payroll records`);
  setText('people-nav-count', employees.length);
  setText('leave-nav-count', pending.length);
  setText('pending-panel-count', `${pending.length} pending`);
  renderPeriodRows('dash-payroll-body', appData.periods, 5);
  renderDepartmentBreakdown(employees);
  renderPendingPreview(pending);
  renderAttendancePreview(appData.attendance, 'attendance-preview');
}

function renderEmployeeDashboard() {
  const todayRecord = appData.attendance.find((row) => String(row.work_date).slice(0, 10) === localISODate());
  const clockButton = $('employee-clock-button');
  const attendanceButton = $('attendance-clock-button');
  let clockLabel = 'Clock in';
  let clockDisabled = false;
  if (todayRecord?.check_in_time && todayRecord?.check_out_time) { clockLabel = 'Attendance complete'; clockDisabled = true; }
  else if (todayRecord?.check_in_time) clockLabel = 'Clock out';
  else if (todayRecord && !todayRecord.check_in_time) { clockLabel = 'Attendance unavailable'; clockDisabled = true; }
  if (clockButton) { clockButton.innerHTML = `${clockLabel} <span>→</span>`; clockButton.disabled = clockDisabled; }
  if (attendanceButton) { attendanceButton.textContent = clockLabel; attendanceButton.disabled = clockDisabled; }
  setText('employee-pay-count', appData.payrolls.length);
  setText('employee-leave-count', appData.leaves.length);
  renderAttendancePreview(appData.attendance, 'employee-attendance-preview');
  const payslips = appData.payrolls.slice(0, 4);
  $('employee-payslip-preview').innerHTML = payslips.length ? payslips.map((slip) => `
    <div class="activity-item"><span class="activity-mark">₹</span><div class="activity-copy"><strong>${esc(slip.period_name)}</strong><small>Net pay · ${esc(money(slip.net_salary))}</small></div><span>${statusBadge(slip.payment_status)}</span></div>`).join('') : '<p class="empty-cell">No pay statements available yet.</p>';
}

function renderPeriodRows(targetId, periods, colspan) {
  const tbody = $(targetId);
  if (!tbody) return;
  tbody.innerHTML = periods.length ? periods.map((period) => `
    <tr><td><strong>${esc(period.period_name)}</strong></td><td>${dateText(period.start_date)} – ${dateText(period.end_date)}</td><td>${esc(period.total_working_days)} days</td><td>${statusBadge(period.status)}</td><td><button class="table-action" data-open-view="payroll">Review</button></td></tr>`).join('') : emptyState('No payroll periods found.', colspan);
}

function renderDepartmentBreakdown(employees) {
  const counts = employees.reduce((map, person) => {
    const key = person.department_name || 'Unassigned';
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = employees.length || 1;
  $('department-breakdown').innerHTML = rows.length ? rows.map(([name, count]) => `
    <div class="department-row"><div class="department-label"><strong>${esc(name)}</strong><span>${count} ${count === 1 ? 'person' : 'people'}</span></div><div class="department-track"><span style="width:${Math.round(count / total * 100)}%"></span></div></div>`).join('') : '<p class="empty-cell">No department data available.</p>';
}

function renderPendingPreview(pending) {
  $('pending-preview').innerHTML = pending.length ? pending.slice(0, 5).map((leave) => `
    <div class="activity-item"><span class="activity-mark">${esc((leave.full_name || '?').split(' ').map((part) => part[0]).slice(0, 2).join(''))}</span><div class="activity-copy"><strong>${esc(leave.full_name)}</strong><small>${esc(leave.leave_type)} · ${dateText(leave.start_date)}</small></div><span class="activity-time">${esc(leave.total_days)}d</span></div>`).join('') : '<p class="empty-cell">No requests need review.</p>';
}

function renderAttendancePreview(rows, targetId) {
  const target = $(targetId);
  if (!target) return;
  target.innerHTML = rows.slice(0, 5).map((row) => `
    <div class="activity-item"><span class="activity-mark">◷</span><div class="activity-copy"><strong>${esc(row.full_name || fullName(row))}</strong><small>${dateText(row.work_date)} · ${timeText(row.check_in_time)}</small></div><span>${statusBadge(row.status)}</span></div>`).join('') || '<p class="empty-cell">No attendance records available.</p>';
}

async function loadEmployees() {
  setTableMessage('employees-table-body', 'Loading people…', 7);
  try {
    const data = await apiFetch('/api/employees');
    appData.employees = data.employees || [];
    renderEmployees();
  } catch (error) { setTableMessage('employees-table-body', error.message, 7); }
}
function renderEmployees() {
  const query = ($('people-search').value || '').trim().toLowerCase();
  const people = appData.employees.filter((person) => [fullName(person), person.employee_code, person.department_name, person.designation, person.email].join(' ').toLowerCase().includes(query));
  $('people-count-label').textContent = `${people.length} of ${appData.employees.length} people`;
  $('employees-table-body').innerHTML = people.length ? people.map((person) => `
    <tr><td><div class="person-cell"><span class="person-avatar">${esc(initials(person))}</span><span><strong>${esc(fullName(person))}</strong><small>${esc(person.email)}</small></span></div></td><td><code>${esc(person.employee_code)}</code></td><td>${esc(person.department_name)}</td><td>${esc(person.designation)}</td><td>${statusBadge(person.role === 'HR_ADMIN' ? 'HR ADMIN' : 'EMPLOYEE')}</td><td><strong>${esc(money(person.gross_salary || person.basic_salary))}</strong></td><td>${statusBadge(person.status)}</td></tr>`).join('') : emptyState('No people match that search.', 7);
}

async function loadAttendance() {
  setTableMessage('attendance-table-body', 'Loading attendance…', 7);
  try {
    const period = $('attendance-period-filter')?.value;
    const data = await apiFetch(`/api/attendance${period ? `?periodId=${encodeURIComponent(period)}` : ''}`);
    appData.attendance = data.attendance || [];
    renderAttendanceTable();
  } catch (error) { setTableMessage('attendance-table-body', error.message, 7); }
}
function renderAttendanceTable() {
  const query = ($('attendance-search').value || '').toLowerCase().trim();
  const rows = appData.attendance.filter((row) => [row.full_name, row.employee_code, row.department_name, row.status].join(' ').toLowerCase().includes(query));
  $('attendance-count-label').textContent = `${rows.length} records`;
  $('attendance-table-body').innerHTML = rows.length ? rows.map((row) => `
    <tr><td><strong>${dateText(row.work_date)}</strong></td><td><div class="person-cell"><span class="person-avatar">${esc(initials({ first_name: (row.full_name || '?').split(' ')[0], last_name: (row.full_name || '?').split(' ').slice(1).join(' ') }))}</span><span><strong>${esc(row.full_name)}</strong><small>${esc(row.employee_code)}</small></span></div></td><td>${esc(row.department_name)}</td><td>${statusBadge(row.status)}</td><td>${timeText(row.check_in_time)}</td><td>${timeText(row.check_out_time)}</td><td>${row.is_late ? `<span class="late-label">${esc(row.late_minutes)} min late</span>` : '<span class="muted">On time</span>'}</td></tr>`).join('') : emptyState('No attendance records found.', 7);
}

async function loadLeaves() {
  setTableMessage('leaves-table-body', 'Loading leave requests…', 8);
  try {
    const data = await apiFetch('/api/leaves');
    appData.leaves = data.leaves || [];
    if (isHR()) setText('leave-nav-count', appData.leaves.filter((leave) => leave.status === 'PENDING').length);
    renderLeaves();
  } catch (error) { setTableMessage('leaves-table-body', error.message, 8); }
}
function renderLeaves() {
  const query = ($('leave-search').value || '').toLowerCase().trim();
  const status = $('leave-status-filter').value;
  const rows = appData.leaves.filter((leave) => (!status || leave.status === status) && [leave.full_name, leave.employee_code, leave.leave_type, leave.reason].join(' ').toLowerCase().includes(query));
  $('leave-count-label').textContent = `${rows.length} requests`;
  $('leaves-table-body').innerHTML = rows.length ? rows.map((leave) => `
    <tr><td><strong>${esc(leave.full_name)}</strong><small class="table-subline">${esc(leave.employee_code)}</small></td><td>${esc(leave.leave_type)}</td><td>${dateText(leave.start_date)} – ${dateText(leave.end_date)}</td><td>${esc(leave.total_days)}</td><td class="reason-cell">${esc(leave.reason)}</td><td>${statusBadge(leave.status)}</td><td>${esc(leave.actioned_by_name || 'Awaiting review')}</td><td>${isHR() && leave.status === 'PENDING' ? `<div class="row-actions"><button class="mini-action approve" data-leave-action="APPROVED" data-leave-id="${leave.leave_id}">Approve</button><button class="mini-action reject" data-leave-action="REJECTED" data-leave-id="${leave.leave_id}">Decline</button></div>` : '—'}</td></tr>`).join('') : emptyState('No leave requests match these filters.', 8);
}

async function loadPayroll() {
  const periodId = $('payroll-period-select')?.value;
  setTableMessage('payroll-admin-table-body', 'Loading payroll…', 8);
  try {
    const data = await apiFetch(`/api/payroll${periodId ? `?periodId=${encodeURIComponent(periodId)}` : ''}`);
    appData.payrolls = data.payrolls || [];
    renderPayroll();
    const selected = appData.periods.find((period) => String(period.period_id) === String(periodId));
    setText('payroll-period-status', selected ? `${selected.period_name} · ${selected.status}` : 'All periods');
  } catch (error) { setTableMessage('payroll-admin-table-body', error.message, 8); }
}
function renderPayroll() {
  const rows = appData.payrolls;
  setText('payroll-count-label', `${rows.length} payroll records`);
  setText('payroll-gross-total', money(rows.reduce((sum, row) => sum + Number(row.gross_earnings || 0), 0)));
  setText('payroll-deduction-total', money(rows.reduce((sum, row) => sum + Number(row.total_deductions || 0), 0)));
  setText('payroll-net-total', money(rows.reduce((sum, row) => sum + Number(row.net_salary || 0), 0)));
  $('payroll-admin-table-body').innerHTML = rows.length ? rows.map((row) => `
    <tr><td><strong>${esc(row.full_name)}</strong><small class="table-subline">${esc(row.employee_code)}</small></td><td>${esc(row.department_name)}</td><td>${esc(row.present_days)} / ${esc(row.total_working_days)} days</td><td>${esc(money(row.gross_earnings))}</td><td class="negative-value">${esc(money(row.total_deductions))}</td><td><strong>${esc(money(row.net_salary))}</strong></td><td>${statusBadge(row.payment_status)}</td><td><button class="table-action" data-slip-id="${row.payroll_id}">View slip</button></td></tr>`).join('') : emptyState('No payroll records for this period. Process a pay run to create records.', 8);
}

async function loadPayslips() {
  setTableMessage('my-payslips-body', 'Loading pay statements…', 8);
  try {
    const data = await apiFetch('/api/payroll');
    appData.payrolls = data.payrolls || [];
    $('my-payslips-body').innerHTML = appData.payrolls.length ? appData.payrolls.map((row) => `
      <tr><td><strong>${esc(row.period_name)}</strong></td><td>${dateText(row.start_date)} – ${dateText(row.end_date)}</td><td>${esc(row.present_days)} / ${esc(row.total_working_days)}</td><td>${esc(money(row.gross_earnings))}</td><td class="negative-value">${esc(money(row.total_deductions))}</td><td><strong>${esc(money(row.net_salary))}</strong></td><td>${statusBadge(row.payment_status)}</td><td><button class="table-action" data-slip-id="${row.payroll_id}">Open statement</button></td></tr>`).join('') : emptyState('Your pay statements will appear here after payroll is processed.', 8);
  } catch (error) { setTableMessage('my-payslips-body', error.message, 8); }
}

async function loadAuditLogs() {
  setTableMessage('audit-table-body', 'Loading audit records…', 7);
  try {
    const data = await apiFetch('/api/audit-logs');
    const logs = data.logs || [];
    setText('audit-count-label', `${logs.length} recent events`);
    $('audit-table-body').innerHTML = logs.length ? logs.map((log) => {
      let details = log.new_values || '—';
      try { details = JSON.stringify(JSON.parse(log.new_values), null, 0); } catch { /* retain raw audit detail */ }
      return `<tr><td>#${esc(log.log_id)}</td><td>${dateTimeText(log.created_at)}</td><td><code>${esc(log.table_name)}</code></td><td>${esc(log.record_id)}</td><td>${statusBadge(log.action)}</td><td>${esc(log.actor_name || 'System')}</td><td class="audit-detail">${esc(details)}</td></tr>`;
    }).join('') : emptyState('No audit events have been recorded.', 7);
  } catch (error) { setTableMessage('audit-table-body', error.message, 7); }
}

function switchReport(reportId) {
  activeReport = reportId;
  document.querySelectorAll('.report-view').forEach((panel) => {
    const active = panel.id === reportId;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  document.querySelectorAll('.report-tab').forEach((button) => button.classList.toggle('active', button.dataset.report === reportId));
  refreshCurrentReport();
}
async function refreshCurrentReport() {
  const periodId = $('report-period-select')?.value || appData.periods[0]?.period_id || 1;
  const routes = {
    'rep-attendance': `/api/reports/attendance-summary?periodId=${periodId}`,
    'rep-late': `/api/reports/late-marks?periodId=${periodId}`,
    'rep-dept': `/api/reports/departmental?periodId=${periodId}`
  };
  const targetIds = { 'rep-attendance': ['rep-attendance-body', 9], 'rep-late': ['rep-late-body', 6], 'rep-dept': ['rep-dept-body', 6] };
  const [target, colspan] = targetIds[activeReport] || targetIds['rep-attendance'];
  setTableMessage(target, 'Preparing report…', colspan);
  try {
    const data = await apiFetch(routes[activeReport]);
    if (activeReport === 'rep-attendance') {
      const rows = data.summary || [];
      $(target).innerHTML = rows.length ? rows.map((row) => `<tr><td><code>${esc(row.employee_code)}</code></td><td><strong>${esc(row.full_name)}</strong></td><td>${esc(row.department_name)}</td><td>${esc(row.total_working_days)}</td><td>${esc(row.days_present)}</td><td>${esc(row.days_absent)}</td><td>${esc(row.days_on_leave)}</td><td>${esc(row.late_marks)}</td><td>${esc(row.attendance_percentage)}%</td></tr>`).join('') : emptyState('No attendance data for this period.', 9);
    } else if (activeReport === 'rep-late') {
      const rows = data.late_marks || [];
      $(target).innerHTML = rows.length ? rows.map((row) => `<tr><td><strong>${esc(row.full_name)}</strong><small class="table-subline">${esc(row.employee_code)}</small></td><td>${esc(row.department_name)}</td><td>${dateText(row.work_date)}</td><td>${timeText(row.check_in_time)}</td><td><span class="late-label">${esc(row.late_minutes)} min</span></td><td>${esc(row.remarks || '—')}</td></tr>`).join('') : emptyState('No late arrivals recorded in this period.', 6);
    } else {
      const rows = data.departments || [];
      $(target).innerHTML = rows.length ? rows.map((row) => `<tr><td><strong>${esc(row.department_name)}</strong></td><td>${esc(row.employee_count)}</td><td>${esc(money(row.total_gross_earnings))}</td><td class="negative-value">${esc(money(row.total_deductions))}</td><td><strong>${esc(money(row.total_net_disbursed))}</strong></td><td>${esc(money(row.average_net_salary))}</td></tr>`).join('') : emptyState('No processed payroll data for this period.', 6);
    }
  } catch (error) { setTableMessage(target, error.message, colspan); }
}

function openModal(title, eyebrow, content) {
  setText('modal-title', title);
  setText('modal-eyebrow', eyebrow || 'WORKSPACE');
  $('modal-content').innerHTML = content;
  $('modal-backdrop').hidden = false;
  document.body.classList.add('modal-open');
  const focusable = $('modal-content').querySelector('input, select, textarea, button');
  if (focusable) focusable.focus();
}
function closeModal() { $('modal-backdrop').hidden = true; $('modal-content').innerHTML = ''; document.body.classList.remove('modal-open'); }
const field = (label, id, type = 'text', required = true, extra = '') => `<label class="form-field"><span>${label}</span><input id="${id}" type="${type}" ${required ? 'required' : ''} ${extra}></label>`;

function openAddEmployeeModal() {
  const departments = [...new Map(appData.employees.map((person) => [person.department_id, { id: person.department_id, name: person.department_name }])).values()];
  // The API's department IDs are taken from the employee list; seeded departments are present in a normal install.
  const options = departments.length ? departments.map((department) => `<option value="${department.id}">${esc(department.name)}</option>`).join('') : '<option value="1">Engineering</option><option value="2">Human Resources</option><option value="3">Finance & Accounting</option><option value="4">Marketing & Sales</option><option value="5">Operations & Support</option>';
  openModal('Add a person', 'PEOPLE DIRECTORY', `
    <form id="employee-form" class="modal-form"><div class="form-grid">
      ${field('Employee ID', 'new-code', 'text', true, 'placeholder="MDN008"')}
      ${field('First name', 'new-first')}${field('Last name', 'new-last')}
      ${field('Work email', 'new-email', 'email')}${field('Phone', 'new-phone', 'tel', false)}
      <label class="form-field"><span>Department</span><select id="new-dept" required>${options}</select></label>
      ${field('Designation', 'new-designation')}
      <label class="form-field"><span>Access role</span><select id="new-role"><option value="EMPLOYEE">Employee</option><option value="HR_ADMIN">HR administrator</option></select></label>
      ${field('Hire date', 'new-hire', 'date')}${field('Basic monthly pay (₹)', 'new-basic', 'number', true, 'min="0" step="0.01"')}
      ${field('House rent allowance (₹)', 'new-hra', 'number', false, 'min="0" step="0.01" value="0"')}
      ${field('Special allowance (₹)', 'new-special', 'number', false, 'min="0" step="0.01" value="0"')}
      ${field('Provident fund (₹)', 'new-pf', 'number', false, 'min="0" step="0.01" value="0"')}
      ${field('Professional tax (₹)', 'new-tax', 'number', false, 'min="0" step="0.01" value="0"')}
      ${field('Initial password', 'new-password', 'password', false, 'placeholder="Default: Employee123!"')}
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Create employee</button></div></form>`);
  $('employee-form').addEventListener('submit', submitAddEmployee);
}
async function submitAddEmployee(event) {
  event.preventDefault();
  const value = (id) => $(id).value;
  const payload = {
    employee_code: value('new-code'), first_name: value('new-first'), last_name: value('new-last'),
    email: value('new-email'), phone: value('new-phone'), department_id: Number(value('new-dept')),
    designation: value('new-designation'), role: value('new-role'), hire_date: value('new-hire'),
    basic_salary: Number(value('new-basic')), hra: Number(value('new-hra') || 0),
    special_allowance: Number(value('new-special') || 0), provident_fund: Number(value('new-pf') || 0),
    professional_tax: Number(value('new-tax') || 0), password: value('new-password') || undefined
  };
  try {
    await apiFetch('/api/employees', { method: 'POST', body: JSON.stringify(payload) });
    closeModal(); showToast('Employee profile created.', 'success'); await loadEmployees();
  } catch (error) { showToast(error.message, 'error'); }
}

function openApplyLeaveModal() {
  openModal('Request time off', 'EMPLOYEE SELF-SERVICE', `
    <form id="leave-form" class="modal-form"><div class="form-grid">
      <label class="form-field"><span>Leave type</span><select id="leave-type"><option value="CASUAL">Casual leave</option><option value="SICK">Sick leave</option><option value="PAID">Paid leave</option><option value="UNPAID">Unpaid leave</option></select></label>
      ${field('Start date', 'leave-start', 'date')}${field('End date', 'leave-end', 'date')}${field('Total days', 'leave-days', 'number', true, 'min="0.5" step="0.5"')}
    </div><label class="form-field"><span>Reason</span><textarea id="leave-reason" required rows="3" placeholder="Add a brief reason for your request"></textarea></label><div class="modal-actions"><button type="button" class="button button-outline" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Submit request</button></div></form>`);
  const updateDays = () => {
    const start = $('leave-start').value; const end = $('leave-end').value;
    if (start && end) {
      const days = Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1;
      $('leave-days').value = days > 0 ? days : '';
    }
  };
  $('leave-start').addEventListener('change', updateDays); $('leave-end').addEventListener('change', updateDays);
  $('leave-form').addEventListener('submit', submitLeaveRequest);
}
async function submitLeaveRequest(event) {
  event.preventDefault();
  const payload = {
    leave_type: $('leave-type').value, start_date: $('leave-start').value, end_date: $('leave-end').value,
    total_days: Number($('leave-days').value), reason: $('leave-reason').value.trim()
  };
  try {
    await apiFetch('/api/leaves', { method: 'POST', body: JSON.stringify(payload) });
    closeModal(); showToast('Leave request submitted for review.', 'success'); await loadLeaves();
  } catch (error) { showToast(error.message, 'error'); }
}
async function updateLeaveStatus(leaveId, status) {
  const action = status === 'APPROVED' ? 'approve' : 'decline';
  if (!window.confirm(`Are you sure you want to ${action} this leave request?`)) return;
  try {
    await apiFetch(`/api/leaves/${leaveId}/status`, { method: 'PUT', body: JSON.stringify({ status, admin_remarks: `Reviewed in Meridian HR` }) });
    showToast(`Leave request ${status.toLowerCase()}.`, 'success'); await loadLeaves();
    if (isHR()) setText('pending-panel-count', `${appData.leaves.filter((leave) => leave.status === 'PENDING').length} pending`);
  } catch (error) { showToast(error.message, 'error'); }
}

function openRunPayrollModal() {
  const options = appData.periods.map((period) => `<option value="${period.period_id}">${esc(period.period_name)} · ${esc(period.status)}</option>`).join('');
  const people = appData.employees.filter((person) => person.status === 'ACTIVE').map((person) => `<option value="${person.employee_id}">${esc(person.employee_code)} · ${esc(fullName(person))}</option>`).join('');
  openModal('Process payroll', 'PAYROLL OPERATIONS', `
    <form id="run-payroll-form" class="modal-form"><p class="modal-help">Calculate pay for an entire cycle or a single employee. Existing payroll records are protected against duplicate processing.</p>
      <label class="form-field"><span>Pay period</span><select id="run-period-id" required>${options}</select></label>
      <label class="form-field"><span>Employee (optional)</span><select id="run-employee-id"><option value="">All active employees</option>${people}</select></label>
      <div class="modal-actions"><button type="button" class="button button-outline" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Run calculation</button></div></form>`);
  $('run-payroll-form').addEventListener('submit', submitRunPayroll);
}
async function submitRunPayroll(event) {
  event.preventDefault();
  const periodId = Number($('run-period-id').value);
  const employeeId = $('run-employee-id').value ? Number($('run-employee-id').value) : null;
  const submit = event.submitter; if (submit) { submit.disabled = true; submit.textContent = 'Processing…'; }
  try {
    const result = await apiFetch('/api/payroll/process', { method: 'POST', body: JSON.stringify({ periodId, employeeId }) });
    closeModal(); showToast(result.message || 'Payroll calculation completed.', 'success'); await loadPayroll();
  } catch (error) { showToast(error.message, 'error'); if (submit) { submit.disabled = false; submit.textContent = 'Run calculation'; } }
}

async function openSlipModal(payrollId) {
  openModal('Pay statement', 'COMPENSATION RECORD', '<p class="empty-cell">Loading itemised statement…</p>');
  try {
    const data = await apiFetch(`/api/payroll/slip/${payrollId}`);
    const slip = data.slip;
    const earnings = (slip.earnings || []).map((item) => `<tr><td>${esc(item.item_name)}</td><td class="amount-cell">${esc(money(item.amount))}</td></tr>`).join('');
    const deductions = (slip.deductions || []).map((item) => `<tr><td>${esc(item.item_name)}<small class="table-subline">${esc(item.description || '')}</small></td><td class="amount-cell negative-value">− ${esc(money(item.amount))}</td></tr>`).join('');
    $('modal-content').innerHTML = `
      <div class="slip-header"><div><p class="eyebrow">${esc(slip.period_name)}</p><h3>${esc(slip.full_name)}</h3><p>${esc(slip.employee_code)} · ${esc(slip.department_name)} · ${esc(slip.designation)}</p></div><div>${statusBadge(slip.payment_status)}</div></div>
      <div class="slip-facts"><span><small>Working days</small><strong>${esc(slip.total_working_days)}</strong></span><span><small>Present</small><strong>${esc(slip.present_days)}</strong></span><span><small>Late marks</small><strong>${esc(slip.late_days)}</strong></span></div>
      <div class="slip-section"><h4>Earnings</h4><table><tbody>${earnings || '<tr><td>No earnings detail</td><td>—</td></tr>'}</tbody><tfoot><tr><th>Gross earnings</th><th class="amount-cell">${esc(money(slip.gross_earnings))}</th></tr></tfoot></table></div>
      <div class="slip-section"><h4>Deductions</h4><table><tbody>${deductions || '<tr><td>No deductions</td><td>—</td></tr>'}</tbody><tfoot><tr><th>Total deductions</th><th class="amount-cell negative-value">${esc(money(slip.total_deductions))}</th></tr></tfoot></table></div>
      <div class="net-pay-row"><span>Net pay</span><strong>${esc(money(slip.net_salary))}</strong></div>
      <div class="modal-actions"><button class="button button-outline" data-close-modal>Close</button><button class="button button-primary" id="print-slip">Print statement</button></div>`;
    $('print-slip').addEventListener('click', () => window.print());
  } catch (error) { $('modal-content').innerHTML = `<p class="form-error">${esc(error.message)}</p><div class="modal-actions"><button class="button button-outline" data-close-modal>Close</button></div>`; }
}

function exportTableCsv(tableSelector, filename) {
  const table = document.querySelector(tableSelector);
  if (!table) return showToast('There is no table to export.', 'error');
  const rows = [...table.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('th,td')].map((cell) => {
    const text = cell.innerText.replace(/\s+/g, ' ').trim();
    return `"${text.replace(/"/g, '""')}"`;
  }).join(','));
  const blob = new Blob([`\uFEFF${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  showToast('CSV export prepared.', 'success');
}

function handleDelegatedClick(event) {
  const viewButton = event.target.closest('[data-view], [data-open-view]');
  if (viewButton) { const view = viewButton.dataset.view || viewButton.dataset.openView; if (view) switchView(view); }
  const closeButton = event.target.closest('[data-close-modal]'); if (closeButton) closeModal();
  const leaveButton = event.target.closest('[data-leave-action]'); if (leaveButton) updateLeaveStatus(Number(leaveButton.dataset.leaveId), leaveButton.dataset.leaveAction);
  const slipButton = event.target.closest('[data-slip-id]'); if (slipButton) openSlipModal(Number(slipButton.dataset.slipId));
}

function bindEvents() {
  $('login-form').addEventListener('submit', (event) => { event.preventDefault(); login($('login-email').value.trim(), $('login-password').value); });
  document.querySelectorAll('.demo-account').forEach((button) => button.addEventListener('click', () => {
    $('login-email').value = button.dataset.email; $('login-password').value = button.dataset.password;
    $('login-form').requestSubmit();
  }));
  document.addEventListener('click', handleDelegatedClick);
  $('logout-button').addEventListener('click', () => signOut(true));
  $('refresh-button').addEventListener('click', () => switchView(document.querySelector('.view-section.active')?.id.replace('view-', '') || 'overview'));
  $('quick-add-person').addEventListener('click', openAddEmployeeModal);
  $('add-person-button').addEventListener('click', openAddEmployeeModal);
  $('quick-leave-button').addEventListener('click', () => switchView('leaves'));
  $('apply-leave-button').addEventListener('click', openApplyLeaveModal);
  $('run-payroll-button').addEventListener('click', openRunPayrollModal);
  $('employee-clock-button').addEventListener('click', handleClockIn);
  $('attendance-clock-button').addEventListener('click', handleClockIn);
  $('people-search').addEventListener('input', renderEmployees);
  $('attendance-search').addEventListener('input', renderAttendanceTable);
  $('attendance-period-filter').addEventListener('change', loadAttendance);
  $('leave-search').addEventListener('input', renderLeaves);
  $('leave-status-filter').addEventListener('change', renderLeaves);
  $('payroll-period-select').addEventListener('change', loadPayroll);
  $('report-period-select').addEventListener('change', refreshCurrentReport);
  document.querySelectorAll('.report-tab').forEach((button) => button.addEventListener('click', () => switchReport(button.dataset.report)));
  $('attendance-export').addEventListener('click', () => exportTableCsv('#view-attendance table', 'meridian-attendance.csv'));
  $('report-export').addEventListener('click', () => exportTableCsv(`#${activeReport} table`, `meridian-${activeReport.replace('rep-', '')}-report.csv`));
  $('modal-close').addEventListener('click', closeModal);
  $('modal-backdrop').addEventListener('click', (event) => { if (event.target === $('modal-backdrop')) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('modal-backdrop').hidden) closeModal(); });
}

window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  checkSession();
});

async function handleClockIn() {
  try {
    const result = await apiFetch('/api/attendance/clock-in', { method: 'POST' });
    showToast(result.message || 'Attendance recorded.', 'success');
    await loadAttendance();
    await loadDashboard();
  } catch (error) { showToast(error.message, 'error'); }
}
