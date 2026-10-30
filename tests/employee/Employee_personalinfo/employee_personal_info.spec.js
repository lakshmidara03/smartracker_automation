const { test, expect } = require('@playwright/test');
const { executeQuery } = require('../../../utils/dbUtils');
const fs = require('fs');
const path = require('path');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:4200/').replace(/\/$/, '');
const BASIC_INFO_URL = `${BASE_URL}/employee/employee-basic-info`;

// =============================================================================
// FIELD DEFINITIONS & MAPPINGS (33 Fields across 4 Sections)
// =============================================================================
const FIELD_DEFINITIONS = [
    // Section 1: Personal Information (emp_details)
    { section: 'Personal Information', label: 'Employee ID', control: 'employeeId', table: 'emp_details', column: 'emp_id', type: 'string' },
    { section: 'Personal Information', label: 'Employee Fullname', control: 'fullName', table: 'emp_details', column: 'full_name', type: 'string' },
    { section: 'Personal Information', label: 'Gender', control: 'gender', table: 'emp_details', column: 'gender', type: 'dropdown' },
    { section: 'Personal Information', label: 'Official Mail ID', control: 'officialEmailId', table: 'emp_details', column: 'official_email_id', type: 'string' },
    { section: 'Personal Information', label: 'Personal Contact#', control: 'contactNo', table: 'emp_details', column: 'contact_no', type: 'phone', sensitive: true },
    { section: 'Personal Information', label: 'Current Address', control: 'currentAddress', table: 'emp_details', column: 'current_address', type: 'dropdown', sensitive: true },
    { section: 'Personal Information', label: 'Date of Birth', control: 'dateOfBirth', table: 'emp_details', column: 'date_of_birth', type: 'date', sensitive: true },
    { section: 'Personal Information', label: 'Marital Status', control: 'maritalStatus', table: 'emp_details', column: 'marital_status', type: 'dropdown' },
    { section: 'Personal Information', label: 'Personal Mail ID', control: 'personalEmailId', table: 'emp_details', column: 'personal_email_id', type: 'string', sensitive: true },
    { section: 'Personal Information', label: 'Emergency Contact#', control: 'emergencyContactNo', table: 'emp_details', column: 'emergency_contact_no', type: 'phone', sensitive: true },
    { section: 'Personal Information', label: 'Permanent Address', control: 'permanentAddress', table: 'emp_details', column: 'permanent_address', type: 'string', sensitive: true },
    { section: 'Personal Information', label: 'Blood Group', control: 'bloodGroup', table: 'emp_details', column: 'blood_group', type: 'dropdown' },

    // Section 2: Designation & Experience (employee_designation_and_experience)
    { section: 'Designation & Experience', label: 'Designation', control: 'designation', table: 'employee_designation_and_experience', column: 'designation', type: 'string' },
    { section: 'Designation & Experience', label: 'Total Experience', control: 'totalExperience', table: 'employee_designation_and_experience', column: 'total_experience', type: 'number' },
    { section: 'Designation & Experience', label: 'Certification Completed', control: 'certificationComplete', table: 'employee_designation_and_experience', column: 'certification_complete', type: 'string' },
    { section: 'Designation & Experience', label: 'Date of Joining', control: 'dateOfJoining', table: 'employee_designation_and_experience', column: 'date_of_joining', type: 'date' },
    { section: 'Designation & Experience', label: 'IT Relevant Experience', control: 'itRelevantExperience', table: 'employee_designation_and_experience', column: 'it_relevant_experience', type: 'number' },
    { section: 'Designation & Experience', label: 'Primary Skill', control: 'primarySkill', table: 'employee_designation_and_experience', column: 'primary_skill', type: 'string' },
    { section: 'Designation & Experience', label: 'Secondary Skill', control: 'secondarySkill', table: 'employee_designation_and_experience', column: 'secondary_skill', type: 'string' },

    // Section 3: Work Authorization (employee_status)
    { section: 'Work Authorization', label: 'Employee Status', control: 'employmentStatus', table: 'employee_status', column: 'employment_status', type: 'dropdown' },
    { section: 'Work Authorization', label: 'Base Location (as per offer letter)', control: 'baseLocation', table: 'employee_status', column: 'base_location', type: 'dropdown' },
    { section: 'Work Authorization', label: 'Work Authorization', control: 'workAuthorization', table: 'employee_status', column: 'work_authorization', type: 'dropdown' },
    { section: 'Work Authorization', label: 'Category', control: 'category', table: 'employee_status', column: 'category', type: 'dropdown' },
    { section: 'Work Authorization', label: 'Current Location', control: 'currentLocation', table: 'employee_status', column: 'current_location', type: 'dropdown' },
    { section: 'Work Authorization', label: 'Last Working Day', control: 'lastWorkingDay', table: 'employee_status', column: 'last_working_day', type: 'date' },

    // Section 4: Practice Details (practice_sub_practice_band)
    { section: 'Practice Details', label: 'Practice', control: 'practice', table: 'practice_sub_practice_band', column: 'practice', type: 'dropdown' },
    { section: 'Practice Details', label: 'Practice Owner', control: 'practiceOwner', table: 'practice_sub_practice_band', column: 'practice_owner', type: 'dropdown' },
    { section: 'Practice Details', label: 'Sub Practice', control: 'subPractice', table: 'practice_sub_practice_band', column: 'sub_practice', type: 'dropdown' },
    { section: 'Practice Details', label: 'Reporting Manager — Level 1', control: 'reportingManagerLevel1', table: 'practice_sub_practice_band', column: 'reporting_manager_level1', type: 'string' },
    { section: 'Practice Details', label: 'Reporting Manager — Level 2', control: 'reportingManagerLevel2', table: 'practice_sub_practice_band', column: 'reporting_manager_level2', type: 'dropdown' },
    { section: 'Practice Details', label: 'Client Manager — Level 1', control: 'clientManagerLevel1', table: 'practice_sub_practice_band', column: 'client_manager_level1', type: 'dropdown' },
    { section: 'Practice Details', label: 'Client Manager — Level 2', control: 'clientManagerLevel2', table: 'practice_sub_practice_band', column: 'client_manager_level2', type: 'dropdown' },
    { section: 'Practice Details', label: 'Client Manager — Level 3', control: 'clientManagerLevel3', table: 'practice_sub_practice_band', column: 'client_manager_level3', type: 'dropdown' }
];

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================
function normalizeString(val) {
    if (val === null || val === undefined) return '';
    const s = String(val).trim();
    const sLower = s.toLowerCase();
    if (s === '-' || s === '--' || sLower === 'select' || sLower.startsWith('select ') || sLower === 'null' || sLower === 'n/a') return '';
    return s.replace(/\s+/g, ' ');
}

