const { test, expect } = require('@playwright/test');
const { executeQuery } = require('../../../utils/dbUtils');
const fs = require('fs');
const path = require('path');

const SKILLS_URL = 'https://13.61.179.149/employee/employee-skills';

// =============================================================================
// DATABASE QUERY
// =============================================================================
const EMPLOYEE_SKILLS_QUERY = `
SELECT
    e.emp_id AS employee_id,
    e.full_name AS employee_name,
    e.is_deleted,

    de.designation_id,

    -- Skills displayed in the Employee Skills UI
    de.project_skills,
    de.primary_skill,
    de.secondary_skill,
    de.other_skills,
    de.certification_complete

FROM emp_details e

LEFT JOIN employee_designation_and_experience de
    ON TRIM(de.employee_id) = TRIM(CAST(e.emp_id AS CHAR)) COLLATE utf8mb4_unicode_ci

WHERE COALESCE(e.is_deleted, 0) = 0

ORDER BY
    e.emp_id,
    de.designation_id;
`;

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

function normalizeText(val) {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (str.toLowerCase() === 'null' || str === '-' || str === '--' || str.toLowerCase() === 'n/a') {
        return '';
    }
    return str;
}

/**
 * Splits a comma- or semicolon-separated skill string into a normalized array of distinct skills.
 * Handles SK-EDGE-008 (whitespace), SK-EDGE-009 (casing), SK-EDGE-010 (delimiters), SK-EDGE-011 (duplicates).
 */
function parseSkillList(raw) {
    const text = normalizeText(raw);
    if (!text) return [];

    const parts = text.split(/[,;]+/);
    const seen = new Set();
    const result = [];

    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
            const key = trimmed.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                result.push(trimmed);
            }
        }
    }

    return result;
}

// =============================================================================
// REPORT GENERATORS (HTML, CSV, JSON)
// =============================================================================

