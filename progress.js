// ====== API CONFIG ======
// This module has its OWN backend (separate Apps Script project, own
// Spreadsheet, own login accounts) -- it is NOT the same deployment as
// app.js's API_URL. Deploy spm-code.gs as its own Web App and paste
// that /exec URL below before this module will work.
const API_URL = 'https://script.google.com/macros/s/AKfycbwS-N3uP9601d9tX9ZIIOBxSD1Vi7VEZIJsNa5NyyhLQyyb8IRjHCdlM49dY9YYqrG2CA/exec';

function callApi(action, args) {
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, args: args || [] })
  }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' from server');
    return res.json();
  });
}

// ====== STATE ======
let SESSION_TOKEN = null;
let CURRENT_INSPECTOR = null;
let CURRENT_SUBMISSION_ID = null;
let CURRENT_SUBMISSION_STATUS = '';
let CURRENT_GRADE = 'balvatika2';
let FORM_READONLY = false;
let GRADE_ROWS_CACHE = { balvatika2: [], grade1: [], grade2: [] };
let ADMIN_SUBMISSIONS = [];

// ====== GRADE / ANNEXURE CONFIG ======
// Mirrors Annexure-A (Balvatika-2), Annexure-B (Grade 1), Annexure-C (Grade 2)
// from memo F.No.30(1-17)/DEE/NIPUN Tripura Cell/2024.
const GRADE_CONFIGS = {
  balvatika2: {
    label: 'Balvatika-2',
    annexure: 'A',
    columns: [
      { id: 'lit1', section: 'Literacy', label: 'Recognises letters & corresponding sounds' },
      { id: 'lit2', section: 'Literacy', label: 'Reads simple words (2-3 letters)' },
      { id: 'num1', section: 'Numeracy', label: 'Recognises, reads & writes numerals (up to 9)' },
      { id: 'num2', section: 'Numeracy', label: 'Arranges numbers/objects/shapes/sequence of events' }
    ]
  },
  grade1: {
    label: 'Grade 1',
    annexure: 'B',
    columns: [
      { id: 'lit1', section: 'Literacy', label: 'Reads small sentences from age-appropriate unknown text (4-5 simple words)' },
      { id: 'num1', section: 'Numeracy', label: 'Developed number sense upto 20' },
      { id: 'num2', section: 'Numeracy', label: 'Perform simple addition & subtraction upto 9' }
    ]
  },
  grade2: {
    label: 'Grade 2',
    annexure: 'C',
    columns: [
      { id: 'lit1', section: 'Literacy', label: 'Reads age-appropriate text of 6-8 sentences with understanding' },
      { id: 'num1', section: 'Numeracy', label: 'Developed number sense upto 99' },
      { id: 'num2', section: 'Numeracy', label: 'Perform addition & subtraction of numbers upto 99' }
    ]
  }
};

// ====== VIEW SWITCHING ======
function showView(name) {
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');

  const isLogin = (name === 'login');
  const main = document.getElementById('main');
  if (main) main.style.cssText = isLogin ? 'margin:0; padding:0; max-width:none;' : '';

  document.getElementById('userBadge').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('dashboardNav').style.display = (name === 'dashboard' || name === 'admin-dashboard') ? 'flex' : 'none';
}

function switchDashboardTab(tabKey) {
  document.getElementById('tabMyRegisters').classList.toggle('active', tabKey === 'my');
  document.getElementById('tabAdminRegisters').classList.toggle('active', tabKey === 'admin');
  if (tabKey === 'admin') {
    showView('admin-dashboard');
    loadAdminDashboard();
  } else {
    showView('dashboard');
  }
}

function showMsg(elId, text, type) {
  const el = document.getElementById(elId);
  el.innerHTML = '<div class="msg ' + type + '">' + text + '</div>';
  setTimeout(function () { el.innerHTML = ''; }, 6000);
}

// ====== LOGIN / PASSWORD RESET (shared auth backend with the Inspection module) ======
function showLoginStep(step) {
  document.getElementById('loginPasswordStep').style.display = (step === 'login') ? 'block' : 'none';
  document.getElementById('resetStep1').style.display = (step === 'reset1') ? 'block' : 'none';
  document.getElementById('resetStep2').style.display = (step === 'reset2') ? 'block' : 'none';
}

