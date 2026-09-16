// ====== API CONFIG ======
// Paste the /exec URL of your deployed Apps Script Web App here.
// This is NOT a secret -- it's protected by the app's own login
// (password / session token), not by being hidden. See README.md.
const API_URL = 'https://script.google.com/macros/s/AKfycbxXJ8BXmGpGLtkKDQicS89ejPfsmPTzeP88GsIRyhwnaDf0UA8_sHui6tYbG2KDzpdl/exec';

function callApi(action, args) {
  return fetch(API_URL, {
    method: 'POST',
    // text/plain avoids a CORS preflight request, which Apps Script
    // Web Apps do not handle. The body is still valid JSON -- we just
    // don't advertise it as application/json to the browser.
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

  const ATTENDANCE_CLASSES = ['Pre-Primary','Class-I','Class-II','Class-III','Class-IV','Class-V',
    'Class-VI','Class-VII','Class-VIII','Class-IX','Class-X','Class-XI','Class-XII'];

  // ====== VIEW SWITCHING ======
  function showView(name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    const target = document.getElementById('view-' + name);
    if (target) target.classList.add('active');

    const isLogin = (name === 'login');
    const main = document.getElementById('main');
    if (main) {
      if (isLogin) {
        main.style.cssText = 'margin:0; padding:0; max-width:none;';
      } else {
        main.style.cssText = '';
      }
    }

    document.getElementById('userBadge').style.display = (name === 'login') ? 'none' : 'flex';
    document.getElementById('dashboardNav').style.display = (name === 'dashboard' || name === 'admin-dashboard') ? 'flex' : 'none';
  }

  function switchDashboardTab(tabKey) {
    // Both tabs are available to every logged-in user -- the server
    // (getAdminDashboardData) is what scopes the data to the caller's
    // own Block for non-admins, so there's nothing to gate here.
    document.getElementById('tabMyInspections').classList.toggle('active', tabKey === 'my');
    document.getElementById('tabAdminDashboard').classList.toggle('active', tabKey === 'admin');
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

  // ====== LOGIN (password-primary) / PASSWORD RESET (OTP-verified) ======
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
        console.log('loginWithPassword response:', res);
        if (res && res.ok) {
          SESSION_TOKEN = res.token;
          CURRENT_INSPECTOR = res.inspector;
          document.getElementById('userName').textContent = CURRENT_INSPECTOR.name;

          // Role-based badge
          const role = (CURRENT_INSPECTOR.role || 'Inspector');
          const roleBadgeEl = document.getElementById('userRoleBadge');
          if (roleBadgeEl) {
            roleBadgeEl.textContent = role;
            roleBadgeEl.className = 'role-pill role-' + role.toLowerCase();
          }

          // The second tab is available to every logged-in user now --
          // admins see every Block, regular inspectors see only their
          // own Block (colleagues + themselves). Only the label and the
          // data returned differ; the tab itself is never hidden.
          const isAdmin = role === 'Admin';
          const tabLabelEl = document.getElementById('tabAdminDashboardLabel');
          if (tabLabelEl) {
            tabLabelEl.textContent = isAdmin
              ? 'Admin Dashboard & Comparative Study'
              : 'Block Dashboard & Comparative Study';
          }

          document.getElementById('userBadge').style.display = 'flex';

          // Admins go straight to the (all-Blocks) dashboard; inspectors
          // land on their own submissions first and can switch tabs.
          if (isAdmin) {
            loadAdminDashboard();
            document.getElementById('tabAdminDashboard').classList.add('active');
            document.getElementById('tabMyInspections').classList.remove('active');
          } else {
            loadDashboard();
          }
        } else {
          showMsg('loginMsg', (res && res.message) || 'Login failed: no response received from server.', 'error');
        }
      })
      .catch(function (err) {
        btn.disabled = false;
        showMsg('loginMsg', 'Login failed: ' + err.message, 'error');
      });
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

  // ====== DASHBOARD ======
  function loadDashboard() {
    showView('dashboard');
    document.getElementById('dashboardBody').innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    callApi('getDashboardData', [SESSION_TOKEN])
      .then(function (res) {
        console.log('getDashboardData response:', res);
        if (!res || !res.ok) {
          const detail = (res && res.message) || 'no response received from server';
          document.getElementById('dashboardBody').innerHTML = '<tr><td colspan="5">Could not load your inspections. <em>' + detail + '</em> <button class="btn btn-small" onclick="loadDashboard()">Retry</button></td></tr>';
          showMsg('dashboardMsg', 'Could not load your inspections: ' + detail, 'error');
          if (res && res.message && /session/i.test(res.message)) showView('login');
          return;
        }
        renderDashboard(res.submissions);
      })
      .catch(function (err) {
        console.error('getDashboardData failure:', err);
        const message = 'Could not load your inspections: ' + err.message;
        document.getElementById('dashboardBody').innerHTML = '<tr><td colspan="5">' + message + ' <button class="btn btn-small" onclick="loadDashboard()">Retry</button></td></tr>';
        showMsg('dashboardMsg', message, 'error');
      });
  }

  function renderDashboard(rows) {
    const body = document.getElementById('dashboardBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5">No inspections yet. Click "+ New Inspection" to begin.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td>' + (r.schoolName || '(untitled)') + '</td>' +
        '<td>' + (r.inspectionDate || '') + '</td>' +
        '<td><span class="badge ' + r.status + '">' + r.status + '</span></td>' +
        '<td>' + new Date(r.updatedAt).toLocaleString() + '</td>' +
        '<td>' +
          '<button class="btn btn-small" onclick="openSubmission(\'' + r.id + '\')">Open</button> ' +
          (r.pdfUrl ? '<a class="btn btn-small btn-secondary" href="' + r.pdfUrl + '" target="_blank">PDF</a>' : '') +
        '</td>' +
      '</tr>';
    }).join('');
  }

  // ====== ADMIN DASHBOARD & COMPARATIVE ANALYTICS ======
  let ADMIN_INSPECTORS = [];
  let ADMIN_SUBMISSIONS = [];
  let SELECTED_COMPARATIVE_EMAILS = [];

  function loadAdminDashboard() {
    showView('admin-dashboard');
    callApi('getAdminDashboardData', [SESSION_TOKEN])
      .then(function (res) {
        if (!res || !res.ok) {
          const detail = res ? res.message : 'Failed to retrieve dashboard data.';
          showMsg('adminMasterMsg', detail, 'error');
          return;
        }
        ADMIN_INSPECTORS = res.inspectors || [];
        ADMIN_SUBMISSIONS = res.submissions || [];
        const scope = res.scope || {};

        // Scope label + master-table Block column: only meaningful (and
        // only shown) when there's more than one Block in view, i.e. an
        // admin looking across the whole district.
        const scopeLabelEl = document.getElementById('dashboardScopeLabel');
        const masterTitleEl = document.getElementById('masterTableTitle');
        const blockHeaderEl = document.getElementById('masterTableBlockHeader');
        if (scope.isAdmin) {
          if (scopeLabelEl) scopeLabelEl.textContent = 'Showing data for all Blocks and all inspectors.';
          if (masterTitleEl) masterTitleEl.textContent = 'District Master Inspection Records';
          if (blockHeaderEl) blockHeaderEl.style.display = '';
        } else {
          if (scopeLabelEl) scopeLabelEl.textContent = 'Showing data for your Block: ' + (scope.block || '(not set)');
          if (masterTitleEl) masterTitleEl.textContent = 'Block Master Inspection Records — ' + (scope.block || '');
          if (blockHeaderEl) blockHeaderEl.style.display = 'none';
        }

        if (!SELECTED_COMPARATIVE_EMAILS.length && ADMIN_INSPECTORS.length) {
          SELECTED_COMPARATIVE_EMAILS = ADMIN_INSPECTORS.slice(0, 5).map(function(i){ return i.email; });
        }

        renderAdminKPIs(ADMIN_SUBMISSIONS);
        renderComparativeStudy(ADMIN_INSPECTORS, ADMIN_SUBMISSIONS);
        renderWaterAndFacilitiesTracker(ADMIN_SUBMISSIONS);
        renderPmPoshanTracker(ADMIN_SUBMISSIONS);
        populateAdminInspectorFilterDropdown(ADMIN_INSPECTORS);
        filterAdminMasterTable();
      })
      .catch(function (err) {
        showMsg('adminMasterMsg', 'Error loading dashboard data: ' + err.message, 'error');
      });
  }

  function isYes(val) {
    if (!val) return false;
    val = String(val).trim().toLowerCase();
    return val === 'yes' || val === 'true' || val === '1';
  }

  function renderAdminKPIs(subs) {
    const total = subs.length;
    let waterCount = 0;
    let pmPoshanCount = 0;
    let totalStudents = 0;
    let totalTeachers = 0;
    let totalEnrolled = 0;
    let totalPresent = 0;

    subs.forEach(function (s) {
      const d = s.data || {};
      const s1 = d.sec1 || {};
      const s2 = d.sec2 || {};
      const s3 = d.sec3 || {};
      const s4 = d.sec4 || {};

      if (isYes(s3.waterAvailable) || isYes(s4.safeDrinkingWater)) waterCount++;
      if (isYes(s4.foodNormsDisplay) && isYes(s4.officerTasted)) pmPoshanCount++;

      const st = (Number(s1.pryStudent)||0) + (Number(s1.uppryStudent)||0) + (Number(s1.highStudent)||0) + (Number(s1.hsStudent)||0);
      const tc = (Number(s1.pryTeacher)||0) + (Number(s1.uppryTeacher)||0) + (Number(s1.highTeacher)||0) + (Number(s1.hsTeacher)||0);
      totalStudents += st;
      totalTeachers += tc;

      totalEnrolled += Number(s2.grandTotal) || 0;
      totalPresent += Number(s2.grandPresent) || 0;
    });

    const waterPct = total > 0 ? Math.round((waterCount / total) * 100) : 0;
    const pmPoshanPct = total > 0 ? Math.round((pmPoshanCount / total) * 100) : 0;
    const attPct = totalEnrolled > 0 ? ((totalPresent / totalEnrolled) * 100).toFixed(1) : '0';
    const strVal = totalTeachers > 0 ? (totalStudents / totalTeachers).toFixed(1) : '0';

    document.getElementById('kpiWaterPct').textContent = waterPct + '%';
    document.getElementById('kpiWaterSub').textContent = waterCount + ' of ' + total + ' schools inspected';

    document.getElementById('kpiPmPoshanPct').textContent = pmPoshanPct + '%';
    document.getElementById('kpiPmPoshanSub').textContent = pmPoshanCount + ' of ' + total + ' schools compliant';

    document.getElementById('kpiAttendancePct').textContent = attPct + '%';
    document.getElementById('kpiAttendanceSub').textContent = totalPresent.toLocaleString() + ' present / ' + totalEnrolled.toLocaleString() + ' total enrolled';

    document.getElementById('kpiSTR').textContent = strVal + ':1';
    document.getElementById('kpiTeachersSub').textContent = totalStudents.toLocaleString() + ' students across ' + totalTeachers.toLocaleString() + ' teachers';
  }

  function renderComparativeStudy(inspectors, subs) {
    const inspMap = {};
    inspectors.forEach(function (i) {
      inspMap[i.email.toLowerCase()] = {
        name: i.name,
        email: i.email,
        designation: i.designation,
        block: i.block || '',
        totalSubs: 0,
        waterCount: 0,
        pmPoshanCount: 0,
        totalEnrolled: 0,
        totalPresent: 0,
        totalStudents: 0,
        totalTeachers: 0,
        lastDate: ''
      };
    });

    subs.forEach(function (s) {
      const em = (s.inspectorEmail || '').toLowerCase();
      if (!inspMap[em]) {
        inspMap[em] = {
          name: s.inspectorName || s.inspectorEmail,
          email: s.inspectorEmail,
          designation: 'Inspector',
          block: s.block || '',
          totalSubs: 0,
          waterCount: 0,
          pmPoshanCount: 0,
          totalEnrolled: 0,
          totalPresent: 0,
          totalStudents: 0,
          totalTeachers: 0,
          lastDate: ''
        };
      }
      const item = inspMap[em];
      item.totalSubs++;

      const d = s.data || {};
      const s1 = d.sec1 || {};
      const s2 = d.sec2 || {};
      const s3 = d.sec3 || {};
      const s4 = d.sec4 || {};

      if (isYes(s3.waterAvailable) || isYes(s4.safeDrinkingWater)) item.waterCount++;
      if (isYes(s4.foodNormsDisplay) && isYes(s4.officerTasted)) item.pmPoshanCount++;

      item.totalEnrolled += Number(s2.grandTotal) || 0;
      item.totalPresent += Number(s2.grandPresent) || 0;

      const st = (Number(s1.pryStudent)||0) + (Number(s1.uppryStudent)||0) + (Number(s1.highStudent)||0) + (Number(s1.hsStudent)||0);
      const tc = (Number(s1.pryTeacher)||0) + (Number(s1.uppryTeacher)||0) + (Number(s1.highTeacher)||0) + (Number(s1.hsTeacher)||0);
      item.totalStudents += st;
      item.totalTeachers += tc;
      if (s.inspectionDate && s.inspectionDate > item.lastDate) item.lastDate = s.inspectionDate;
    });

    const inspList = Object.values(inspMap);

    const chipContainer = document.getElementById('compInspectorSelector');
    chipContainer.innerHTML = inspList.map(function (item) {
      const isSel = SELECTED_COMPARATIVE_EMAILS.indexOf(item.email) !== -1;
      return '<div class="comp-inspector-chip ' + (isSel ? 'selected' : '') + '" onclick="toggleComparativeInspector(\'' + item.email.replace(/'/g, "\\'") + '\')">' +
        item.name + ' (' + item.totalSubs + ')' +
      '</div>';
    }).join('');

    const selectedInspectors = inspList.filter(function (item) {
      return SELECTED_COMPARATIVE_EMAILS.indexOf(item.email) !== -1;
    }).slice(0, 5);

    const cardsGrid = document.getElementById('compCardsGrid');
    cardsGrid.innerHTML = selectedInspectors.map(function (item) {
      const waterPct = item.totalSubs > 0 ? Math.round((item.waterCount / item.totalSubs) * 100) : 0;
      const pmPct = item.totalSubs > 0 ? Math.round((item.pmPoshanCount / item.totalSubs) * 100) : 0;
      const attPct = item.totalEnrolled > 0 ? ((item.totalPresent / item.totalEnrolled) * 100).toFixed(1) + '%' : '0%';
      const strVal = item.totalTeachers > 0 ? (item.totalStudents / item.totalTeachers).toFixed(1) + ':1' : 'N/A';
      const initials = (item.name || 'IN').split(' ').map(function(n){ return n[0]; }).join('').substring(0,2).toUpperCase();

      return '<div class="comp-card">' +
        '<div class="comp-card-avatar">' + initials + '</div>' +
        '<div class="comp-card-name">' + item.name + '</div>' +
        '<div class="comp-card-designation">' + item.designation + '</div>' +
        '<div class="comp-metric-row"><span>Total Inspections</span><span>' + item.totalSubs + '</span></div>' +
        '<div class="comp-metric-row"><span>Water Access</span><span>' + waterPct + '%</span></div>' +
        '<div class="comp-metric-row"><span>PM-POSHAN Rate</span><span>' + pmPct + '%</span></div>' +
        '<div class="comp-metric-row"><span>Avg Attendance</span><span>' + attPct + '</span></div>' +
        '<div class="comp-metric-row"><span>STR Ratio</span><span>' + strVal + '</span></div>' +
      '</div>';
    }).join('');

    const tableBody = document.getElementById('compTableBody');
    tableBody.innerHTML = inspList.map(function (item) {
      const waterPct = item.totalSubs > 0 ? Math.round((item.waterCount / item.totalSubs) * 100) : 0;
      const pmPct = item.totalSubs > 0 ? Math.round((item.pmPoshanCount / item.totalSubs) * 100) : 0;
      const attPct = item.totalEnrolled > 0 ? ((item.totalPresent / item.totalEnrolled) * 100).toFixed(1) : '0';
      const strVal = item.totalTeachers > 0 ? (item.totalStudents / item.totalTeachers).toFixed(1) + ':1' : 'N/A';

      const blockSuffix = item.block ? ' &middot; ' + item.block : '';
      return '<tr>' +
        '<td><strong>' + item.name + '</strong><br><small style="color:var(--text-sub);">' + item.email + blockSuffix + '</small></td>' +
        '<td><span class="badge Active">' + item.totalSubs + '</span></td>' +
        '<td>' +
          '<div>' + waterPct + '% (' + item.waterCount + '/' + item.totalSubs + ')</div>' +
          '<div class="bar-container"><div class="bar-fill ' + (waterPct >= 80 ? 'success' : (waterPct >= 50 ? 'warning' : 'danger')) + '" style="width:' + waterPct + '%;"></div></div>' +
        '</td>' +
        '<td>' +
          '<div>' + pmPct + '% (' + item.pmPoshanCount + '/' + item.totalSubs + ')</div>' +
          '<div class="bar-container"><div class="bar-fill ' + (pmPct >= 80 ? 'success' : (pmPct >= 50 ? 'warning' : 'danger')) + '" style="width:' + pmPct + '%;"></div></div>' +
        '</td>' +
        '<td>' +
          '<div>' + attPct + '%</div>' +
          '<div class="bar-container"><div class="bar-fill ' + (Number(attPct) >= 75 ? 'success' : 'warning') + '" style="width:' + Math.min(100, Number(attPct)) + '%;"></div></div>' +
        '</td>' +
        '<td>' + strVal + '</td>' +
        '<td><button class="btn btn-small btn-outline" onclick="filterMasterByInspector(\'' + item.email.replace(/'/g, "\\'") + '\')">View Submissions</button></td>' +
      '</tr>';
    }).join('');
  }

  function toggleComparativeInspector(email) {
    const idx = SELECTED_COMPARATIVE_EMAILS.indexOf(email);
    if (idx !== -1) {
      if (SELECTED_COMPARATIVE_EMAILS.length > 1) {
        SELECTED_COMPARATIVE_EMAILS.splice(idx, 1);
      }
    } else {
      if (SELECTED_COMPARATIVE_EMAILS.length >= 5) {
        SELECTED_COMPARATIVE_EMAILS.shift();
      }
      SELECTED_COMPARATIVE_EMAILS.push(email);
    }
    renderComparativeStudy(ADMIN_INSPECTORS, ADMIN_SUBMISSIONS);
  }

  function renderWaterAndFacilitiesTracker(subs) {
    const total = subs.length;
    let waterFunc = 0, toiletFunc = 0, sepToilet = 0, electricity = 0, textbook = 0, ictLab = 0;

    subs.forEach(function (s) {
      const d = s.data || {};
      const s3 = d.sec3 || {};
      const s4 = d.sec4 || {};

      if (isYes(s3.waterAvailable)) waterFunc++;
      if (isYes(s3.toiletAvailable)) toiletFunc++;
      if (isYes(s4.separateToilet)) sepToilet++;
      if (isYes(s3.electricity)) electricity++;
      if (isYes(s3.textbookSupplied)) textbook++;
      if (isYes(s3.ictLab)) ictLab++;
    });

    const wPct = total > 0 ? Math.round((waterFunc / total) * 100) : 0;
    const tPct = total > 0 ? Math.round((toiletFunc / total) * 100) : 0;
    const sepPct = total > 0 ? Math.round((sepToilet / total) * 100) : 0;
    const elecPct = total > 0 ? Math.round((electricity / total) * 100) : 0;
    const txtPct = total > 0 ? Math.round((textbook / total) * 100) : 0;
    const ictPct = total > 0 ? Math.round((ictLab / total) * 100) : 0;

    const html =
      '<div style="margin-bottom:12px;">' +
        '<strong>Functional Drinking Water Source:</strong> ' + wPct + '% (' + waterFunc + '/' + total + ')' +
        '<div class="bar-container"><div class="bar-fill ' + (wPct >= 80 ? 'success' : 'warning') + '" style="width:' + wPct + '%;"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<strong>Functional Toilet Facility:</strong> ' + tPct + '% (' + toiletFunc + '/' + total + ')' +
        '<div class="bar-container"><div class="bar-fill ' + (tPct >= 80 ? 'success' : 'warning') + '" style="width:' + tPct + '%;"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<strong>Separate Toilets for Boys &amp; Girls:</strong> ' + sepPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (sepPct >= 80 ? 'success' : 'warning') + '" style="width:' + sepPct + '%;"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<strong>Electricity Supply:</strong> ' + elecPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (elecPct >= 80 ? 'success' : 'warning') + '" style="width:' + elecPct + '%;"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<strong>Free Textbooks Supplied:</strong> ' + txtPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (txtPct >= 90 ? 'success' : 'warning') + '" style="width:' + txtPct + '%;"></div></div>' +
      '</div>' +
      '<div>' +
        '<strong>ICT Lab Installed:</strong> ' + ictPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (ictPct >= 50 ? 'success' : 'warning') + '" style="width:' + ictPct + '%;"></div></div>' +
      '</div>';

    document.getElementById('waterTrackerBody').innerHTML = html;
  }

  function renderPmPoshanTracker(subs) {
    const total = subs.length;
    let menuDisplay = 0, tasted = 0, cleanKitchen = 0, lpg = 0, healthTablets = 0, totalRiceKg = 0;

    subs.forEach(function (s) {
      const d = s.data || {};
      const s4 = d.sec4 || {};

      if (isYes(s4.weeklyMenuDisplay) || isYes(s4.foodNormsDisplay)) menuDisplay++;
      if (isYes(s4.officerTasted)) tasted++;
      if (isYes(s4.kitchenShedCleaned)) cleanKitchen++;
      if (isYes(s4.lpgConnection)) lpg++;
      if (isYes(s4.ifaTablets) || isYes(s4.vitaminA) || isYes(s4.dewormingTablets)) healthTablets++;
      totalRiceKg += Number(s4.riceStockKg) || 0;
    });

    const menuPct = total > 0 ? Math.round((menuDisplay / total) * 100) : 0;
    const tastedPct = total > 0 ? Math.round((tasted / total) * 100) : 0;
    const cleanPct = total > 0 ? Math.round((cleanKitchen / total) * 100) : 0;
    const lpgPct = total > 0 ? Math.round((lpg / total) * 100) : 0;
    const healthPct = total > 0 ? Math.round((healthTablets / total) * 100) : 0;
    const avgRice = total > 0 ? Math.round(totalRiceKg / total) : 0;

    const html =
      '<div style="margin-bottom:12px;">' +
        '<strong>Weekly Menu / Food Norms Displayed:</strong> ' + menuPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (menuPct >= 80 ? 'success' : 'warning') + '" style="width:' + menuPct + '%;"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<strong>Food Tasted by Inspecting Officer:</strong> ' + tastedPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (tastedPct >= 80 ? 'success' : 'warning') + '" style="width:' + tastedPct + '%;"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<strong>Clean &amp; Hygienic Kitchen Shed:</strong> ' + cleanPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (cleanPct >= 80 ? 'success' : 'warning') + '" style="width:' + cleanPct + '%;"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<strong>LPG Connection Available:</strong> ' + lpgPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (lpgPct >= 80 ? 'success' : 'warning') + '" style="width:' + lpgPct + '%;"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<strong>Health Supplements Distributed:</strong> ' + healthPct + '%' +
        '<div class="bar-container"><div class="bar-fill ' + (healthPct >= 80 ? 'success' : 'warning') + '" style="width:' + healthPct + '%;"></div></div>' +
      '</div>' +
      '<div>' +
        '<strong>Average Rice Stock Available:</strong> <span class="badge Active">' + avgRice + ' KG per school</span>' +
      '</div>';

    document.getElementById('pmPoshanTrackerBody').innerHTML = html;
  }

  function populateAdminInspectorFilterDropdown(inspectors) {
    const select = document.getElementById('adminInspectorFilter');
    if (!select) return;
    select.innerHTML = '<option value="">All Inspectors</option>' +
      inspectors.map(function(i){ return '<option value="' + i.email + '">' + i.name + '</option>'; }).join('');
  }

  function filterMasterByInspector(email) {
    const select = document.getElementById('adminInspectorFilter');
    if (select) select.value = email;
    filterAdminMasterTable();
  }

  function filterAdminMasterTable() {
    const q = (document.getElementById('adminSearchInput').value || '').toLowerCase();
    const statusFilter = document.getElementById('adminStatusFilter').value;
    const inspectorFilter = document.getElementById('adminInspectorFilter').value.toLowerCase();

    const filtered = ADMIN_SUBMISSIONS.filter(function (s) {
      const matchQuery = !q || (s.schoolName || '').toLowerCase().indexOf(q) !== -1 || (s.inspectorName || '').toLowerCase().indexOf(q) !== -1;
      const matchStatus = !statusFilter || s.status === statusFilter;
      const matchInspector = !inspectorFilter || (s.inspectorEmail || '').toLowerCase() === inspectorFilter;
      return matchQuery && matchStatus && matchInspector;
    });

    const body = document.getElementById('adminMasterBody');
    const blockHeaderEl = document.getElementById('masterTableBlockHeader');
    const showBlockCol = !!(blockHeaderEl && blockHeaderEl.style.display !== 'none');
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="' + (showBlockCol ? 8 : 7) + '">No matching inspection records found.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map(function (r) {
      const d = r.data || {};
      const s3 = d.sec3 || {};
      const s4 = d.sec4 || {};
      const hasWater = isYes(s3.waterAvailable) || isYes(s4.safeDrinkingWater);
      const pmCompliant = isYes(s4.foodNormsDisplay) && isYes(s4.officerTasted);

      return '<tr>' +
        '<td><strong>' + (r.schoolName || '(untitled)') + '</strong></td>' +
        '<td>' + (r.inspectorName || r.inspectorEmail) + '</td>' +
        (showBlockCol ? '<td>' + (r.block || '') + '</td>' : '') +
        '<td>' + (r.inspectionDate || '') + '</td>' +
        '<td><span class="badge ' + (hasWater ? 'Submitted' : 'Draft') + '">' + (hasWater ? 'Yes' : 'No') + '</span></td>' +
        '<td><span class="badge ' + (pmCompliant ? 'Submitted' : 'Draft') + '">' + (pmCompliant ? 'Compliant' : 'Needs Review') + '</span></td>' +
        '<td><span class="badge ' + r.status + '">' + r.status + '</span></td>' +
        '<td>' +
          (r.pdfUrl ? '<a class="btn btn-small btn-secondary" href="' + r.pdfUrl + '" target="_blank">PDF</a>' : '<span style="color:#94a3b8; font-size:12px;">No PDF</span>') +
        '</td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('newFormBtn').addEventListener('click', function () { newForm(); });
  document.getElementById('backToDashBtn').addEventListener('click', function () { loadDashboard(); });

  // ====== DYNAMIC ROW BUILDERS ======
  function addAbsentRow(data) {
    data = data || {};
    const tbody = document.getElementById('absentRowsBody');
    const idx = tbody.children.length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="slno">' + idx + '</td>' +
      '<td><input type="text" class="absent-name" value="' + (data.name || '').replace(/"/g,'&quot;') + '"></td>' +
      '<td><input type="text" class="absent-leave" value="' + (data.leave || '').replace(/"/g,'&quot;') + '"></td>' +
      '<td><input type="text" class="absent-remarks" value="' + (data.remarks || '').replace(/"/g,'&quot;') + '"></td>' +
      '<td><button class="btn btn-small btn-danger" onclick="removeRow(this)">x</button></td>';
    tbody.appendChild(tr);
  }
  function removeRow(btn) {
    const tbody = btn.closest('tbody');
    btn.closest('tr').remove();
    Array.from(tbody.querySelectorAll('tr')).forEach(function (tr, i) { tr.querySelector('.slno').textContent = i + 1; });
  }
  document.getElementById('addAbsentRowBtn').addEventListener('click', function () { addAbsentRow(); });

  function buildAttendanceRows(existing) {
    const tbody = document.getElementById('attendanceRowsBody');
    tbody.innerHTML = '';
    ATTENDANCE_CLASSES.forEach(function (cls, i) {
      const row = (existing && existing[i]) || {};
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + cls + '</td>' +
        '<td><input type="number" class="att-total" oninput="recalcAttendance()" value="' + (row.total || '') + '"></td>' +
        '<td><input type="number" class="att-present" oninput="recalcAttendance()" value="' + (row.present || '') + '"></td>';
      tbody.appendChild(tr);
    });
    recalcAttendance();
  }
  function recalcAttendance() {
    let totalSum = 0, presentSum = 0;
    document.querySelectorAll('.att-total').forEach(function (el) { totalSum += Number(el.value) || 0; });
    document.querySelectorAll('.att-present').forEach(function (el) { presentSum += Number(el.value) || 0; });
    document.getElementById('f_grandTotal').value = totalSum;
    document.getElementById('f_grandPresent').value = presentSum;
  }

  function addDynamicTextRow(containerId, value, placeholder) {
    const container = document.getElementById(containerId);
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = '<textarea placeholder="' + (placeholder || '') + '">' + (value || '') + '</textarea>' +
      '<button class="btn btn-small btn-danger" onclick="this.parentElement.remove()">x</button>';
    container.appendChild(div);
  }
  document.getElementById('addClassroomCommentBtn').addEventListener('click', function () {
    addDynamicTextRow('classroomCommentsBody', '', 'Observation / comment');
  });
  document.getElementById('addOverallObsBtn').addEventListener('click', function () {
    addDynamicTextRow('overallObsBody', '', 'Observation / corrective action taken');
  });

  // ====== YES/NO HELPERS ======
  function setYesNo(groupId, value) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('input[type=radio]').forEach(function (r) { r.checked = (r.value === value); });
  }
  function getYesNo(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return '';
    const checked = group.querySelector('input[type=radio]:checked');
    return checked ? checked.value : '';
  }

  // ====== TABS / PART NAVIGATION ======
  const TOTAL_PARTS = 5;
  let CURRENT_PART = 1;

  function goToPart(n) {
    n = Math.max(1, Math.min(TOTAL_PARTS, n));
    CURRENT_PART = n;
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', Number(b.dataset.part) === n); });
    document.querySelectorAll('.part').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('part-' + n).classList.add('active');

    document.getElementById('prevPartBtn').style.display = (n > 1) ? 'inline-block' : 'none';
    document.getElementById('nextPartBtn').style.display = (n < TOTAL_PARTS) ? 'inline-block' : 'none';
    document.getElementById('previewPdfBtn').style.display = (n === TOTAL_PARTS) ? 'inline-block' : 'none';
    document.getElementById('submitFormBtn').style.display = (n === TOTAL_PARTS) ? 'inline-block' : 'none';
  }

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { goToPart(Number(btn.dataset.part)); });
  });
  document.getElementById('prevPartBtn').addEventListener('click', function () { goToPart(CURRENT_PART - 1); });
  document.getElementById('nextPartBtn').addEventListener('click', function () { goToPart(CURRENT_PART + 1); });

  // ====== FORM: NEW / OPEN / RESET ======
  function resetFormFields() {
    document.querySelectorAll('#view-form input[type=text], #view-form input[type=number], #view-form input[type=date], #view-form textarea').forEach(function (el) { el.value = ''; });
    document.querySelectorAll('#view-form select').forEach(function (el) { el.selectedIndex = 0; });
    document.querySelectorAll('#view-form input[type=radio]').forEach(function (el) { el.checked = false; });
    document.getElementById('absentRowsBody').innerHTML = '';
    document.getElementById('classroomCommentsBody').innerHTML = '';
    document.getElementById('overallObsBody').innerHTML = '';
    buildAttendanceRows([]);
    document.getElementById('formMsg').innerHTML = '';
  }

  function newForm() {
    CURRENT_SUBMISSION_ID = null;
    CURRENT_SUBMISSION_STATUS = '';
    resetFormFields();
    document.getElementById('formTitle').textContent = 'New Inspection';
    document.getElementById('f_inspectingOfficerName').value = CURRENT_INSPECTOR ? CURRENT_INSPECTOR.name : '';
    addAbsentRow(); addDynamicTextRow('classroomCommentsBody', ''); addDynamicTextRow('overallObsBody', '');
    updateSubmitButtonLabel();
    goToPart(1);
    showView('form');
// populateGPS(); // Moved to Get Location button
  }

function populateGPS() {
  const gpsInfo = document.getElementById('gpsInfo');
  if (navigator.geolocation) {
    if (gpsInfo) gpsInfo.textContent = 'Fetching location...';
    navigator.geolocation.getCurrentPosition(function(position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      document.getElementById('f_schoolLat').value = lat;
      document.getElementById('f_schoolLng').value = lng;
      if (gpsInfo) {
        const mapsUrl = 'https://www.google.com/maps?q=' + lat + ',' + lng;
        gpsInfo.innerHTML = 'Lat: ' + lat + ', Lng: ' + lng +
          ' &middot; <a href="' + mapsUrl + '" target="_blank" rel="noopener">View on Google Maps</a>';
      }
    }, function(error) {
      console.warn('Geolocation error:', error);
      if (gpsInfo) gpsInfo.textContent = 'Could not capture location: ' + error.message;
      // leave fields empty for manual entry
    }, { enableHighAccuracy: true });
  } else {
    console.warn('Geolocation not supported');
    if (gpsInfo) gpsInfo.textContent = 'Geolocation not supported by this browser.';
  }
}
document.getElementById('btnGetLocation')?.addEventListener('click', populateGPS);
  function updateSubmitButtonLabel() {
    document.getElementById('submitFormBtn').textContent = (CURRENT_SUBMISSION_STATUS === 'Submitted')
      ? 'Update & Resubmit (Regenerates PDF)'
      : 'Submit & Email PDF for Signature';
  }

  function openSubmission(id) {
    callApi('getSubmission', [SESSION_TOKEN, id])
      .then(function (res) {
        if (!res.ok) { showMsg('dashboardMsg', res.message, 'error'); return; }
        CURRENT_SUBMISSION_ID = id;
        CURRENT_SUBMISSION_STATUS = res.submission.status;
        resetFormFields();
        populateForm(res.submission.data);
        document.getElementById('formTitle').textContent = 'Edit Inspection (' + res.submission.status + ') -- fields remain fully editable, including after submission';
        updateSubmitButtonLabel();
        goToPart(1);
        showView('form');
      })
      .catch(function (err) { showMsg('dashboardMsg', err.message, 'error'); });
  }

  // ====== GATHER / POPULATE ======
  function gatherFormData() {
    const s1 = {
      schoolName: val('f_schoolName'),
      schoolLat: val('f_schoolLat'),
      schoolLng: val('f_schoolLng'),
      inspectionDate: val('f_inspectionDate'),
      inspectorate: val('f_inspectorate'), hmName: val('f_hmName'),
      pryStudent: val('f_pryStudent'), uppryStudent: val('f_uppryStudent'), highStudent: val('f_highStudent'), hsStudent: val('f_hsStudent'),
      pryTeacher: val('f_pryTeacher'), uppryTeacher: val('f_uppryTeacher'), highTeacher: val('f_highTeacher'), hsTeacher: val('f_hsTeacher'),
      otherStaff: val('f_otherStaff'),
      absentRows: Array.from(document.querySelectorAll('#absentRowsBody tr')).map(function (tr) {
        return { name: tr.querySelector('.absent-name').value, leave: tr.querySelector('.absent-leave').value, remarks: tr.querySelector('.absent-remarks').value };
      })
    };

    const s2 = {
      rows: Array.from(document.querySelectorAll('#attendanceRowsBody tr')).map(function (tr, i) {
        return { className: ATTENDANCE_CLASSES[i], total: tr.querySelector('.att-total').value, present: tr.querySelector('.att-present').value };
      }),
      grandTotal: val('f_grandTotal'), grandPresent: val('f_grandPresent')
    };

    const s3 = {
      waterAvailable: getYesNo('f_waterAvailable_group'), waterType: val('f_waterType'),
      toiletAvailable: getYesNo('f_toiletAvailable_group'), toiletCleaned: getYesNo('f_toiletCleaned_group'), toiletWater: getYesNo('f_toiletWater_group'),
      dressGrant: getYesNo('f_dressGrant_group'), premetric: getYesNo('f_premetric_group'),
      compositeUtilized: getYesNo('f_compositeUtilized_group'), compositeReceived: val('f_compositeReceived'), compositeSpent: val('f_compositeSpent'),
      othersUtilized: getYesNo('f_othersUtilized_group'), othersReceived: val('f_othersReceived'), othersSpent: val('f_othersSpent'),
      bicycleDistributed: getYesNo('f_bicycleDistributed_group'), eligibleGirls: val('f_eligibleGirls'), bicyclesDistributed: val('f_bicyclesDistributed'),
      textbookSupplied: getYesNo('f_textbookSupplied_group'), electricity: getYesNo('f_electricity_group'), computers: val('f_computers'),
      ictLab: getYesNo('f_ictLab_group'), ictLabStatus: val('f_ictLabStatus'),
      vocational: getYesNo('f_vocational_group'), vocationalStatus: val('f_vocationalStatus'),
      smcRegular: getYesNo('f_smcRegular_group'), smcCount: val('f_smcCount'), smcObservation: val('f_smcObservation'),
      classroomComments: Array.from(document.querySelectorAll('#classroomCommentsBody textarea')).map(function (t) { return t.value; }),
      prevIssuesResolved: getYesNo('f_prevIssuesResolved_group'), prevIssuesDetails: val('f_prevIssuesDetails')
    };

    const s4 = {
      foodNormsDisplay: getYesNo('f_foodNormsDisplay_group'), weeklyMenuDisplay: getYesNo('f_weeklyMenuDisplay_group'),
      feedingRegister: val('f_feedingRegister'), stockRegister: val('f_stockRegister'), foodTastingRegister: val('f_foodTastingRegister'),
      officerTasted: getYesNo('f_officerTasted_group'), cookedFoodComment: val('f_cookedFoodComment'), riceStockKg: val('f_riceStockKg'),
      foodGrainsQuality: val('f_foodGrainsQuality'), foodGrainsTimely: getYesNo('f_foodGrainsTimely_group'), lastReceiptDate: val('f_lastReceiptDate'),
      bufferStock: getYesNo('f_bufferStock_group'), riceStoredGoodBin: getYesNo('f_riceStoredGoodBin_group'), binsAvailable: val('f_binsAvailable'),
      cookHelpersCount: val('f_cookHelpersCount'), apronScarfUsed: getYesNo('f_apronScarfUsed_group'), cookHelperTraining: getYesNo('f_cookHelperTraining_group'),
      remunerationPaidUpTo: val('f_remunerationPaidUpTo'),
      kitchenShedExists: getYesNo('f_kitchenShedExists_group'), diningHallExists: getYesNo('f_diningHallExists_group'), kitchenShedStatus: val('f_kitchenShedStatus'),
      lpgConnection: getYesNo('f_lpgConnection_group'), kitchenDevicesAvailable: getYesNo('f_kitchenDevicesAvailable_group'), safeDrinkingWater: getYesNo('f_safeDrinkingWater_group'),
      drinkingWaterAlt: val('f_drinkingWaterAlt'), separateToilet: getYesNo('f_separateToilet_group'),
      handWashActivity: getYesNo('f_handWashActivity_group'), kitchenShedCleaned: getYesNo('f_kitchenShedCleaned_group'), riceCleanHygiene: getYesNo('f_riceCleanHygiene_group'),
      pulsesOilsSafe: getYesNo('f_pulsesOilsSafe_group'), kitchenDevicesCleaned: getYesNo('f_kitchenDevicesCleaned_group'),
      lastDoctorVisitDate: val('f_lastDoctorVisitDate'), ifaTablets: getYesNo('f_ifaTablets_group'), vitaminA: getYesNo('f_vitaminA_group'), dewormingTablets: getYesNo('f_dewormingTablets_group'),
      monitoringInstituteDate: val('f_monitoringInstituteDate')
    };

    const s5 = {
      interactionMade: getYesNo('f_interactionMade_group'), interactionWith: val('f_interactionWith'),
      overallObservations: Array.from(document.querySelectorAll('#overallObsBody textarea')).map(function (t) { return t.value; }),
      hmSignName: val('f_hmSignName'), hmDate: val('f_hmDate'),
      inspectingOfficerName: val('f_inspectingOfficerName'), inspectingOfficerDate: val('f_inspectingOfficerDate')
    };

    return { _id: CURRENT_SUBMISSION_ID, sec1: s1, sec2: s2, sec3: s3, sec4: s4, sec5: s5 };
  }

  function populateForm(data) {
    const s1 = data.sec1 || {}, s2 = data.sec2 || {}, s3 = data.sec3 || {}, s4 = data.sec4 || {}, s5 = data.sec5 || {};
    setVal('f_schoolName', s1.schoolName); setVal('f_inspectionDate', s1.inspectionDate);
    setVal('f_inspectorate', s1.inspectorate); setVal('f_hmName', s1.hmName);
    setVal('f_pryStudent', s1.pryStudent); setVal('f_uppryStudent', s1.uppryStudent); setVal('f_highStudent', s1.highStudent); setVal('f_hsStudent', s1.hsStudent);
    setVal('f_pryTeacher', s1.pryTeacher); setVal('f_uppryTeacher', s1.uppryTeacher); setVal('f_highTeacher', s1.highTeacher); setVal('f_hsTeacher', s1.hsTeacher);
    setVal('f_otherStaff', s1.otherStaff);
    setVal('f_schoolLat', s1.schoolLat);
    setVal('f_schoolLng', s1.schoolLng);
    const gpsInfo = document.getElementById('gpsInfo');
    if (s1.schoolLat && s1.schoolLng) {
      const mapsUrl = 'https://www.google.com/maps?q=' + s1.schoolLat + ',' + s1.schoolLng;
      gpsInfo.innerHTML = 'Lat: ' + s1.schoolLat + ', Lng: ' + s1.schoolLng +
        ' &middot; <a href="' + mapsUrl + '" target="_blank" rel="noopener">View on Google Maps</a>';
    } else {
      gpsInfo.textContent = 'Location not captured';
    }
    document.getElementById('absentRowsBody').innerHTML = '';
    (s1.absentRows && s1.absentRows.length ? s1.absentRows : [{}]).forEach(function (r) { addAbsentRow(r); });

    buildAttendanceRows(s2.rows || []);

    setYesNo('f_waterAvailable_group', s3.waterAvailable); setVal('f_waterType', s3.waterType);
    setYesNo('f_toiletAvailable_group', s3.toiletAvailable); setYesNo('f_toiletCleaned_group', s3.toiletCleaned); setYesNo('f_toiletWater_group', s3.toiletWater);
    setYesNo('f_dressGrant_group', s3.dressGrant); setYesNo('f_premetric_group', s3.premetric);
    setYesNo('f_compositeUtilized_group', s3.compositeUtilized); setVal('f_compositeReceived', s3.compositeReceived); setVal('f_compositeSpent', s3.compositeSpent);
    setYesNo('f_othersUtilized_group', s3.othersUtilized); setVal('f_othersReceived', s3.othersReceived); setVal('f_othersSpent', s3.othersSpent);
    setYesNo('f_bicycleDistributed_group', s3.bicycleDistributed); setVal('f_eligibleGirls', s3.eligibleGirls); setVal('f_bicyclesDistributed', s3.bicyclesDistributed);
    setYesNo('f_textbookSupplied_group', s3.textbookSupplied); setYesNo('f_electricity_group', s3.electricity); setVal('f_computers', s3.computers);
    setYesNo('f_ictLab_group', s3.ictLab); setVal('f_ictLabStatus', s3.ictLabStatus);
    setYesNo('f_vocational_group', s3.vocational); setVal('f_vocationalStatus', s3.vocationalStatus);
    setYesNo('f_smcRegular_group', s3.smcRegular); setVal('f_smcCount', s3.smcCount); setVal('f_smcObservation', s3.smcObservation);
    document.getElementById('classroomCommentsBody').innerHTML = '';
    (s3.classroomComments && s3.classroomComments.length ? s3.classroomComments : ['']).forEach(function (c) { addDynamicTextRow('classroomCommentsBody', c); });
    setYesNo('f_prevIssuesResolved_group', s3.prevIssuesResolved); setVal('f_prevIssuesDetails', s3.prevIssuesDetails);

    setYesNo('f_foodNormsDisplay_group', s4.foodNormsDisplay); setYesNo('f_weeklyMenuDisplay_group', s4.weeklyMenuDisplay);
    setVal('f_feedingRegister', s4.feedingRegister); setVal('f_stockRegister', s4.stockRegister); setVal('f_foodTastingRegister', s4.foodTastingRegister);
    setYesNo('f_officerTasted_group', s4.officerTasted); setVal('f_cookedFoodComment', s4.cookedFoodComment); setVal('f_riceStockKg', s4.riceStockKg);
    setVal('f_foodGrainsQuality', s4.foodGrainsQuality); setYesNo('f_foodGrainsTimely_group', s4.foodGrainsTimely); setVal('f_lastReceiptDate', s4.lastReceiptDate);
    setYesNo('f_bufferStock_group', s4.bufferStock); setYesNo('f_riceStoredGoodBin_group', s4.riceStoredGoodBin); setVal('f_binsAvailable', s4.binsAvailable);
    setVal('f_cookHelpersCount', s4.cookHelpersCount); setYesNo('f_apronScarfUsed_group', s4.apronScarfUsed); setYesNo('f_cookHelperTraining_group', s4.cookHelperTraining);
    setVal('f_remunerationPaidUpTo', s4.remunerationPaidUpTo);
    setYesNo('f_kitchenShedExists_group', s4.kitchenShedExists); setYesNo('f_diningHallExists_group', s4.diningHallExists); setVal('f_kitchenShedStatus', s4.kitchenShedStatus);
    setYesNo('f_lpgConnection_group', s4.lpgConnection); setYesNo('f_kitchenDevicesAvailable_group', s4.kitchenDevicesAvailable); setYesNo('f_safeDrinkingWater_group', s4.safeDrinkingWater);
    setVal('f_drinkingWaterAlt', s4.drinkingWaterAlt); setYesNo('f_separateToilet_group', s4.separateToilet);
    setYesNo('f_handWashActivity_group', s4.handWashActivity); setYesNo('f_kitchenShedCleaned_group', s4.kitchenShedCleaned); setYesNo('f_riceCleanHygiene_group', s4.riceCleanHygiene);
    setYesNo('f_pulsesOilsSafe_group', s4.pulsesOilsSafe); setYesNo('f_kitchenDevicesCleaned_group', s4.kitchenDevicesCleaned);
    setVal('f_lastDoctorVisitDate', s4.lastDoctorVisitDate); setYesNo('f_ifaTablets_group', s4.ifaTablets); setYesNo('f_vitaminA_group', s4.vitaminA); setYesNo('f_dewormingTablets_group', s4.dewormingTablets);
    setVal('f_monitoringInstituteDate', s4.monitoringInstituteDate);

    setYesNo('f_interactionMade_group', s5.interactionMade); setVal('f_interactionWith', s5.interactionWith);
    document.getElementById('overallObsBody').innerHTML = '';
    (s5.overallObservations && s5.overallObservations.length ? s5.overallObservations : ['']).forEach(function (c) { addDynamicTextRow('overallObsBody', c); });
    setVal('f_hmSignName', s5.hmSignName); setVal('f_hmDate', s5.hmDate);
    setVal('f_inspectingOfficerName', s5.inspectingOfficerName); setVal('f_inspectingOfficerDate', s5.inspectingOfficerDate);
  }

  function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }
  function setVal(id, v) { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; }

  // ====== SAVE / SUBMIT ======
  document.getElementById('saveDraftBtn').addEventListener('click', function () {
    const btn = this; btn.disabled = true;
    const data = gatherFormData();
    callApi('saveDraft', [SESSION_TOKEN, data])
      .then(function (res) {
        btn.disabled = false;
        if (res.ok) { CURRENT_SUBMISSION_ID = res.id; showMsg('formMsg', 'Draft saved.', 'success'); }
        else showMsg('formMsg', res.message, 'error');
      })
      .catch(function (err) { btn.disabled = false; showMsg('formMsg', err.message, 'error'); });
  });

  document.getElementById('previewPdfBtn').addEventListener('click', function () {
    const btn = this;
    const originalText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Generating preview...';
    const data = gatherFormData();

    let settled = false;
    const timeoutId = setTimeout(function () {
      if (settled) return;
      settled = true;
      btn.disabled = false; btn.textContent = originalText;
      showMsg('formMsg', 'No response after 45 seconds. This usually means a browser extension (e.g. Brave Shields, an ad-blocker) is blocking this app\'s connection to Google -- try disabling it for this page and reload, or try a different browser.', 'error');
    }, 45000);

    callApi('previewPdf', [SESSION_TOKEN, data])
      .then(function (res) {
        if (settled) return;
        settled = true; clearTimeout(timeoutId);
        btn.disabled = false; btn.textContent = originalText;
        console.log('previewPdf response:', res);
        if (!res || !res.ok) {
          const detail = (res && res.message) || 'no response received from server';
          showMsg('formMsg', 'Preview failed: ' + detail, 'error');
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
        } catch (e) {
          showMsg('formMsg', 'Could not open PDF preview: ' + e.message, 'error');
        }
      })
      .catch(function (err) {
        if (settled) return;
        settled = true; clearTimeout(timeoutId);
        btn.disabled = false; btn.textContent = originalText;
        console.error('previewPdf failure:', err);
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
      a.href = url; a.download = filename || 'inspection.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
      return true;
    } catch (e) {
      console.error('Download failed:', e);
      return false;
    }
  }

  document.getElementById('submitFormBtn').addEventListener('click', function () {
    if (!confirm('Submit this inspection? A PDF will be generated, emailed to you, and downloaded to this device for physical signature.')) return;
    const btn = this; btn.disabled = true;
    const data = gatherFormData();
    callApi('submitForm', [SESSION_TOKEN, data])
      .then(function (res) {
        btn.disabled = false;
        console.log('submitForm response:', res);
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
      .catch(function (err) {
        btn.disabled = false;
        showMsg('formMsg', 'Submit failed: ' + err.message, 'error');
      });
  });