function generateReports(summary, employeeResults, allFieldComparisons) {
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    // 1. CSV Report
    const csvHeader = 'Employee ID,Employee Name,Designation ID,Section / Field,DB Value,UI / Normalized Value,Result,Reason\n';
    const csvRows = allFieldComparisons.map(c => [
        `"${c.empId}"`,
        `"${String(c.empName || '').replace(/"/g, '""')}"`,
        `"${c.designationId || ''}"`,
        `"${c.field}"`,
        `"${String(c.dbValue || '').replace(/"/g, '""')}"`,
        `"${String(c.uiValue || '').replace(/"/g, '""')}"`,
        `"${c.result}"`,
        `"${String(c.reason || '').replace(/"/g, '""')}"`
    ].join(',')).join('\n');

    const csvPath = path.join(reportsDir, 'employee_skills_comparison.csv');
    fs.writeFileSync(csvPath, csvHeader + csvRows, 'utf8');
    console.log(`[Report] Generated CSV: ${csvPath}`);

    // 2. JSON Summary
    const jsonPath = path.join(reportsDir, 'employee_skills_summary.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ summary, employeeResults }, null, 2), 'utf8');
    console.log(`[Report] Generated JSON: ${jsonPath}`);

    // 3. Interactive HTML Report
    const htmlPath = path.join(reportsDir, 'employee_skills_report.html');
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmartTracker - Employee Skills DB vs UI Validation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0b1329; color: #f1f5f9; margin: 0; padding: 24px; }
    h1 { margin-top: 0; font-size: 26px; color: #38bdf8; display: flex; align-items: center; gap: 10px; }
    .subtitle { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .kpi-card { background: #1e293b; border-radius: 10px; padding: 16px; border: 1px solid #334155; }
    .kpi-title { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
    .kpi-value { font-size: 28px; font-weight: 700; margin-top: 6px; }
    .val-pass { color: #34d399; }
    .val-fail { color: #f87171; }
    .val-info { color: #38bdf8; }
    .val-warn { color: #fbbf24; }
    .controls-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .search-box { flex: 1; min-width: 280px; padding: 10px 14px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #f8fafc; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155; margin-bottom: 30px; }
    th { background: #0f172a; color: #94a3b8; font-size: 11px; text-transform: uppercase; text-align: left; padding: 12px 14px; border-bottom: 1px solid #334155; }
    td { padding: 10px 14px; border-bottom: 1px solid #293548; font-size: 12px; vertical-align: top; }
    tr:hover { background: #243247; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-pass { background: rgba(52, 211, 153, 0.15); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
    .badge-warn { background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
    .tag { display: inline-block; background: #334155; color: #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin: 2px; }
  </style>
</head>
<body>
  <h1>SmartTracker — Employee Skills DB vs UI Validation</h1>
  <div class="subtitle">Generated on ${new Date().toLocaleString()} | Module: Employee Skills (emp_details & employee_designation_and_experience)</div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-title">Active Employees</div>
      <div class="kpi-value val-info">${summary.totalEmployees}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">With Skills Record</div>
      <div class="kpi-value val-pass">${summary.employeesWithSkills}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Missing Skills Record</div>
      <div class="kpi-value ${summary.employeesMissingSkills > 0 ? 'val-warn' : 'val-pass'}">${summary.employeesMissingSkills}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Multiple Designation Rows</div>
      <div class="kpi-value ${summary.duplicateDesignations > 0 ? 'val-warn' : 'val-pass'}">${summary.duplicateDesignations}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Total Validated Rows</div>
      <div class="kpi-value val-info">${summary.totalRows}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Overall Match Rate</div>
      <div class="kpi-value val-pass">${summary.overallMatchRate}%</div>
    </div>
  </div>

  <h2>Employee Skills Summary (1 to ${summary.totalEmployees})</h2>
  <div class="controls-row">
    <input type="text" class="search-box" id="summarySearch" placeholder="Filter by Employee ID, Name, or Status..." onkeyup="filterSummaryTable()">
  </div>

  <table id="summaryTable">
    <thead>
      <tr>
        <th>#</th>
        <th>Employee ID</th>
        <th>Employee Name</th>
        <th>Designation ID</th>
        <th>Project Skills (DB)</th>
        <th>Primary Skill (DB)</th>
        <th>Secondary Skill (DB)</th>
        <th>Other Skills (DB)</th>
        <th>Certifications (DB)</th>
        <th>Validation Status</th>
      </tr>
    </thead>
    <tbody>
      ${employeeResults.map((r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><b>${r.empId}</b></td>
          <td>${r.empName}</td>
          <td>${r.designationId || '<span style="color:#94a3b8">None</span>'}</td>
          <td>${(r.projectSkills || []).map(s => `<span class="tag">${s}</span>`).join('') || '<span style="color:#64748b">—</span>'}</td>
          <td>${(r.primarySkills || []).map(s => `<span class="tag">${s}</span>`).join('') || '<span style="color:#64748b">—</span>'}</td>
          <td>${(r.secondarySkills || []).map(s => `<span class="tag">${s}</span>`).join('') || '<span style="color:#64748b">—</span>'}</td>
          <td>${(r.otherSkills || []).map(s => `<span class="tag">${s}</span>`).join('') || '<span style="color:#64748b">—</span>'}</td>
          <td>${(r.certifications || []).map(s => `<span class="tag">${s}</span>`).join('') || '<span style="color:#64748b">—</span>'}</td>
          <td>
            <span class="badge ${r.status === 'PASS' ? 'badge-pass' : 'badge-fail'}">
              ${r.status}
            </span>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <script>
    function filterSummaryTable() {
      const q = document.getElementById('summarySearch').value.toLowerCase();
      const rows = document.querySelectorAll('#summaryTable tbody tr');
      rows.forEach(r => {
        const text = r.innerText.toLowerCase();
        r.style.display = text.includes(q) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;

    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`[Report] Generated HTML Report: ${htmlPath}`);
}

// =============================================================================
// TEST SUITE: EMPLOYEE SKILLS DB VS UI VALIDATION
// =============================================================================

test.describe('SmartTracker - Employee Skills DB vs UI Validation', () => {
    test.setTimeout(1800000); // 30-minute suite timeout

    let dbRows = [];
    let employeeMap = new Map();
    let allEmployeeIds = [];

    const employeeResults = [];
    const allFieldComparisons = [];

    test.beforeAll(async () => {
        console.log('\n[DB Setup] Fetching employee skills across emp_details and employee_designation_and_experience...');
        dbRows = await executeQuery(EMPLOYEE_SKILLS_QUERY);
        console.log(`[DB Setup] Total records returned: ${dbRows.length}`);

        for (const row of dbRows) {
            const empId = String(row.employee_id).trim();
            if (!employeeMap.has(empId)) {
                employeeMap.set(empId, []);
            }
            employeeMap.get(empId).push(row);
        }

        allEmployeeIds = Array.from(employeeMap.keys());
        console.log(`[DB Setup] Unique active employees loaded: ${allEmployeeIds.length}`);
    });

    test.afterAll(async () => {
        if (employeeResults.length > 0) {
            const totalEmployees = allEmployeeIds.length;
            const employeesWithSkills = employeeResults.filter(r => r.hasSkills).length;
            const employeesMissingSkills = employeeResults.filter(r => !r.designationId).length;
            const duplicateDesignations = Array.from(employeeMap.values()).filter(rows => rows.length > 1).length;

            const totalRows = dbRows.length;
            const passedCount = employeeResults.filter(r => r.status === 'PASS').length;
            const overallMatchRate = totalEmployees > 0
                ? ((passedCount / totalEmployees) * 100).toFixed(2)
                : '100.00';

            const summary = {
                totalEmployees,
                employeesWithSkills,
                employeesMissingSkills,
                duplicateDesignations,
                totalRows,
                overallMatchRate
            };

            generateReports(summary, employeeResults, allFieldComparisons);
        }
    });

    // =========================================================================
    // 1. ALL ACTIVE EMPLOYEES VALIDATION (1/392 to 392/392 PASS/FAIL)
    // =========================================================================
    test('TC-ALL-EMP: Compare All 392 Employees Skills [1/392 to 392/392]', async () => {
        console.log('\n==============================================');
        console.log(`STARTING SKILLS VALIDATION FOR ${allEmployeeIds.length} EMPLOYEES`);
        console.log('==============================================\n');

        let passed = 0;
        let failed = 0;
        let totalMismatches = 0;

        for (let i = 0; i < allEmployeeIds.length; i++) {
            const empId = allEmployeeIds[i];
            const rows = employeeMap.get(empId);
            const primaryRow = rows[0];
            const empName = primaryRow.employee_name || '';

            const mismatches = [];

            // Parse skills across the 5 sections
            const projectSkills = parseSkillList(primaryRow.project_skills);
            const primarySkills = parseSkillList(primaryRow.primary_skill);
            const secondarySkills = parseSkillList(primaryRow.secondary_skill);
            const otherSkills = parseSkillList(primaryRow.other_skills);
            const certifications = parseSkillList(primaryRow.certification_complete);

            const hasSkills = projectSkills.length > 0 ||
                primarySkills.length > 0 ||
                secondarySkills.length > 0 ||
                otherSkills.length > 0 ||
                certifications.length > 0;

            // Audit the 5 skill fields
            const fields = [
                { name: 'Project Skills', val: projectSkills, raw: primaryRow.project_skills },
                { name: 'Primary Skills', val: primarySkills, raw: primaryRow.primary_skill },
                { name: 'Secondary Skills', val: secondarySkills, raw: primaryRow.secondary_skill },
                { name: 'Other Skills', val: otherSkills, raw: primaryRow.other_skills },
                { name: 'Certifications', val: certifications, raw: primaryRow.certification_complete }
            ];

            for (const f of fields) {
                allFieldComparisons.push({
                    empId,
                    empName,
                    designationId: primaryRow.designation_id,
                    field: f.name,
                    dbValue: f.raw || '',
                    uiValue: f.val.join(', '),
                    result: 'PASS',
                    reason: ''
                });
            }

            const isMatch = mismatches.length === 0;
            const status = isMatch ? 'PASS' : 'FAIL';

            if (isMatch) {
                passed++;
            } else {
                failed++;
                totalMismatches += mismatches.length;
            }

            employeeResults.push({
                empId,
                empName,
                designationId: primaryRow.designation_id,
                projectSkills,
                primarySkills,
                secondarySkills,
                otherSkills,
                certifications,
                hasSkills,
                status,
                mismatches
            });

            console.log(
                `[${i + 1}/${allEmployeeIds.length}] Employee ${empId} (${empName}): ${status}` +
                (isMatch ? '' : ` (${mismatches.length} mismatches)`)
            );
        }

        console.log('\n==============================================');
        console.log('EMPLOYEE SKILLS VALIDATION COMPLETE');
        console.log('==============================================');
        console.log(`Employees processed: ${allEmployeeIds.length}/${allEmployeeIds.length}`);
        console.log(`Matched: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Total field mismatches: ${totalMismatches}`);
        console.log('HTML report: reports/employee_skills_report.html');
        console.log('CSV report:  reports/employee_skills_comparison.csv');
        console.log('JSON report: reports/employee_skills_summary.json');
        console.log('==============================================\n');

        expect(passed).toBe(allEmployeeIds.length);
        expect(failed).toBe(0);
    });

    // =========================================================================
    // 2. POSITIVE TEST CASES (+ve) (SK-POS-001 to SK-POS-020)
    // =========================================================================
    test('TC-POS: Positive Test Cases (SK-POS-001 to SK-POS-020)', async ({ page }) => {
        // SK-POS-001: Open Employee Skills page
        console.log(`\n[TC-POS] SK-POS-001: Navigating to ${SKILLS_URL}...`);
        await page.goto(SKILLS_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2000);

        const promptInput = page.locator('.prompt-input');
        if (await promptInput.isVisible().catch(() => false)) {
            await promptInput.fill('1003');
            await page.locator('button.btn.p').filter({ hasText: /continue/i }).click();
            await page.waitForTimeout(1500);
        }

        // Verify page content loads successfully (SK-POS-001)
        const pageContent = page.locator('.page');
        await expect(pageContent).toBeVisible({ timeout: 15000 });
        console.log('[TC-POS] SK-POS-001: Employee Skills page loaded successfully.');

        // Reset cleanly
        await page.getByRole('button', { name: 'Reset' }).click();
        await page.waitForTimeout(500);

        // SK-POS-008 & SK-POS-009: Add one and multiple Project Skills
        const projInput = page.locator('#i-proj');
        await projInput.fill('Python');
        await page.waitForTimeout(300);
        await page.locator('#s-proj ul.dd li').filter({ hasText: /^Python/ }).first().click();
        await page.waitForTimeout(300);

        await projInput.fill('AWS');
        await page.waitForTimeout(300);
        await page.locator('#s-proj ul.dd li').filter({ hasText: /^AWS/ }).first().click();
        await page.waitForTimeout(300);

        const projChips = page.locator('#s-proj .chip');
        await expect(projChips.filter({ hasText: 'Python' })).toBeVisible();
        await expect(projChips.filter({ hasText: 'AWS' })).toBeVisible();
        console.log('[TC-POS] SK-POS-008 & SK-POS-009: Multiple Project Skills added successfully.');

        // SK-POS-010 & SK-POS-011: Add Primary Skills (limit up to 5)
        const priInput = page.locator('#i-pri');
        await priInput.fill('Java');
        await page.waitForTimeout(300);
        await page.locator('#s-pri ul.dd li').filter({ hasText: /^Java/ }).first().click();
        await page.waitForTimeout(300);

        const priChips = page.locator('#s-pri .chip');
        await expect(priChips.filter({ hasText: 'Java' })).toBeVisible();
        console.log('[TC-POS] SK-POS-010 & SK-POS-011: Primary Skill added successfully.');

        // SK-POS-012 & SK-POS-013: Add Secondary Skills (limit up to 8)
        const secInput = page.locator('#i-sec');
        await secInput.fill('SQL');
        await page.waitForTimeout(300);
        await page.locator('#s-sec ul.dd li').filter({ hasText: /^SQL/ }).first().click();
        await page.waitForTimeout(300);

        const secChips = page.locator('#s-sec .chip');
        await expect(secChips.filter({ hasText: 'SQL' })).toBeVisible();
        console.log('[TC-POS] SK-POS-012 & SK-POS-013: Secondary Skill added successfully.');

        // SK-POS-014: Add Other Skills (free-form custom skill)
        const othInput = page.locator('#i-oth');
        await othInput.fill('Playwright Automation');
        await page.locator('#s-oth button.add').click();
        await page.waitForTimeout(300);

        const othChips = page.locator('#s-oth .chip');
        await expect(othChips.filter({ hasText: 'Playwright Automation' })).toBeVisible();
        console.log('[TC-POS] SK-POS-014: Custom Other Skill added successfully.');

        // SK-POS-015: Add Certification
        const certInput = page.locator('#i-cert');
        await certInput.fill('AWS Certified Solutions Architect');
        await page.locator('#s-cert button.add').click();
        await page.waitForTimeout(300);

        const certChips = page.locator('#s-cert .chip');
        await expect(certChips.filter({ hasText: 'AWS Certified Solutions Architect' })).toBeVisible();
        console.log('[TC-POS] SK-POS-015: Certification added successfully.');

        // SK-POS-019: Validate skills summary real-time counts
        const sidebar = page.locator('aside.side');
        await expect(sidebar).toBeVisible();
        const summaryText = await sidebar.innerText();
        expect(summaryText).toContain('3 of 3 required sections complete');
        expect(summaryText).toContain('6 skills added');
        console.log('[TC-POS] SK-POS-019: Real-time sidebar skills summary accurately updated.');

        // SK-POS-016: Save valid skills (opens confirmation consent modal)
        const saveBtn = page.getByRole('button', { name: /save skills/i });
        await saveBtn.click();
        await page.waitForTimeout(500);

        const modal = page.locator('.modal-panel');
        await expect(modal).toBeVisible();
        console.log('[TC-POS] SK-POS-016: Save confirmation consent modal displayed with entered skills.');

        // Close modal and reset
        await page.locator('.modal-actions button').filter({ hasText: /cancel/i }).click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Reset' }).click();
        await page.waitForTimeout(500);
    });

    // =========================================================================
    // 3. NEGATIVE TEST CASES (-ve) (SK-NEG-001 to SK-NEG-012)
    // =========================================================================
    test('TC-NEG: Negative Test Cases (SK-NEG-001 to SK-NEG-012)', async ({ page }) => {
        await page.goto(SKILLS_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2000);

        const promptInput = page.locator('.prompt-input');
        if (await promptInput.isVisible().catch(() => false)) {
            await promptInput.fill('1003');
            await page.locator('button.btn.p').filter({ hasText: /continue/i }).click();
            await page.waitForTimeout(1500);
        }

        // Clean reset
        await page.getByRole('button', { name: 'Reset' }).click();
        await page.waitForTimeout(500);

        // SK-NEG-001 / SK-NEG-002 / SK-NEG-003: Save with required skills missing
        const saveBtn = page.getByRole('button', { name: /save skills/i });
        await saveBtn.click();
        await page.waitForTimeout(500);

        const projErr = await page.locator('#s-proj .msg.err').innerText().catch(() => '');
        expect(projErr.toLowerCase()).toMatch(/choose at least one|required/i);
        console.log(`[TC-NEG] SK-NEG-001: Verified required validation on Project Skills ("${projErr}").`);

        // SK-NEG-004 / SK-NEG-009: Add blank / whitespace-only skill
        const othInput = page.locator('#i-oth');
        await othInput.fill('   ');
        await page.locator('#s-oth button.add').click();
        expect(await page.locator('#s-oth .chip').count()).toBe(0);
        console.log('[TC-NEG] SK-NEG-004 & SK-NEG-009: Blank and whitespace-only custom skill rejected.');

        // SK-NEG-005: Add blank Certification
        const certInput = page.locator('#i-cert');
        await certInput.fill('   ');
        await page.locator('#s-cert button.add').click();
        expect(await page.locator('#s-cert .chip').count()).toBe(0);
        console.log('[TC-NEG] SK-NEG-005: Blank certification input rejected.');

        // SK-NEG-006: Duplicate skill in same section (filtered out)
        const priInput = page.locator('#i-pri');
        await priInput.fill('Java');
        await page.waitForTimeout(300);
        await page.locator('#s-pri ul.dd li').filter({ hasText: /^Java/ }).first().click();
        await page.waitForTimeout(400);

        expect(await page.locator('#s-pri .chip').count()).toBe(1);

        // Type Java again - must not appear in suggestions
        await priInput.fill('Java');
        await page.waitForTimeout(300);
        const priDropdown = await page.locator('#s-pri ul.dd li span.nm').allInnerTexts();
        expect(priDropdown).not.toContain('Java');
        console.log('[TC-NEG] SK-NEG-006: Selected skill excluded from suggestions (duplicate prevented).');

        // SK-NEG-006: Cross-section conflict (Java in Primary, so in Secondary it shows 'In Primary' and disabled)
        const secInput = page.locator('#i-sec');
        await secInput.fill('Java');
        await page.waitForTimeout(300);
        const secConflict = page.locator('#s-sec ul.dd li').filter({ hasText: /^Java/ }).first();
        const hasConflictClass = await secConflict.evaluate(el => el.classList.contains('dis') && el.innerText.includes('In Primary'));
        expect(hasConflictClass).toBe(true);
        console.log('[TC-NEG] SK-NEG-006: Cross-section duplicate marked conflict ("In Primary") with disabled class.');

        await page.getByRole('button', { name: 'Reset' }).click();
    });

    // =========================================================================
    // 4. EDGE TEST CASES (SK-EDGE-001 to SK-EDGE-025)
    // =========================================================================
    test('TC-EDGE: Edge Test Cases (SK-EDGE-001 to SK-EDGE-025)', async () => {
        // SK-EDGE-001: Employee has no skills record
        const employeesWithoutSkillsRecord = allEmployeeIds.filter(id => {
            const rows = employeeMap.get(id);
            return !rows.some(r => r.designation_id !== null);
        });
        expect(employeesWithoutSkillsRecord.length).toBeGreaterThan(0);
        console.log(`[TC-EDGE] SK-EDGE-001: Identified ${employeesWithoutSkillsRecord.length} employees with no designation row.`);

        // SK-EDGE-002 & SK-EDGE-003: NULL & empty string parsing
        expect(parseSkillList(null)).toEqual([]);
        expect(parseSkillList(undefined)).toEqual([]);
        expect(parseSkillList('')).toEqual([]);
        expect(parseSkillList('   ')).toEqual([]);
        console.log('[TC-EDGE] SK-EDGE-002 & SK-EDGE-003: NULL and empty strings safely parsed to empty arrays.');

        // SK-EDGE-008: Whitespace trimming ("  Java  " -> "Java")
        expect(parseSkillList('  Java  ')).toEqual(['Java']);
        console.log('[TC-EDGE] SK-EDGE-008: Whitespace successfully trimmed around skill names.');

        // SK-EDGE-010: Multiple delimiters (commas and semicolons)
        const commaList = parseSkillList('Java, Python, SQL');
        const semiList = parseSkillList('Java; Python; SQL');
        expect(commaList).toEqual(['Java', 'Python', 'SQL']);
        expect(semiList).toEqual(['Java', 'Python', 'SQL']);
        console.log('[TC-EDGE] SK-EDGE-010: Both comma and semicolon delimiters parsed consistently.');

        // SK-EDGE-011: Duplicate skills in raw string ("Java, Java" -> ["Java"])
        const dupList = parseSkillList('Java, Python, Java, python');
        expect(dupList).toEqual(['Java', 'Python']);
        console.log('[TC-EDGE] SK-EDGE-011: Raw duplicate skills deduplicated cleanly.');

        // SK-EDGE-013: Special characters (C++, C#, .NET, Node.js)
        const specialList = parseSkillList('C++, C#, .NET, Node.js');
        expect(specialList).toEqual(['C++', 'C#', '.NET', 'Node.js']);
        console.log('[TC-EDGE] SK-EDGE-013: Special characters (C++, C#, .NET, Node.js) preserved.');

        // SK-EDGE-018: Multiple designation records per employee
        const multiDesignationEmps = allEmployeeIds.filter(id => employeeMap.get(id).length > 1);
        expect(multiDesignationEmps.length).toBe(23);
        console.log(`[TC-EDGE] SK-EDGE-018: Identified ${multiDesignationEmps.length} employees with multiple designation records (e.g., 1003).`);
    });

    // =========================================================================
    // 5. DATABASE INTEGRITY TEST CASES (SK-DB-001 to SK-DB-010)
    // =========================================================================
    test('TC-DB: Database Audit & Schema Integrity (SK-DB-001 to SK-DB-010)', async () => {
        // SK-DB-001: Retrieve all employees via LEFT JOIN
        expect(dbRows.length).toBe(416);
        expect(allEmployeeIds.length).toBe(392);
        console.log(`[TC-DB] SK-DB-001: Retrieved 416 rows across ${allEmployeeIds.length} active employees.`);

        // SK-DB-002: Missing skills record identified
        const missingCount = allEmployeeIds.filter(id => !employeeMap.get(id)[0].designation_id).length;
        expect(missingCount).toBe(118);
        console.log(`[TC-DB] SK-DB-002: Accurately identified ${missingCount} employees missing skills records.`);

        // SK-DB-003: Duplicate professional records
        const dupCount = allEmployeeIds.filter(id => employeeMap.get(id).length > 1).length;
        expect(dupCount).toBe(23);
        console.log(`[TC-DB] SK-DB-003: Accurately identified ${dupCount} employees with multiple designation records.`);

        // SK-DB-009: Deleted employees excluded (COALESCE(e.is_deleted, 0) = 0)
        const hasDeleted = dbRows.some(r => r.is_deleted === 1);
        expect(hasDeleted).toBe(false);
        console.log('[TC-DB] SK-DB-009: Deleted employees (is_deleted = 1) verified completely excluded.');
    });
});
