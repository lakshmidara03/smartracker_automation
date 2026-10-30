const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../../pages/LoginPage');
const { PracticesPage } = require('../../../pages/PracticesPage');
const fs = require('fs');
const path = require('path');
const { executeQuery } = require('../../../utils/dbUtils');
const { setupAuthenticatedPage } = require('../helpers/practicesTestHelper');

test.describe.configure({ mode: 'default' });

// ============================================================
// CLIENT LIST
// ============================================================
const clients = [
    'Amgen', 'Autodesk', 'Bazar Voice', 'BlackDuck', 'Ciena',
    'Deckers Outdoor Corporation', 'Docusign', 'Fastly',
    'Fountain group - DTDC', 'Google', 'Greystar',
    'Hewlett Packard Enterprise Company', 'Intuit Inc',
    'Intuitive Surgical', 'JPMC', 'OT', 'Palo Alto',
    'Pure Storage', 'Salesforce Inc', 'Siemens', 'Stripe',
    'Western Digital'
];

// ============================================================
// DB QUERY  --  per client, per practice
// ============================================================
async function getPracticeDBData(clientName) {
    const query = `
    WITH base AS (
        SELECT a.emp_id, a.practice, a.is_billable, a.project_id,
               a.project_location, p.project_type
        FROM   hrportal.employee_allocation a
        JOIN   hrportal.emp_details  e ON a.emp_id    = e.emp_id
        JOIN   hrportal.project      p ON a.project_id = p.id
        WHERE  a.start_date <= CURDATE()
          AND  (a.end_date IS NULL OR a.end_date >= CURDATE())
          AND  (e.is_deleted = 0 OR e.is_deleted IS NULL)
          AND  p.client_name = ?
    )
    SELECT
        practice,
        COUNT(DISTINCT emp_id)                                                            AS team_size,
        COUNT(DISTINCT CASE WHEN is_billable = 1 THEN emp_id END)                         AS billable,
        COUNT(DISTINCT CASE WHEN is_billable = 0 THEN emp_id END)                         AS non_billable,
        COUNT(DISTINCT CASE WHEN project_type = 'PRODUCTION' AND is_billable = 1 THEN emp_id END) AS production,
        COUNT(DISTINCT CASE WHEN project_type = 'BENCH'      THEN emp_id END)             AS bench,
        COUNT(DISTINCT CASE WHEN project_type = 'INTERNAL'   THEN emp_id END)             AS internal,
        COUNT(DISTINCT CASE WHEN project_type = 'PRODUCTION' AND is_billable = 0 THEN emp_id END) AS investment,
        COUNT(DISTINCT CASE WHEN project_type = 'LEAVE'      THEN emp_id END)             AS leave_count,
        COUNT(DISTINCT CASE WHEN project_type IN ('ON NOTICE','ONNOTICE') THEN emp_id END) AS notice,
        COUNT(DISTINCT CASE WHEN project_type = 'HOLD'       THEN emp_id END)             AS hold,
        COUNT(DISTINCT CASE WHEN LOWER(TRIM(project_location)) LIKE '%india%' THEN emp_id END)     AS offshore,
        COUNT(DISTINCT CASE WHEN LOWER(TRIM(project_location)) NOT LIKE '%india%' THEN emp_id END) AS onsite,
        COUNT(DISTINCT project_id)                                                        AS projects
    FROM base
    GROUP BY practice
    ORDER BY practice;
    `;
    return await executeQuery(query, [clientName]);
}

// ============================================================
// HTML REPORT
// ============================================================
const reportRows = [];