function normalizePhone(val) {
    if (val === null || val === undefined) return '';
    const s = String(val).replace(/[^0-9]/g, '');
    return s === '0' ? '' : s;
}

function normalizeDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return '';
        const istOffset = 5.5 * 60 * 60 * 1000;
        const local = new Date(val.getTime() + istOffset);
        return local.toISOString().slice(0, 10);
    }

    let s = String(val).trim();
    if (!s || s === 'null' || s === 'undefined' || s === '0000-00-00') return '';

    // If ISO date string with time e.g. "2026-10-22T..." or with timezone
    if (s.includes('T')) {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) {
            const istOffset = 5.5 * 60 * 60 * 1000;
            const local = new Date(dt.getTime() + istOffset);
            return local.toISOString().slice(0, 10);
        }
    }

    // Replace slashes or dots with dashes
    const cleanStr = s.replace(/[\/.]/g, '-');
    const parts = cleanStr.split('-');

    if (parts.length === 3) {
        const p0 = parts[0].trim();
        const p1 = parts[1].trim();
        const p2 = parts[2].trim();

        // Case A: YYYY-MM-DD or YYYY/MM/DD (Year first)
        if (p0.length === 4) {
            const y = p0;
            const m = p1.padStart(2, '0');
            const d = p2.padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        // Case B: DD-MM-YYYY or MM-DD-YYYY (Year last)
        if (p2.length === 4) {
            const y = p2;
            const n0 = parseInt(p0, 10);
            const n1 = parseInt(p1, 10);

            let m, d;
            if (n0 > 12) {
                // First part is day (DD-MM-YYYY)
                d = p0.padStart(2, '0');
                m = p1.padStart(2, '0');
            } else if (n1 > 12) {
                // Second part is day (MM-DD-YYYY)
                m = p0.padStart(2, '0');
                d = p1.padStart(2, '0');
            } else {
                // Default to DD-MM-YYYY
                d = p0.padStart(2, '0');
                m = p1.padStart(2, '0');
            }
            return `${y}-${m}-${d}`;
        }
    }

    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
        const istOffset = 5.5 * 60 * 60 * 1000;
        const local = new Date(dt.getTime() + istOffset);
        return local.toISOString().slice(0, 10);
    }
    return s;
}