document.getElementById('loginBtn').addEventListener('click', function () {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showMsg('loginMsg', 'Please enter your email and password.', 'error');
  this.disabled = true;
  const btn = this;
  callApi('loginWithPassword', [email, password])
    .then(function (res) {
      btn.disabled = false;
      if (res && res.ok) {
        SESSION_TOKEN = res.token;
        CURRENT_INSPECTOR = res.inspector;
        document.getElementById('userName').textContent = CURRENT_INSPECTOR.name;

        const role = (CURRENT_INSPECTOR.role || 'Inspector');
        const roleBadgeEl = document.getElementById('userRoleBadge');
        if (roleBadgeEl) { roleBadgeEl.textContent = role; roleBadgeEl.className = 'role-pill role-' + role.toLowerCase(); }

        const isAdmin = role === 'Admin';
        const tabLabelEl = document.getElementById('tabAdminRegistersLabel');
        if (tabLabelEl) tabLabelEl.textContent = isAdmin ? 'Admin Dashboard & NIPUN Analytics' : 'My Analytics';

        document.getElementById('userBadge').style.display = 'flex';

        if (isAdmin) {
          loadAdminDashboard();
          document.getElementById('tabAdminRegisters').classList.add('active');
          document.getElementById('tabMyRegisters').classList.remove('active');
        } else {
          loadDashboard();
        }
      } else {
        showMsg('loginMsg', (res && res.message) || 'Login failed: no response received from server.', 'error');
      }
    })
    .catch(function (err) { btn.disabled = false; showMsg('loginMsg', 'Login failed: ' + err.message, 'error'); });
});

document.getElementById('showResetBtn').addEventListener('click', function () {
  document.getElementById('resetEmail').value = document.getElementById('loginEmail').value;
  showLoginStep('reset1');
});
document.getElementById('backToLoginBtn1').addEventListener('click', function () { showLoginStep('login'); });
document.getElementById('backToLoginBtn2').addEventListener('click', function () { showLoginStep('login'); });

document.getElementById('sendResetOtpBtn').addEventListener('click', function () {
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) return showMsg('loginMsg', 'Please enter your email.', 'error');
  this.disabled = true;
  const btn = this;
  callApi('requestOtp', [email])
    .then(function (res) {
      btn.disabled = false;
      if (res && res.ok) {
        document.getElementById('resetEmailDisplay').textContent = email;
        showLoginStep('reset2');
        showMsg('loginMsg', res.message, 'success');
      } else {
        showMsg('loginMsg', (res && res.message) || 'Could not send verification code.', 'error');
      }
    })
    .catch(function (err) { btn.disabled = false; showMsg('loginMsg', err.message, 'error'); });
});

document.getElementById('setPasswordBtn').addEventListener('click', function () {
  const email = document.getElementById('resetEmail').value.trim();
  const otp = document.getElementById('resetOtpInput').value.trim();
  const pw1 = document.getElementById('resetNewPassword').value;
  const pw2 = document.getElementById('resetConfirmPassword').value;
  if (!otp) return showMsg('loginMsg', 'Please enter the verification code.', 'error');
  if (pw1.length < 6) return showMsg('loginMsg', 'Password must be at least 6 characters.', 'error');
  if (pw1 !== pw2) return showMsg('loginMsg', 'Passwords do not match.', 'error');
  this.disabled = true;
  const btn = this;
  callApi('resetPassword', [email, otp, pw1])
    .then(function (res) {
      btn.disabled = false;
      if (res && res.ok) {
        showMsg('loginMsg', res.message, 'success');
        document.getElementById('loginEmail').value = email;
        document.getElementById('loginPassword').value = '';
        showLoginStep('login');
      } else {
        showMsg('loginMsg', (res && res.message) || 'Could not set password.', 'error');
      }
    })
    .catch(function (err) { btn.disabled = false; showMsg('loginMsg', err.message, 'error'); });
});

document.getElementById('logoutBtn').addEventListener('click', function () {
  callApi('logout', [SESSION_TOKEN]).catch(function () {});
  SESSION_TOKEN = null; CURRENT_INSPECTOR = null;
  document.getElementById('loginPassword').value = '';
  showLoginStep('login');
  showView('login');
});