function writeHtmlReport(rows) {
    const dir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `account_summary_report_${ts}.html`);

    // Group metrics by Client
    const clientSummaryMap = new Map();
    for (const r of rows) {
        if (!clientSummaryMap.has(r.client)) {
            clientSummaryMap.set(r.client, {
                client: r.client,
                practices: new Set(),
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0
            });
        }
        const s = clientSummaryMap.get(r.client);
        if (r.practice && r.practice !== '---') s.practices.add(r.practice);
        s.total++;
        if (r.status === 'PASS') s.passed++;
        else if (r.status === 'FAIL') s.failed++;
        else if (r.status === 'SKIPPED') s.skipped++;
    }

    const totalClients = clientSummaryMap.size;
    let passedClients = 0;
    let failedClients = 0;
    let skippedClients = 0;

    const clientRowsHtml = Array.from(clientSummaryMap.values()).map(c => {
        let status = 'PASS';
        if (c.failed > 0) status = 'FAIL';
        else if (c.skipped > 0 && c.passed === 0) status = 'SKIPPED';

        if (status === 'PASS') passedClients++;
        else if (status === 'FAIL') failedClients++;
        else skippedClients++;

        const bg = status === 'PASS' ? '#e6ffed' : status === 'SKIPPED' ? '#fffbe6' : '#fff0f0';
        const color = status === 'PASS' ? '#1a7f37' : status === 'SKIPPED' ? '#9a6700' : '#cf222e';

        return `<tr style="background:${bg}">
            <td style="font-weight:600">${c.client}</td>
            <td style="text-align:center">${c.practices.size}</td>
            <td style="text-align:center">${c.total}</td>
            <td style="text-align:center;color:#1a7f37;font-weight:600">${c.passed}</td>
            <td style="text-align:center;color:#cf222e;font-weight:600">${c.failed}</td>
            <td style="font-weight:bold;color:${color};text-align:center">${status}</td>
        </tr>`;
    }).join('\n');

    const totalMetrics = rows.length;
    const passedMetrics = rows.filter(r => r.status === 'PASS').length;
    const failedMetrics = rows.filter(r => r.status === 'FAIL').length;
    const skippedMetrics = rows.filter(r => r.status === 'SKIPPED').length;

    const tbody = rows.map(r => {
        const bg = r.status === 'PASS' ? '#e6ffed' : r.status === 'SKIPPED' ? '#fffbe6' : '#fff0f0';
        const color = r.status === 'PASS' ? '#1a7f37' : r.status === 'SKIPPED' ? '#9a6700' : '#cf222e';
        return `<tr style="background:${bg}">
            <td>${r.client}</td>
            <td>${r.practice}</td>
            <td>${r.metric}</td>
            <td style="text-align:center">${r.db}</td>
            <td style="text-align:center">${r.ui}</td>
            <td style="font-weight:bold;color:${color};text-align:center">${r.status}</td>
        </tr>`;
    }).join('\n');

    const failedRows = rows.filter(r => r.status === 'FAIL');
    const failedHtml = failedRows.length === 0
        ? '<p style="color:#1a7f37;font-weight:600;padding:12px;background:#e6ffed;border-radius:6px;">✅ All metric assertions matched perfectly across all validated accounts!</p>'
        : `<table style="border: 2px solid #cf222e;">
  <thead style="background:#cf222e;color:#fff;">
    <tr>
      <th>Client</th>
      <th>Practice</th>
      <th>Metric</th>
      <th style="text-align:center">DB Count</th>
      <th style="text-align:center">UI Count</th>
      <th style="text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>
${failedRows.map(r => `<tr style="background:#fff0f0">
      <td style="font-weight:600">${r.client}</td>
      <td>${r.practice}</td>
      <td>${r.metric}</td>
      <td style="text-align:center;font-weight:600">${r.db}</td>
      <td style="text-align:center;font-weight:600">${r.ui}</td>
      <td style="font-weight:bold;color:#cf222e;text-align:center">FAIL ❌</td>
    </tr>`).join('\n')}
  </tbody>
</table>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Account Summary Practice KPI Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; background: #f6f8fa; color: #24292f; }
  h1   { font-size: 1.5rem; margin-bottom: 4px; color: #0969da; }
  h2   { font-size: 1.2rem; margin-top: 24px; margin-bottom: 12px; color: #1F2328; border-bottom: 2px solid #d0d7de; padding-bottom: 6px; }
  p    { color: #57606a; font-size: 0.85rem; margin-bottom: 16px; }
  .cards { display: flex; gap: 16px; margin-bottom: 24px; }
  .card  { flex: 1; background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.12); text-align: center; border-top: 4px solid #0969da; }
  .card.pass { border-top-color: #1a7f37; }
  .card.fail { border-top-color: #cf222e; }
  .card.skip { border-top-color: #9a6700; }
  .card .num { font-size: 1.8rem; font-weight: bold; margin-top: 4px; }
  .card .label { font-size: 0.8rem; color: #57606a; text-transform: uppercase; letter-spacing: 0.5px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); margin-bottom: 24px; }
  th    { background: #0969da; color: #fff; padding: 10px 12px; text-align: left; }
  td    { border-bottom: 1px solid #d0d7de; padding: 7px 12px; }
  tr:last-child td { border-bottom: none; }
  tr:hover { background: rgba(9,105,218,.04) !important; }
</style>
</head>
<body>
<h1>SmartTracker – Account Summary Practice KPI Report</h1>
<p>Generated: ${new Date().toLocaleString()}</p>

<div class="cards">
  <div class="card">
    <div class="label">Total Accounts</div>
    <div class="num">${totalClients}</div>
  </div>
  <div class="card pass">
    <div class="label">Passed Accounts</div>
    <div class="num" style="color:#1a7f37">${passedClients}</div>
  </div>
  <div class="card fail">
    <div class="label">Failed Accounts</div>
    <div class="num" style="color:#cf222e">${failedClients}</div>
  </div>
  <div class="card skip">
    <div class="label">Skipped Accounts</div>
    <div class="num" style="color:#9a6700">${skippedClients}</div>
  </div>
  <div class="card">
    <div class="label">Total Assertions</div>
    <div class="num">${totalMetrics}</div>
  </div>
</div>

<h2>Discrepancies & Mismatched Metrics (${failedMetrics})</h2>
${failedHtml}

<h2>Account Level Summary</h2>
<table>
  <thead>
    <tr>
      <th>Client</th>
      <th style="text-align:center">Practices</th>
      <th style="text-align:center">Total Metrics</th>
      <th style="text-align:center">Passed</th>
      <th style="text-align:center">Failed</th>
      <th style="text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>
${clientRowsHtml}
  </tbody>
</table>

<h2>Detailed Field-Level KPI Validation</h2>
<table>
  <thead>
    <tr>
      <th>Client</th>
      <th>Practice</th>
      <th>Metric</th>
      <th style="text-align:center">DB Count</th>
      <th style="text-align:center">UI Count</th>
      <th style="text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>
${tbody}
  </tbody>
</table>
</body>
</html>`;
    fs.writeFileSync(file, html, 'utf8');
    console.log(`\nHTML Report saved: ${file}\n`);
}