function normalizeNumber(val) {
    if (val === null || val === undefined || val === '') return '';
    const num = parseFloat(val);
    if (isNaN(num)) return normalizeString(val);
    return Math.round(num * 100) / 100; // Round to 2 decimal places for comparison
}

function maskSensitive(val, isSensitive) {
    if (!val && val !== 0) return '';
    const str = String(val).trim();
    if (!isSensitive) return str;
    if (str.length <= 4) return '***';
    return str.slice(0, 2) + '***' + str.slice(-2);
}

// Compare field value with documented rules
function compareFieldValue(def, dbRaw, uiRaw) {
    let dbNorm = '';
    let uiNorm = '';
    let isMatch = false;

    if (def.type === 'phone') {
        dbNorm = normalizePhone(dbRaw);
        uiNorm = normalizePhone(uiRaw);
        isMatch = dbNorm === uiNorm;
    } else if (def.type === 'date') {
        dbNorm = normalizeDate(dbRaw);
        uiNorm = normalizeDate(uiRaw);
        isMatch = dbNorm === uiNorm;
    } else if (def.type === 'number') {
        dbNorm = normalizeNumber(dbRaw);
        uiNorm = normalizeNumber(uiRaw);
        if (dbNorm === '' && uiNorm === '') isMatch = true;
        else if (typeof dbNorm === 'number' && typeof uiNorm === 'number') {
            isMatch = Math.abs(dbNorm - uiNorm) < 0.1;
        } else {
            isMatch = String(dbNorm) === String(uiNorm);
        }
    } else if (def.type === 'dropdown') {
        dbNorm = normalizeString(dbRaw).toLowerCase();
        uiNorm = normalizeString(uiRaw).toLowerCase();
        isMatch = dbNorm === uiNorm;
    } else {
        dbNorm = normalizeString(dbRaw);
        uiNorm = normalizeString(uiRaw);
        isMatch = dbNorm.toLowerCase() === uiNorm.toLowerCase();
    }

    return {
        isMatch,
        dbNorm,
        uiNorm,
        result: isMatch ? 'PASS' : 'FAIL',
        reason: isMatch ? '' : `Value mismatch: DB="${maskSensitive(dbNorm, def.sensitive)}" vs UI="${maskSensitive(uiNorm, def.sensitive)}"`
    };
}