// ====== DASHBOARD (MY REGISTERS) ======
function loadDashboard() {
  showView('dashboard');
  document.getElementById('dashboardBody').innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  callApi('spmGetDashboardData', [SESSION_TOKEN])
    .then(function (res) {
      if (!res || !res.ok) {
        const detail = (res && res.message) || 'no response received from server';
        document.getElementById('dashboardBody').innerHTML = '<tr><td colspan="6">Could not load your registers. <em>' + detail + '</em> <button class="btn btn-small" onclick="loadDashboard()">Retry</button></td></tr>';
        showMsg('dashboardMsg', 'Could not load your registers: ' + detail, 'error');
        if (res && res.message && /session/i.test(res.message)) showView('login');
        return;
      }
      renderDashboard(res.submissions || []);
    })
    .catch(function (err) {
      const message = 'Could not load your registers: ' + err.message;
      document.getElementById('dashboardBody').innerHTML = '<tr><td colspan="6">' + message + ' <button class="btn btn-small" onclick="loadDashboard()">Retry</button></td></tr>';
      showMsg('dashboardMsg', message, 'error');
    });
}

function renderDashboard(rows) {
  const body = document.getElementById('dashboardBody');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7">No registers yet. Click "+ New Register" to begin.</td></tr>';
    return;
  }
  body.innerHTML = rows.map(function (r) {
    const period = (r.periodFrom || '') + ' to ' + (r.periodTo || '');
    const students = (r.balvatika2Students || 0) + ' / ' + (r.grade1Students || 0) + ' / ' + (r.grade2Students || 0);
    return '<tr>' +
      '<td>' + (r.schoolName || '(untitled)') + '</td>' +
      '<td>' + period + '</td>' +
      '<td>' + students + '</td>' +
      '<td>' + (r.achievedPct || 0) + '%</td>' +
      '<td><span class="badge ' + r.status + '">' + r.status + '</span></td>' +
      '<td>' + new Date(r.updatedAt).toLocaleString() + '</td>' +
      '<td>' +
        '<button class="btn btn-small" onclick="openSubmission(\'' + r.id + '\')">Open</button> ' +
        (r.pdfUrl ? '<a class="btn btn-small btn-secondary" href="' + r.pdfUrl + '" target="_blank">PDF</a>' : '') +
      '</td>' +
    '</tr>';
  }).join('');
}

// ====== ADMIN DASHBOARD ======
function loadAdminDashboard() {
  showView('admin-dashboard');
  callApi('spmGetAdminDashboardData', [SESSION_TOKEN])
    .then(function (res) {
      if (!res || !res.ok) {
        showMsg('adminMasterMsg', (res && res.message) || 'Failed to retrieve dashboard data.', 'error');
        return;
      }
      ADMIN_SUBMISSIONS = res.submissions || [];
      const scope = res.scope || {};

      const scopeLabelEl = document.getElementById('dashboardScopeLabel');
      const masterTitleEl = document.getElementById('masterTableTitle');
      const blockHeaderEl = document.getElementById('masterTableBlockHeader');
      if (scope.isAdmin) {
        if (scopeLabelEl) scopeLabelEl.textContent = 'Showing data for all teachers and all schools.';
        if (masterTitleEl) masterTitleEl.textContent = 'District Master Register Records';
        if (blockHeaderEl) blockHeaderEl.style.display = '';
      } else {
        if (scopeLabelEl) scopeLabelEl.textContent = 'Showing data for your own submissions only.';
        if (masterTitleEl) masterTitleEl.textContent = 'My Register Records';
        if (blockHeaderEl) blockHeaderEl.style.display = 'none';
      }

      renderAdminKPIs(res.summary || {});
      renderGradeBreakdown(res.gradeBreakdown || []);
      renderSchoolBreakdown(res.schoolBreakdown || []);
      renderTeacherBreakdown(res.teacherBreakdown || []);
      filterAdminMasterTable();
    })
    .catch(function (err) { showMsg('adminMasterMsg', 'Error loading dashboard data: ' + err.message, 'error'); });
}