function printConsoleSummary(rows) {
    console.log('\n============================================================');
    console.log('         ACCOUNT SUMMARY DB VS UI OVERALL VALIDATION SUMMARY');
    console.log('============================================================');

    const clientSummaryMap = new Map();
    for (const r of rows) {
        if (!clientSummaryMap.has(r.client)) {
            clientSummaryMap.set(r.client, {
                client: r.client,
                practices: new Set(),
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0
            });
        }
        const s = clientSummaryMap.get(r.client);
        if (r.practice && r.practice !== '---') s.practices.add(r.practice);
        s.total++;
        if (r.status === 'PASS') s.passed++;
        else if (r.status === 'FAIL') s.failed++;
        else if (r.status === 'SKIPPED') s.skipped++;
    }

    let passedClients = 0;
    let failedClients = 0;
    let skippedClients = 0;

    for (const c of clientSummaryMap.values()) {
        if (c.failed > 0) failedClients++;
        else if (c.skipped > 0 && c.passed === 0) skippedClients++;
        else passedClients++;
    }

    console.log(`Total Accounts Executed : ${clientSummaryMap.size}`);
    console.log(`Passed Accounts         : ${passedClients}`);
    console.log(`Failed Accounts         : ${failedClients}`);
    console.log(`Skipped Accounts        : ${skippedClients}`);
    console.log('------------------------------------------------------------');
    console.log(`Total Metric Assertions : ${rows.length}`);
    console.log(`Passed Metric Assertions: ${rows.filter(r => r.status === 'PASS').length}`);
    console.log(`Failed Metric Assertions: ${rows.filter(r => r.status === 'FAIL').length}`);
    console.log(`Skipped Assertions      : ${rows.filter(r => r.status === 'SKIPPED').length}`);

    console.log('\nACCOUNT BREAKDOWN SUMMARY:');
    console.log('----------------------------------------------------------------------');
    console.log(` ${'Client'.padEnd(35)} ${'Practices'.padEnd(10)} ${'Passed'.padEnd(8)} ${'Failed'.padEnd(8)} Status`);
    console.log('----------------------------------------------------------------------');

    for (const [client, c] of clientSummaryMap) {
        let status = 'PASS ✅';
        if (c.failed > 0) status = 'FAIL ❌';
        else if (c.skipped > 0 && c.passed === 0) status = 'SKIPPED ⚠️';

        console.log(` ${client.substring(0, 35).padEnd(35)} ${String(c.practices.size).padEnd(10)} ${String(c.passed).padEnd(8)} ${String(c.failed).padEnd(8)} ${status}`);
    }

    const failedRows = rows.filter(r => r.status === 'FAIL');
    if (failedRows.length > 0) {
        console.log('\n❌ MISMATCHED METRICS SUMMARY (' + failedRows.length + ' Discrepancy/Discrepancies Found):');
        console.log('--------------------------------------------------------------------------------------------------');
        console.log(` ${'#'.padEnd(4)} ${'Client'.padEnd(30)} ${'Practice'.padEnd(30)} ${'Metric'.padEnd(16)} ${'DB'.padEnd(6)} ${'UI'.padEnd(6)} Status`);
        console.log('--------------------------------------------------------------------------------------------------');
        failedRows.forEach((r, idx) => {
            console.log(` ${String(idx + 1).padEnd(4)} ${r.client.substring(0, 30).padEnd(30)} ${r.practice.substring(0, 30).padEnd(30)} ${r.metric.padEnd(16)} ${String(r.db).padEnd(6)} ${String(r.ui).padEnd(6)} FAIL ❌`);
        });
        console.log('--------------------------------------------------------------------------------------------------');
    } else {
        console.log('\n✅ ALL METRICS MATCHED PERFECTLY ACROSS ALL ACCOUNTS!');
    }

    console.log('============================================================\n');
}