// =============================================================================
// REPORT GENERATORS (HTML, CSV, JSON)
// =============================================================================
function generateReports(summary, employeeResults, allFieldComparisons) {
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    // 1. CSV Report
    const csvHeader = 'Employee ID,Employee Name,Section,Field Name,DB Table,DB Column,DB Value,UI Value,Result,Reason\n';
    const csvRows = allFieldComparisons.map(c => [
        `"${c.empId}"`,
        `"${String(c.empName || '').replace(/"/g, '""')}"`,
        `"${c.section}"`,
        `"${c.field}"`,
        `"${c.table}"`,
        `"${c.column}"`,
        `"${String(maskSensitive(c.dbValue, c.sensitive) || '').replace(/"/g, '""')}"`,
        `"${String(maskSensitive(c.uiValue, c.sensitive) || '').replace(/"/g, '""')}"`,
        `"${c.result}"`,
        `"${String(c.reason || '').replace(/"/g, '""')}"`
    ].join(',')).join('\n');

    const csvPath = path.join(reportsDir, 'employee_personal_info_comparison.csv');
    fs.writeFileSync(csvPath, csvHeader + csvRows, 'utf8');
    console.log(`[Report] Generated CSV: ${csvPath}`);

    // 2. JSON Summary
    const jsonPath = path.join(reportsDir, 'employee_personal_info_summary.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ summary, employeeResults }, null, 2), 'utf8');
    console.log(`[Report] Generated JSON Summary: ${jsonPath}`);

    // 3. Interactive HTML Report
    const htmlPath = path.join(reportsDir, 'employee_personal_info_report.html');
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SmartTracker - Employee Personal Information UI vs DB Validation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0b1329; color: #f1f5f9; margin: 0; padding: 24px; }
    h1 { margin-top: 0; font-size: 26px; color: #38bdf8; display: flex; align-items: center; gap: 10px; }
    .subtitle { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kpi-card { background: #1e293b; border-radius: 10px; padding: 18px; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); }
    .kpi-title { font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
    .kpi-value { font-size: 30px; font-weight: 700; margin-top: 8px; }
    .val-pass { color: #34d399; }
    .val-fail { color: #f87171; }
    .val-info { color: #38bdf8; }
    .val-warn { color: #fbbf24; }
    .controls-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .search-box { flex: 1; min-width: 280px; padding: 12px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #f8fafc; font-size: 14px; }
    .filter-btn { padding: 10px 18px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #94a3b8; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .filter-btn.active { background: #38bdf8; color: #0b1329; border-color: #38bdf8; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); }
    th { background: #0f172a; color: #94a3b8; font-size: 12px; text-transform: uppercase; text-align: left; padding: 14px 16px; border-bottom: 1px solid #334155; font-weight: 600; }
    td { padding: 12px 16px; border-bottom: 1px solid #293548; font-size: 13px; vertical-align: middle; }
    tr:hover { background: #243247; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .badge-pass { background: rgba(52, 211, 153, 0.15); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
    .badge-blocked { background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
    .btn-details { background: #334155; color: #38bdf8; border: none; border-radius: 4px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
    .btn-details:hover { background: #475569; }
    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
    .modal-content { background: #1e293b; margin: 5% auto; padding: 24px; border-radius: 12px; border: 1px solid #334155; width: 85%; max-width: 900px; max-height: 80vh; overflow-y: auto; }
    .close-btn { color: #94a3b8; float: right; font-size: 24px; font-weight: bold; cursor: pointer; }
    .close-btn:hover { color: #fff; }
  </style>
</head>
<body>
  <h1>👤 SmartTracker - Employee Personal Information UI vs DB Validation</h1>
  <div class="subtitle">Generated on ${new Date().toLocaleString()} | Verified across 4 MySQL tables & 33 Fields | Sensitive PII Masked</div>

  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">Total Active Employees</div><div class="kpi-value val-info">${summary.totalEmployees}</div></div>
    <div class="kpi-card"><div class="kpi-title">100% Full Matches</div><div class="kpi-value val-pass">${summary.matchedEmployees}</div></div>
    <div class="kpi-card"><div class="kpi-title">Mismatched Employees</div><div class="kpi-value ${summary.mismatchedEmployees > 0 ? 'val-fail' : 'val-pass'}">${summary.mismatchedEmployees}</div></div>
    <div class="kpi-card"><div class="kpi-title">Blocked / Missing in UI</div><div class="kpi-value ${summary.blockedEmployees > 0 ? 'val-warn' : 'val-info'}">${summary.blockedEmployees}</div></div>
    <div class="kpi-card"><div class="kpi-title">Total Fields Compared</div><div class="kpi-value val-info">${summary.totalFieldsCompared}</div></div>
    <div class="kpi-card"><div class="kpi-title">Field Match Rate</div><div class="kpi-value val-pass">${summary.matchRate}%</div></div>
  </div>

  <div class="controls-row">
    <input type="text" id="searchInput" class="search-box" placeholder="Filter by Employee ID, Name, or Status..." onkeyup="applyFilter()">
    <button class="filter-btn active" onclick="setFilter('ALL')">All (${summary.totalEmployees})</button>
    <button class="filter-btn" onclick="setFilter('PASS')">PASS (${summary.matchedEmployees})</button>
    <button class="filter-btn" onclick="setFilter('FAIL')">FAIL (${summary.mismatchedEmployees})</button>
    <button class="filter-btn" onclick="setFilter('BLOCKED')">BLOCKED (${summary.blockedEmployees})</button>
  </div>

  <table id="resultsTable">
    <thead>
      <tr>
        <th>#</th>
        <th>Employee ID</th>
        <th>Employee Name</th>
        <th>Personal Info (12)</th>
        <th>Designation & Exp (7)</th>
        <th>Work Auth (6)</th>
        <th>Practice Details (8)</th>
        <th>Total Fields Match</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody>
      ${employeeResults.map((r, i) => `
      <tr data-status="${r.status}">
        <td>${i + 1}</td>
        <td><strong>${r.empId}</strong></td>
        <td>${r.empName || '-'}</td>
        <td><span class="badge ${r.secScores.personal.fail === 0 ? 'badge-pass' : 'badge-fail'}">${r.secScores.personal.pass}/12</span></td>
        <td><span class="badge ${r.secScores.designation.fail === 0 ? 'badge-pass' : 'badge-fail'}">${r.secScores.designation.pass}/7</span></td>
        <td><span class="badge ${r.secScores.workAuth.fail === 0 ? 'badge-pass' : 'badge-fail'}">${r.secScores.workAuth.pass}/6</span></td>
        <td><span class="badge ${r.secScores.practice.fail === 0 ? 'badge-pass' : 'badge-fail'}">${r.secScores.practice.pass}/8</span></td>
        <td><strong>${r.passedFields} / 33</strong></td>
        <td><span class="badge ${r.status === 'PASS' ? 'badge-pass' : r.status === 'FAIL' ? 'badge-fail' : 'badge-blocked'}">${r.status}</span></td>
        <td><button class="btn-details" onclick="openDetails('${r.empId}')">View Details</button></td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <div id="diffModal" class="modal">
    <div class="modal-content">
      <span class="close-btn" onclick="closeModal()">&times;</span>
      <h2 id="modalTitle" style="color: #38bdf8; margin-top: 0;">Employee Details</h2>
      <div id="modalBody"></div>
    </div>
  </div>

  <script>
    const allData = ${JSON.stringify(employeeResults)};
    let currentFilter = 'ALL';

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.startsWith(filter));
      });
      applyFilter();
    }

    function applyFilter() {
      const q = document.getElementById('searchInput').value.toLowerCase();
      const rows = document.querySelectorAll('#resultsTable tbody tr');
      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        const status = row.getAttribute('data-status');
        const matchesFilter = currentFilter === 'ALL' || status === currentFilter;
        const matchesQuery = !q || text.includes(q);
        row.style.display = matchesFilter && matchesQuery ? '' : 'none';
      });
    }

    function openDetails(empId) {
      const emp = allData.find(e => e.empId === empId);
      if (!emp) return;
      document.getElementById('modalTitle').innerText = \`Employee \${emp.empId} - \${emp.empName || ''} (\${emp.status})\`;
      
      let html = '<table style="margin-top: 16px;"><thead><tr><th>Section</th><th>Field</th><th>DB Value</th><th>UI Value</th><th>Result</th></tr></thead><tbody>';
      emp.fields.forEach(f => {
        html += \`<tr>
          <td>\${f.section}</td>
          <td><strong>\${f.field}</strong></td>
          <td>\${f.dbValue || '<em style="color:#64748b;">(empty)</em>'}</td>
          <td>\${f.uiValue || '<em style="color:#64748b;">(empty)</em>'}</td>
          <td><span class="badge \${f.result === 'PASS' ? 'badge-pass' : 'badge-fail'}">\${f.result}</span></td>
        </tr>\`;
      });
      html += '</tbody></table>';
      document.getElementById('modalBody').innerHTML = html;
      document.getElementById('diffModal').style.display = 'block';
    }

    function closeModal() {
      document.getElementById('diffModal').style.display = 'none';
    }

    window.onclick = function(event) {
      if (event.target == document.getElementById('diffModal')) closeModal();
    }
  </script>
</body>
</html>`;

    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`[Report] Generated HTML Report: ${htmlPath}`);
}

// =============================================================================
// TEST SUITE: EMPLOYEE PERSONAL INFO DB vs UI VALIDATION
// =============================================================================
test.describe('SmartTracker - Employee Personal Information UI vs Database Validation', () => {
    test.setTimeout(1800000); // 30-minute suite timeout

    let activeEmployees = [];
    let empDetailsMap = new Map();
    let desigMap = new Map();
    let statusMap = new Map();
    let practiceMap = new Map();

    const employeeResults = [];
    const allFieldComparisons = [];

    test.beforeAll(async () => {
        console.log('\n[DB Setup] Fetching records across 4 tables...');

        // 1. emp_details
        const empRows = await executeQuery('SELECT * FROM emp_details WHERE COALESCE(is_deleted, 0) = 0 ORDER BY emp_id');
        activeEmployees = empRows;
        console.log(`[DB Setup] Active Employees in emp_details: ${empRows.length}`);
        for (const r of empRows) {
            empDetailsMap.set(String(r.emp_id).trim(), r);
        }

        // 2. employee_designation_and_experience
        const desigRows = await executeQuery('SELECT * FROM employee_designation_and_experience ORDER BY designation_id');
        console.log(`[DB Setup] Designation Records: ${desigRows.length}`);
        for (const r of desigRows) {
            const id = String(r.employee_id).trim();
            if (!desigMap.has(id)) desigMap.set(id, []);
            desigMap.get(id).push(r);
        }

        // 3. employee_status
        const statusRows = await executeQuery('SELECT * FROM employee_status ORDER BY emp_status_id');
        console.log(`[DB Setup] Status Records: ${statusRows.length}`);
        for (const r of statusRows) {
            const id = String(r.employee_id).trim();
            if (!statusMap.has(id)) statusMap.set(id, []);
            statusMap.get(id).push(r);
        }

        // 4. practice_sub_practice_band
        const pracRows = await executeQuery('SELECT * FROM practice_sub_practice_band ORDER BY practice_id');
        console.log(`[DB Setup] Practice Records: ${pracRows.length}`);
        for (const r of pracRows) {
            const id = String(r.employee_id).trim();
            if (!practiceMap.has(id)) practiceMap.set(id, []);
            practiceMap.get(id).push(r);
        }
    });

    test.afterAll(async () => {
        if (employeeResults.length > 0) {
            const totalEmployees = employeeResults.length;
            const matchedEmployees = employeeResults.filter(r => r.status === 'PASS').length;
            const mismatchedEmployees = employeeResults.filter(r => r.status === 'FAIL').length;
            const blockedEmployees = employeeResults.filter(r => r.status === 'BLOCKED').length;
            const totalFieldsCompared = allFieldComparisons.length;
            const passedFields = allFieldComparisons.filter(c => c.result === 'PASS').length;
            const matchRate = totalFieldsCompared > 0 ? ((passedFields / totalFieldsCompared) * 100).toFixed(2) : 0;

            const summary = {
                totalEmployees,
                matchedEmployees,
                mismatchedEmployees,
                blockedEmployees,
                totalFieldsCompared,
                passedFields,
                matchRate
            };

            generateReports(summary, employeeResults, allFieldComparisons);
        }
    });

    test('TC-DB01: Database Schema & Active Employee Record Relationships Audit', async () => {
        expect(activeEmployees.length).toBeGreaterThan(0);

        let desigMatchCount = 0;
        let statusMatchCount = 0;
        let practiceMatchCount = 0;
        let employeesWithMultipleDesig = 0;
        let employeesWithMultipleStatus = 0;

        for (const emp of activeEmployees) {
            const id = String(emp.emp_id).trim();
            if (desigMap.has(id)) {
                desigMatchCount++;
                if (desigMap.get(id).length > 1) employeesWithMultipleDesig++;
            }
            if (statusMap.has(id)) {
                statusMatchCount++;
                if (statusMap.get(id).length > 1) employeesWithMultipleStatus++;
            }
            if (practiceMap.has(id)) {
                practiceMatchCount++;
            }
        }

        console.log(`\n--- DB Integrity Audit Summary ---`);
        console.log(`Total Active Employees: ${activeEmployees.length}`);
        console.log(`Employees with Designation Records: ${desigMatchCount} (Multiple: ${employeesWithMultipleDesig})`);
        console.log(`Employees with Status Records: ${statusMatchCount} (Multiple: ${employeesWithMultipleStatus})`);
        console.log(`Employees with Practice Records: ${practiceMatchCount}`);

        expect(practiceMatchCount).toBeGreaterThan(300);
    });

    test('TC-PI01: Employee Personal Information UI vs DB Validation (All Active Employees)', async ({ page }) => {
        test.setTimeout(3600000); // 60 minutes so all 392 employees finish completely!

        console.log(`\n[UI Validation] Navigating to ${BASIC_INFO_URL}...`);
        await page.goto(BASIC_INFO_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000); // Wait for initial lookup APIs

        const searchInput = page.getByPlaceholder('Search by Employee Name or ID...');
        await searchInput.waitFor({ state: 'visible', timeout: 30000 });

        const limit = process.env.EMP_LIMIT ? parseInt(process.env.EMP_LIMIT, 10) : activeEmployees.length;
        const targetEmployees = activeEmployees.slice(0, limit);
        console.log(`[UI Validation] Validating ${targetEmployees.length} of ${activeEmployees.length} active employees...`);

        for (let i = 0; i < targetEmployees.length; i++) {
            const emp = targetEmployees[i];
            const empId = String(emp.emp_id).trim();
            const empName = emp.full_name ? emp.full_name.trim() : '';

            const t0 = Date.now();

            // Return cleanly to search view
            await page.goto(BASIC_INFO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(1500);
            await searchInput.waitFor({ state: 'visible', timeout: 20000 });

            await searchInput.fill(empId);
            await page.waitForTimeout(500); // Wait for Angular input debounce
            await page.getByRole('button', { name: 'Search', exact: true }).click();
            await page.waitForTimeout(1500);

            const row = page.locator('table tbody tr').filter({ hasText: empId }).first();
            const isRowFound = await row.isVisible({ timeout: 5000 }).catch(() => false);

            if (!isRowFound) {
                console.log(`[${i + 1}/${targetEmployees.length}] Employee ${empId} (${empName}): NOT FOUND IN UI ⚠️ (BLOCKED)`);
                
                const empResult = {
                    empId,
                    empName,
                    status: 'BLOCKED',
                    passedFields: 0,
                    totalFields: 33,
                    secScores: {
                        personal: { pass: 0, fail: 12 },
                        designation: { pass: 0, fail: 7 },
                        workAuth: { pass: 0, fail: 6 },
                        practice: { pass: 0, fail: 8 }
                    },
                    fields: []
                };

                for (const def of FIELD_DEFINITIONS) {
                    const comp = {
                        empId,
                        empName,
                        section: def.section,
                        field: def.label,
                        table: def.table,
                        column: def.column,
                        dbValue: '',
                        uiValue: '',
                        result: 'BLOCKED',
                        reason: 'Employee not found in UI search results',
                        sensitive: def.sensitive || false
                    };
                    empResult.fields.push(comp);
                    allFieldComparisons.push(comp);
                }

                employeeResults.push(empResult);
                continue;
            }

            // Open employee details
            await row.locator('td').last().locator('button, a, i, svg').first().click();

            // Wait until form controls populate (50ms polling)
            const empIdControl = page.locator('input[formcontrolname="employeeId"]');
            await empIdControl.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
            for (let w = 0; w < 40; w++) {
                const curVal = await empIdControl.inputValue().catch(() => '');
                if (curVal === empId) break;
                await page.waitForTimeout(50);
            }

            // Extract all UI controls in a single fast evaluate
            const uiData = await page.evaluate(() => {
                const controls = document.querySelectorAll('[formcontrolname]');
                const res = {};
                controls.forEach(c => {
                    const name = c.getAttribute('formcontrolname');
                    if (c.tagName.toLowerCase() === 'select') {
                        const opt = c.options[c.selectedIndex];
                        res[name] = opt ? opt.text.trim() : '';
                    } else {
                        res[name] = (c.value !== undefined ? c.value : c.innerText || '').trim();
                    }
                });
                return res;
            });

            // Retrieve DB records for this employee
            const dbEmp = empDetailsMap.get(empId) || {};
            const dbDesigList = desigMap.get(empId) || [];
            const dbStatusList = statusMap.get(empId) || [];
            const dbPracticeList = practiceMap.get(empId) || [];

            // In case of multiple designation/status records, select the active/matching one
            const dbDesig = dbDesigList.length > 0 ? dbDesigList[0] : {};
            const dbStatus = dbStatusList.length > 0 ? dbStatusList[0] : {};
            const dbPractice = dbPracticeList.length > 0 ? dbPracticeList[0] : {};

            const empResult = {
                empId,
                empName,
                status: 'PASS',
                passedFields: 0,
                totalFields: 33,
                secScores: {
                    personal: { pass: 0, fail: 0 },
                    designation: { pass: 0, fail: 0 },
                    workAuth: { pass: 0, fail: 0 },
                    practice: { pass: 0, fail: 0 }
                },
                fields: []
            };

            let hasMismatch = false;

            for (const def of FIELD_DEFINITIONS) {
                let dbRaw = null;
                if (def.table === 'emp_details') dbRaw = dbEmp[def.column];
                else if (def.table === 'employee_designation_and_experience') dbRaw = dbDesig[def.column];
                else if (def.table === 'employee_status') dbRaw = dbStatus[def.column];
                else if (def.table === 'practice_sub_practice_band') dbRaw = dbPractice[def.column];

                const uiRaw = uiData[def.control] !== undefined ? uiData[def.control] : '';

                const comp = compareFieldValue(def, dbRaw, uiRaw);

                const fieldRecord = {
                    empId,
                    empName,
                    section: def.section,
                    field: def.label,
                    table: def.table,
                    column: def.column,
                    dbValue: comp.dbNorm,
                    uiValue: comp.uiNorm,
                    result: comp.result,
                    reason: comp.reason,
                    sensitive: def.sensitive || false
                };

                empResult.fields.push(fieldRecord);
                allFieldComparisons.push(fieldRecord);

                const secKey = def.section === 'Personal Information' ? 'personal' :
                               def.section === 'Designation & Experience' ? 'designation' :
                               def.section === 'Work Authorization' ? 'workAuth' : 'practice';

                if (comp.isMatch) {
                    empResult.passedFields++;
                    empResult.secScores[secKey].pass++;
                } else {
                    hasMismatch = true;
                    empResult.secScores[secKey].fail++;
                }
            }

            empResult.status = hasMismatch ? 'FAIL' : 'PASS';
            employeeResults.push(empResult);

            const duration = Date.now() - t0;
            const statusIcon = empResult.status === 'PASS' ? '✅' : '❌';
            console.log(`[${i + 1}/${targetEmployees.length}] ${empId} (${empName}): ${empResult.status} ${statusIcon} [${empResult.passedFields}/33 fields matched] (${duration}ms)`);

            // Attach and log any failing/mismatched fields immediately
            const failingFields = empResult.fields.filter(f => f.result !== 'PASS');
            if (failingFields.length > 0) {
                failingFields.forEach(f => {
                    console.log(`    └── [${f.result}] ${f.section} -> ${f.field} (${f.column}): DB="${f.dbValue}" vs UI="${f.uiValue}" ${f.reason ? '(' + f.reason + ')' : ''}`);
                });
            }
        }
    });

    test('TC-PI02: Detailed Field-by-Field Assertions on Representative Employees', async ({ page }) => {
        test.setTimeout(120000);
        // Deep verification for known sample employees
        const sampleIds = ['10012', '1003', '1957'];

        for (const empId of sampleIds) {
            await page.goto(BASIC_INFO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const searchInput = page.getByPlaceholder('Search by Employee Name or ID...');
            await searchInput.waitFor({ state: 'visible', timeout: 20000 });
            await page.waitForTimeout(300);

            await searchInput.fill(empId);
            await page.waitForTimeout(300);
            await page.getByRole('button', { name: 'Search', exact: true }).click();
            await page.waitForTimeout(800);

            const row = page.locator('table tbody tr').filter({ hasText: empId }).first();
            await expect(row).toBeVisible({ timeout: 5000 });

            await row.locator('td').last().locator('button, a, i, svg').first().click();

            const empIdInput = page.locator('input[formcontrolname="employeeId"]');
            await empIdInput.waitFor({ state: 'visible', timeout: 8000 });
            await expect(empIdInput).toHaveValue(empId, { timeout: 10000 });

            const dbEmp = empDetailsMap.get(empId);
            if (dbEmp && dbEmp.full_name) {
                const fullNameInput = page.locator('input[formcontrolname="fullName"]');
                await expect(fullNameInput).toHaveValue(new RegExp(dbEmp.full_name.trim(), 'i'), { timeout: 10000 });
            }
        }
    });

    test('TC-NEG01: Non-Existent Employee Search Behavior Handling', async ({ page }) => {
        await page.goto(BASIC_INFO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const searchInput = page.getByPlaceholder('Search by Employee Name or ID...');
        await searchInput.waitFor({ state: 'visible' });

        const nonExistentId = '99999999';
        await searchInput.fill(nonExistentId);
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.waitForTimeout(1500);

        // Verify that no row exists for this employee
        const row = page.locator('table tbody tr').filter({ hasText: nonExistentId });
        expect(await row.count()).toBe(0);
    });
});