function isChecked(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

function renderAdminKPIs(summary) {
  document.getElementById('kpiTotalRegisters').textContent = summary.totalRegisters || 0;
  document.getElementById('kpiTotalRegistersSub').textContent = (summary.totalSubmitted || 0) + ' submitted, ' + (summary.totalDrafts || 0) + ' draft';

  document.getElementById('kpiTotalStudents').textContent = (summary.totalStudents || 0).toLocaleString();

  document.getElementById('kpiOverallAchievement').textContent = (summary.overallAchievementPct || 0) + '%';
  document.getElementById('kpiOverallAchievementSub').textContent = (summary.overallAchievedCount || 0).toLocaleString() + ' of ' + (summary.overallLoCount || 0).toLocaleString() + ' LO checks achieved';

  document.getElementById('kpiUpdateCompliance').textContent = (summary.updateCompliancePct || 0) + '%';
  document.getElementById('kpiUpdateComplianceSub').textContent = (summary.updatedRecentlyCount || 0) + ' of ' + (summary.totalRegisters || 0) + ' registers updated in last 15 days';
}

function renderGradeBreakdown(gradeBreakdown) {
  const rowsHtml = [];
  gradeBreakdown.forEach(function (g) {
    g.columns.forEach(function (col, i) {
      rowsHtml.push('<tr>' +
        (i === 0 ? '<td rowspan="' + g.columns.length + '"><strong>' + g.label + '</strong></td>' +
          '<td rowspan="' + g.columns.length + '">' + g.registers + '</td>' +
          '<td rowspan="' + g.columns.length + '">' + g.studentsAssessed + '</td>' : '') +
        '<td>' + col.label + '</td>' +
        '<td>' + col.pct + '% (' + col.achieved + '/' + col.total + ')' +
          '<div class="bar-container"><div class="bar-fill ' + (col.pct >= 80 ? 'success' : (col.pct >= 50 ? 'warning' : 'danger')) + '" style="width:' + col.pct + '%;"></div></div>' +
        '</td>' +
      '</tr>');
    });
  });
  document.getElementById('gradeBreakdownBody').innerHTML = rowsHtml.join('') || '<tr><td colspan="5">No data yet.</td></tr>';
}

function renderSchoolBreakdown(schoolBreakdown) {
  const body = document.getElementById('schoolBreakdownBody');
  if (!body) return;
  if (!schoolBreakdown.length) { body.innerHTML = '<tr><td colspan="7">No data yet.</td></tr>'; return; }
  body.innerHTML = schoolBreakdown.map(function (s) {
    const pct = s.achievedPct || 0;
    return '<tr>' +
      '<td><strong>' + (s.schoolName || '(untitled)') + '</strong></td>' +
      '<td>' + (s.udiseCode || '') + '</td>' +
      '<td>' + (s.gradesCovered || '') + '</td>' +
      '<td>' + s.registers + '</td>' +
      '<td>' + s.studentsAssessed + '</td>' +
      '<td>' + pct + '%<div class="bar-container"><div class="bar-fill ' + (pct >= 80 ? 'success' : (pct >= 50 ? 'warning' : 'danger')) + '" style="width:' + pct + '%;"></div></div></td>' +
      '<td>' + (s.lastUpdated ? new Date(s.lastUpdated).toLocaleDateString() : '') + '</td>' +
    '</tr>';
  }).join('');
}

function renderTeacherBreakdown(teacherBreakdown) {
  const body = document.getElementById('teacherBreakdownBody');
  if (!body) return;
  if (!teacherBreakdown.length) { body.innerHTML = '<tr><td colspan="6">No data yet.</td></tr>'; return; }
  body.innerHTML = teacherBreakdown.map(function (t) {
    const pct = t.achievedPct || 0;
    return '<tr>' +
      '<td><strong>' + (t.name || t.email) + '</strong><div style="font-size:11px;color:#94a3b8;">' + (t.email || '') + '</div></td>' +
      '<td>' + (t.block || '') + '</td>' +
      '<td>' + t.registers + '</td>' +
      '<td>' + t.studentsAssessed + '</td>' +
      '<td>' + pct + '%<div class="bar-container"><div class="bar-fill ' + (pct >= 80 ? 'success' : (pct >= 50 ? 'warning' : 'danger')) + '" style="width:' + pct + '%;"></div></div></td>' +
      '<td>' + (t.lastSubmission ? new Date(t.lastSubmission).toLocaleDateString() : '') + '</td>' +
    '</tr>';
  }).join('');
}

function filterAdminMasterTable() {
  const q = (document.getElementById('adminSearchInput').value || '').toLowerCase();
  const gradeFilter = document.getElementById('adminGradeFilter').value;
  const statusFilter = document.getElementById('adminStatusFilter').value;

  const filtered = ADMIN_SUBMISSIONS.filter(function (s) {
    const matchQuery = !q || (s.schoolName || '').toLowerCase().indexOf(q) !== -1 || (s.teacherName || '').toLowerCase().indexOf(q) !== -1;
    const matchGrade = !gradeFilter || ((s.perGrade && s.perGrade[gradeFilter] && s.perGrade[gradeFilter].studentCount) > 0);
    const matchStatus = !statusFilter || s.status === statusFilter;
    return matchQuery && matchGrade && matchStatus;
  });

  const body = document.getElementById('adminMasterBody');
  const blockHeaderEl = document.getElementById('masterTableBlockHeader');
  const showBlockCol = !!(blockHeaderEl && blockHeaderEl.style.display !== 'none');
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="' + (showBlockCol ? 8 : 7) + '">No matching register records found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(function (r) {
    const period = (r.periodFrom || '') + ' to ' + (r.periodTo || '');
    const pg = r.perGrade || {};
    const students = ((pg.balvatika2 && pg.balvatika2.studentCount) || 0) + ' / ' + ((pg.grade1 && pg.grade1.studentCount) || 0) + ' / ' + ((pg.grade2 && pg.grade2.studentCount) || 0);
    return '<tr>' +
      '<td><strong>' + (r.schoolName || '(untitled)') + '</strong></td>' +
      '<td>' + (r.teacherName || r.teacherEmail || '') + '</td>' +
      (showBlockCol ? '<td>' + (r.block || '') + '</td>' : '') +
      '<td>' + period + '</td>' +
      '<td>' + students + '</td>' +
      '<td>' + (r.achievedPct || 0) + '%</td>' +
      '<td><span class="badge ' + r.status + '">' + r.status + '</span></td>' +
      '<td>' + (r.pdfUrl ? '<a class="btn btn-small btn-secondary" href="' + r.pdfUrl + '" target="_blank">PDF</a>' : '<span style="color:#94a3b8; font-size:12px;">No PDF</span>') + '</td>' +
    '</tr>';
  }).join('');
}

document.getElementById('newFormBtn').addEventListener('click', function () { newForm(); });
document.getElementById('backToDashBtn').addEventListener('click', function () { loadDashboard(); });

// ====== GRADE TABS ======
document.querySelectorAll('.spm-grade-tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    captureCurrentGradeRows();
    CURRENT_GRADE = tab.dataset.grade;
    document.querySelectorAll('.spm-grade-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
    buildRegisterTable(GRADE_ROWS_CACHE[CURRENT_GRADE]);
  });
});