// ============================================================
// SUITE
// ============================================================
test.describe('SmartTracker - Account Summary DB vs UI Validation', () => {
    let page;
    let loginPage;
    let practicesPage;

    // ----------------------------------------------------------
    // beforeAll: login then navigate directly to Account Summary
    // ----------------------------------------------------------
    test.beforeAll(async ({ browser }) => {
        const res = await setupAuthenticatedPage(browser);
        page = res.page;
        practicesPage = res.practicesPage;

        // Navigate directly to the Account Summary URL
        const baseUrl = (process.env.BASE_URL || 'http://13.61.179.149:4200').replace(/\/$/, '');
        await page.goto(`${baseUrl}/practice/account-summary`, { timeout: 90000 });
        await page.waitForTimeout(3000);

        // Ensure screenshots dir
        const dir = path.join(process.cwd(), 'screenshots');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    test.afterAll(async () => {
        writeHtmlReport(reportRows);
        printConsoleSummary(reportRows);
        try { if (page) await page.context().close(); } catch (_) { }
    });

    // ----------------------------------------------------------
    // UI HELPERS
    // ----------------------------------------------------------

    /**
     * Opens the Account dropdown and selects only the given client.
     * Returns true if found, false otherwise.
     */
    async function selectClient(clientName) {
        // The account dropdown button initially says "All Accounts".
        // After selection it shows the client name. We locate it by XPath
        // that covers both cases.
        const dropdownBtn = page.locator(
            "//button[contains(normalize-space(.), 'Accounts') or contains(normalize-space(.), 'Account')]"
        ).first();
        await dropdownBtn.waitFor({ state: 'visible', timeout: 15000 });
        await dropdownBtn.click();
        await page.waitForTimeout(800);

        // Uncheck "Select All" to deselect everything first
        const selectAllCb = page.locator(
            "//label[contains(@class,'multi-select-option')][.//span[@class='option-label' and normalize-space()='Select All']]//input[@type='checkbox']"
        );
        try {
            await selectAllCb.waitFor({ state: 'attached', timeout: 8000 });
            await selectAllCb.evaluate(n => { if (n.checked) n.click(); });
            await page.waitForTimeout(300);
        } catch (_) {
            console.log('WARNING: Select All checkbox not found.');
        }

        // Select the target client (case-insensitive)
        const lower = clientName.toLowerCase();
        const clientCb = page.locator(
            `//label[contains(@class,'multi-select-option')][.//span[@class='option-label' and translate(normalize-space(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='${lower}']]//input[@type='checkbox']`
        );
        try {
            await clientCb.waitFor({ state: 'attached', timeout: 5000 });
            await clientCb.evaluate(n => { if (!n.checked) n.click(); });
            await page.waitForTimeout(300);
            await page.keyboard.press('Escape').catch(() => { });
            await page.waitForTimeout(2000); // wait for cards to update
            return true;
        } catch (_) {
            console.log(`WARNING: "${clientName}" not found in Account dropdown. Skipping.`);
            await page.keyboard.press('Escape').catch(() => { });
            return false;
        }
    }

    /**
     * Reads all practice cards currently visible on the page.
     * Returns an array of practice objects matching the DB shape.
     */
    async function readPracticeCards() {
        const cards = page.locator('.cp-pcard');
        await page.waitForTimeout(500);
        const count = await cards.count();
        const results = [];

        for (let i = 0; i < count; i++) {
            const card = cards.nth(i);
            const practiceName = (await card.locator('.cp-pcard-title').innerText().catch(() => '')).trim();
            if (!practiceName) continue;

            // Helper: read the value from a labelled row inside the card
            const rowVal = async (label) => {
                try {
                    const row = card.locator(`xpath=.//div[contains(@class,'cp-pcard-row')][.//span[normalize-space()='${label}']]`);
                    const spans = row.locator('span');
                    const lastTxt = await spans.last().innerText().catch(() => '0');
                    return parseInt(lastTxt.trim()) || 0;
                } catch (_) { return 0; }
            };

            // Billable / Non-Billable badges
            const billable = parseInt(
                await card.locator("xpath=.//div[contains(@class,'cp-pcard-badge--billable')]//span[contains(@class,'cp-badge-num')]")
                    .innerText().catch(() => '0')
            ) || 0;
            const nonBillable = parseInt(
                await card.locator("xpath=.//div[contains(@class,'cp-pcard-badge--nonbillable')]//span[contains(@class,'cp-badge-num')]")
                    .innerText().catch(() => '0')
            ) || 0;

            results.push({
                practice: practiceName,
                billable,
                non_billable: nonBillable,
                production: await rowVal('Production'),
                bench: await rowVal('Bench'),
                internal: await rowVal('Internal'),
                investment: await rowVal('Investment'),
                leave_count: await rowVal('Leave'),
                notice: await rowVal('Notice'),
                hold: await rowVal('Hold'),
                offshore: await rowVal('Off-shore'),
                onsite: await rowVal('On-shore'),
                projects: await rowVal('Projects'),
            });
        }
        return results;
    }

    // ----------------------------------------------------------
    // TESTS – Continuous execution across all clients
    // ----------------------------------------------------------
    test('Validate Practice KPIs for All Accounts', async () => {
        for (const client of clients) {
            console.log('\n========================================');
            console.log(`CLIENT: ${client}`);
            console.log('========================================');

            try {
                // 1. Fetch DB data
                const dbRows = await getPracticeDBData(client);
                if (!dbRows || dbRows.length === 0) {
                    console.log(`\nNo DB data found for "${client}". Skipping.\n`);
                    reportRows.push({ client, practice: '---', metric: '---', db: '---', ui: '---', status: 'SKIPPED' });
                    continue;
                }

                // 2. Select client in Account filter
                const found = await selectClient(client);
                if (!found) {
                    await page.reload().catch(() => { });
                    await page.waitForTimeout(3000);
                    reportRows.push({ client, practice: '---', metric: '---', db: '---', ui: '---', status: 'SKIPPED' });
                    continue;
                }

                // 3. Read practice cards from UI
                const uiCards = await readPracticeCards();
                if (uiCards.length === 0) {
                    console.log(`WARNING: No practice cards found in UI for "${client}".\n`);
                    await page.reload().catch(() => { });
                    await page.waitForTimeout(3000);
                    reportRows.push({ client, practice: '---', metric: '---', db: '---', ui: '---', status: 'SKIPPED' });
                    continue;
                }

                // 4. Print & compare
                console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
                console.log(` Practice KPI Table for: ${client}`);
                console.log('├──────────────────────────────────────────────────────────────────────┤');
                console.log(` ${'Practice'.padEnd(30)} ${'Metric'.padEnd(16)} ${'DB'.padEnd(6)} ${'UI'.padEnd(6)} Status`);
                console.log('├──────────────────────────────────────────────────────────────────────┤');

                let clientPass = true;

                for (const db of dbRows) {
                    const ui = uiCards.find(c => c.practice === db.practice);
                    if (!ui) {
                        console.log(` ${db.practice.padEnd(30)} ${'CARD MISSING'.padEnd(16)} ${'N/A'.padEnd(6)} ${'N/A'.padEnd(6)} FAIL`);
                        reportRows.push({ client, practice: db.practice, metric: 'CARD MISSING', db: 'N/A', ui: 'N/A', status: 'FAIL' });
                        clientPass = false;
                        continue;
                    }

                    const metrics = [
                        { name: 'Billable', db: db.billable, ui: ui.billable },
                        { name: 'Non-Billable', db: db.non_billable, ui: ui.non_billable },
                        { name: 'Production', db: db.production, ui: ui.production },
                        { name: 'Bench', db: db.bench, ui: ui.bench },
                        { name: 'Internal', db: db.internal, ui: ui.internal },
                        { name: 'Investment', db: db.investment, ui: ui.investment },
                        { name: 'Leave', db: db.leave_count, ui: ui.leave_count },
                        { name: 'Notice', db: db.notice, ui: ui.notice },
                        { name: 'Hold', db: db.hold, ui: ui.hold },
                        { name: 'Offshore', db: db.offshore, ui: ui.offshore },
                        { name: 'Onsite', db: db.onsite, ui: ui.onsite },
                        { name: 'Projects', db: db.projects, ui: ui.projects },
                    ];

                    for (const m of metrics) {
                        const pass = Number(m.db) === Number(m.ui);
                        const st = pass ? 'PASS' : 'FAIL';
                        if (!pass) clientPass = false;
                        const practiceLabel = metrics.indexOf(m) === 0 ? db.practice.substring(0, 30).padEnd(30) : ''.padEnd(30);
                        console.log(` ${practiceLabel} ${m.name.padEnd(16)} ${String(m.db).padEnd(6)} ${String(m.ui).padEnd(6)} ${st}`);
                        reportRows.push({ client, practice: db.practice, metric: m.name, db: m.db, ui: m.ui, status: st });
                    }
                    console.log(' ' + '─'.repeat(69));
                }

                console.log(`\n Overall for ${client}: ${clientPass ? 'PASS ✅' : 'FAIL ❌'}`);
                console.log('└──────────────────────────────────────────────────────────────────────┘\n');

                // 5. Screenshot on mismatch
                if (!clientPass) {
                    const ss = path.join(process.cwd(), 'screenshots', `account_${client.replace(/[^a-z0-9]/gi, '_')}_mismatch.png`);
                    await page.screenshot({ path: ss, fullPage: true }).catch(() => { });
                    console.log(`Screenshot: ${ss}`);
                }

                // 6. Reset page for next client
                await page.reload().catch(() => { });
                await page.waitForTimeout(2000);
            } catch (err) {
                console.log(`ERROR validating client ${client}: ${err.message}`);
                reportRows.push({ client, practice: 'ERROR', metric: err.message, db: 'N/A', ui: 'N/A', status: 'FAIL' });
                await page.reload().catch(() => { });
                await page.waitForTimeout(2000);
            }
        }

        // Assert at the end after all accounts complete
        const failedMetricsCount = reportRows.filter(r => r.status === 'FAIL').length;
        if (failedMetricsCount > 0) {
            expect.soft(failedMetricsCount, `Validation completed for all ${clients.length} accounts. Found ${failedMetricsCount} metric mismatch(es).`).toBe(0);
        }
    });
});

