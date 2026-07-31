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
    document.getElementById('view-' + name).classList.add('active');
    document.getElementById('userBadge').style.display = (name === 'login') ? 'none' : 'flex';
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
          document.getElementById('userName').textContent = CURRENT_INSPECTOR.name + ' (' + CURRENT_INSPECTOR.email + ')';
          document.getElementById('userBadge').style.display = 'flex';
          loadDashboard();
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
  }

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
      schoolName: val('f_schoolName'), inspectionDate: val('f_inspectionDate'),
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