function selectGradeTab(gradeKey) {
  CURRENT_GRADE = gradeKey;
  document.querySelectorAll('.spm-grade-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.grade === gradeKey); });
}

// Reads whatever's currently in the DOM table into the in-memory cache
// for the tab that's about to be left, so switching grade tabs never
// loses edits -- this is what makes all three grades part of ONE
// register instead of three separate submissions.
function captureCurrentGradeRows() {
  GRADE_ROWS_CACHE[CURRENT_GRADE] = Array.from(document.querySelectorAll('#registerTableBody tr')).map(function (tr) {
    const checks = {};
    tr.querySelectorAll('input.spm-check').forEach(function (chk) { checks[chk.dataset.col] = chk.checked; });
    return {
      rollNo: tr.querySelector('.spm-roll').value,
      name: tr.querySelector('.spm-name').value,
      checks: checks,
      remarks: tr.querySelector('.spm-remarks').value
    };
  });
}

// ====== READ-ONLY MODE (a Submitted register can no longer be edited) ======
function setFormReadOnly(readOnly) {
  FORM_READONLY = readOnly;
  document.getElementById('readOnlyBanner').style.display = readOnly ? 'block' : 'none';
  document.getElementById('formActionButtons').style.display = readOnly ? 'none' : 'flex';
  document.getElementById('readOnlyActionButtons').style.display = readOnly ? 'block' : 'none';
  document.querySelector('.spm-bulk-panel').style.display = readOnly ? 'none' : 'block';

  ['f_schoolName', 'f_udiseCode', 'f_periodFrom', 'f_periodTo', 'f_teacherSignName', 'f_principalSignName'].forEach(function (id) {
    document.getElementById(id).disabled = readOnly;
  });
}

function applyReadOnlyToTable() {
  const tbody = document.getElementById('registerTableBody');
  tbody.querySelectorAll('input, button').forEach(function (el) { el.disabled = FORM_READONLY; });
}

// ====== DYNAMIC STUDENT TABLE ======
function buildRegisterTable(existingRows) {
  const cfg = GRADE_CONFIGS[CURRENT_GRADE];
  const thead = document.getElementById('registerTableHead');
  const tbody = document.getElementById('registerTableBody');

  // Header row 1: section groups, row 2: individual LO labels
  let headRow1 = '<tr><th class="spm-roll-col" rowspan="2">Roll No.</th><th class="spm-name-cell" rowspan="2">Student Name</th>';
  let headRow2 = '<tr>';
  let currentSection = null, sectionSpan = 0;
  const sectionHtmlParts = [];
  cfg.columns.forEach(function (col) {
    if (col.section !== currentSection) {
      if (currentSection !== null) sectionHtmlParts.push({ label: currentSection, span: sectionSpan });
      currentSection = col.section; sectionSpan = 1;
    } else { sectionSpan++; }
    headRow2 += '<th title="' + col.label.replace(/"/g, '&quot;') + '">' + col.label + '</th>';
  });
  sectionHtmlParts.push({ label: currentSection, span: sectionSpan });
  sectionHtmlParts.forEach(function (sec) { headRow1 += '<th colspan="' + sec.span + '"><span class="spm-section-label">' + sec.label + '</span></th>'; });
  headRow1 += '<th class="spm-remarks-col" rowspan="2">Remarks</th><th rowspan="2"></th></tr>';
  headRow2 += '</tr>';
  thead.innerHTML = headRow1 + headRow2;

  tbody.innerHTML = '';
  (existingRows && existingRows.length ? existingRows : []).forEach(function (r) { addStudentRow(r); });

  recalcTotals();
  applyReadOnlyToTable();
}

function addStudentRow(data) {
  data = data || {};
  const cfg = GRADE_CONFIGS[CURRENT_GRADE];
  const tbody = document.getElementById('registerTableBody');
  const tr = document.createElement('tr');
  let checksHtml = '';
  cfg.columns.forEach(function (col) {
    const checked = (data.checks && isChecked(data.checks[col.id])) ? 'checked' : '';
    checksHtml += '<td><input type="checkbox" class="spm-check" data-col="' + col.id + '" ' + checked + ' onchange="recalcTotals()"' + (FORM_READONLY ? ' disabled' : '') + '></td>';
  });
  tr.innerHTML =
    '<td><input type="text" class="spm-roll" value="' + (data.rollNo || '').toString().replace(/"/g, '&quot;') + '"' + (FORM_READONLY ? ' disabled' : '') + '></td>' +
    '<td class="spm-name-cell"><input type="text" class="spm-name" value="' + (data.name || '').replace(/"/g, '&quot;') + '"' + (FORM_READONLY ? ' disabled' : '') + '></td>' +
    checksHtml +
    '<td><input type="text" class="spm-remarks" value="' + (data.remarks || '').replace(/"/g, '&quot;') + '"' + (FORM_READONLY ? ' disabled' : '') + '></td>' +
    '<td><button class="btn btn-small btn-danger" type="button" onclick="removeStudentRow(this)"' + (FORM_READONLY ? ' disabled' : '') + '>x</button></td>';
  tbody.appendChild(tr);
}

function removeStudentRow(btn) {
  btn.closest('tr').remove();
  recalcTotals();
}

function recalcTotals() {
  const cfg = GRADE_CONFIGS[CURRENT_GRADE];
  const tbody = document.getElementById('registerTableBody');
  const totalStudents = tbody.children.length;
  const tfoot = document.getElementById('registerTableFoot');

  let footHtml = '<tr><td colspan="2">Total achieved (of ' + totalStudents + ')</td>';
  cfg.columns.forEach(function (col) {
    const count = tbody.querySelectorAll('input.spm-check[data-col="' + col.id + '"]:checked').length;
    const pct = totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;
    footHtml += '<td>' + count + ' (' + pct + '%)</td>';
  });
  footHtml += '<td colspan="2"></td></tr>';
  tfoot.innerHTML = footHtml;
}

// ====== BULK ADD ======
document.getElementById('bulkAddBtn').addEventListener('click', function () {
  const raw = document.getElementById('bulkAddInput').value;
  if (!raw.trim()) return;
  const lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  lines.forEach(function (line) {
    let rollNo = '', name = line;
    const m = line.match(/^(\d+)\s*[,.\t-]?\s*(.*)$/);
    if (m && m[2]) { rollNo = m[1]; name = m[2].trim(); }
    addStudentRow({ rollNo: rollNo, name: name });
  });
  document.getElementById('bulkAddInput').value = '';
  recalcTotals();
});
document.getElementById('addSingleRowBtn').addEventListener('click', function () { addStudentRow(); recalcTotals(); });

// ====== FORM: NEW / OPEN / RESET ======
function resetFormFields() {
  document.getElementById('f_schoolName').value = '';
  document.getElementById('f_udiseCode').value = '';
  document.getElementById('f_periodFrom').value = '';
  document.getElementById('f_periodTo').value = '';
  document.getElementById('f_teacherSignName').value = '';
  document.getElementById('f_principalSignName').value = '';
  document.getElementById('bulkAddInput').value = '';
  document.getElementById('registerTableBody').innerHTML = '';
  document.getElementById('formMsg').innerHTML = '';
  GRADE_ROWS_CACHE = { balvatika2: [], grade1: [], grade2: [] };
}

function newForm() {
  CURRENT_SUBMISSION_ID = null;
  CURRENT_SUBMISSION_STATUS = '';
  resetFormFields();
  setFormReadOnly(false);
  selectGradeTab('balvatika2');
  document.getElementById('formTitle').textContent = 'New Register';
  document.getElementById('f_teacherSignName').value = CURRENT_INSPECTOR ? CURRENT_INSPECTOR.name : '';
  buildRegisterTable([]);
  updateSubmitButtonLabel();
  showView('form');
}

function updateSubmitButtonLabel() {
  document.getElementById('submitFormBtn').textContent = 'Submit & Email PDF for Signature';
}

function openSubmission(id) {
  callApi('spmGetSubmission', [SESSION_TOKEN, id])
    .then(function (res) {
      if (!res.ok) { showMsg('dashboardMsg', res.message, 'error'); return; }
      CURRENT_SUBMISSION_ID = id;
      CURRENT_SUBMISSION_STATUS = res.submission.status;
      resetFormFields();
      populateForm(res.submission.data);
      const readOnly = !!res.submission.readOnly || res.submission.status === 'Submitted';
      setFormReadOnly(readOnly);
      applyReadOnlyToTable();
      document.getElementById('viewPdfLink').href = res.submission.data.pdfUrl || '#';
      document.getElementById('formTitle').textContent = readOnly
        ? 'View Register (Submitted — read only)'
        : 'Edit Draft';
      updateSubmitButtonLabel();
      showView('form');
    })
    .catch(function (err) { showMsg('dashboardMsg', err.message, 'error'); });
}

// ====== GATHER / POPULATE ======
// One register now covers ALL THREE grades at once (Balvatika-2, Grade 1,
// Grade 2), so gathering pulls the currently-visible tab out of the DOM
// first, then combines it with whatever's cached for the other two tabs.
function gatherFormData() {
  captureCurrentGradeRows();

  const gradesData = {};
  Object.keys(GRADE_CONFIGS).forEach(function (g) { gradesData[g] = { rows: GRADE_ROWS_CACHE[g] || [] }; });

  return {
    _id: CURRENT_SUBMISSION_ID,
    schoolName: val('f_schoolName'),
    udiseCode: val('f_udiseCode'),
    periodFrom: val('f_periodFrom'),
    periodTo: val('f_periodTo'),
    teacherName: val('f_teacherSignName'),
    principalName: val('f_principalSignName'),
    gradesData: gradesData
  };
}

function populateForm(data) {
  GRADE_ROWS_CACHE = {
    balvatika2: (data.gradesData && data.gradesData.balvatika2 && data.gradesData.balvatika2.rows) || [],
    grade1: (data.gradesData && data.gradesData.grade1 && data.gradesData.grade1.rows) || [],
    grade2: (data.gradesData && data.gradesData.grade2 && data.gradesData.grade2.rows) || []
  };
  setVal('f_schoolName', data.schoolName);
  setVal('f_udiseCode', data.udiseCode);
  setVal('f_periodFrom', data.periodFrom);
  setVal('f_periodTo', data.periodTo);
  setVal('f_teacherSignName', data.teacherName);
  setVal('f_principalSignName', data.principalName);
  selectGradeTab('balvatika2');
  buildRegisterTable(GRADE_ROWS_CACHE.balvatika2);
}

function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; }

// ====== SAVE / PREVIEW / SUBMIT ======
document.getElementById('saveDraftBtn').addEventListener('click', function () {
  const btn = this; btn.disabled = true;
  const data = gatherFormData();
  callApi('spmSaveDraft', [SESSION_TOKEN, data])
    .then(function (res) {
      btn.disabled = false;
      if (res.ok) { CURRENT_SUBMISSION_ID = res.id; showMsg('formMsg', 'Draft saved.', 'success'); }
      else showMsg('formMsg', res.message, 'error');
    })
    .catch(function (err) { btn.disabled = false; showMsg('formMsg', err.message, 'error'); });
});

document.getElementById('previewPdfBtn').addEventListener('click', function () {
  const btn = this; const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Generating preview...';
  const data = gatherFormData();

  let settled = false;
  const timeoutId = setTimeout(function () {
    if (settled) return;
    settled = true;
    btn.disabled = false; btn.textContent = originalText;
    showMsg('formMsg', 'No response after 45 seconds. This usually means a browser extension (e.g. Brave Shields, an ad-blocker) is blocking this app\'s connection to Google -- try disabling it for this page and reload, or try a different browser.', 'error');
  }, 45000);

  callApi('spmPreviewPdf', [SESSION_TOKEN, data])
    .then(function (res) {
      if (settled) return;
      settled = true; clearTimeout(timeoutId);
      btn.disabled = false; btn.textContent = originalText;
      if (!res || !res.ok) {
        showMsg('formMsg', 'Preview failed: ' + ((res && res.message) || 'no response received from server'), 'error');
        return;
      }
      try {
        const byteChars = atob(res.base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch (e) { showMsg('formMsg', 'Could not open PDF preview: ' + e.message, 'error'); }
    })
    .catch(function (err) {
      if (settled) return;
      settled = true; clearTimeout(timeoutId);
      btn.disabled = false; btn.textContent = originalText;
      showMsg('formMsg', 'Preview failed: ' + err.message, 'error');
    });
});

function downloadBlobAsFile_(base64, filename) {
  try {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'progress-register.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
    return true;
  } catch (e) { console.error('Download failed:', e); return false; }
}

document.getElementById('submitFormBtn').addEventListener('click', function () {
  if (!confirm('Submit this register? A PDF will be generated, emailed to you, and downloaded to this device.')) return;
  const btn = this; btn.disabled = true;
  const data = gatherFormData();
  callApi('spmSubmitForm', [SESSION_TOKEN, data])
    .then(function (res) {
      btn.disabled = false;
      if (res && res.ok) {
        CURRENT_SUBMISSION_ID = res.id;
        CURRENT_SUBMISSION_STATUS = 'Submitted';
        updateSubmitButtonLabel();
        let msg = 'Submitted! PDF has been emailed to you.';
        if (res.base64) {
          const downloaded = downloadBlobAsFile_(res.base64, res.filename);
          msg += downloaded ? ' It has also been downloaded to this device.' : '';
        }
        if (res.pdfError) msg += ' (' + res.pdfError + ')';
        showMsg('formMsg', msg, 'success');
        setTimeout(loadDashboard, 1500);
      } else {
        showMsg('formMsg', (res && res.message) || 'Submit failed: no response received from server.', 'error');
      }
    })
    .catch(function (err) { btn.disabled = false; showMsg('formMsg', 'Submit failed: ' + err.message, 'error'); });
});