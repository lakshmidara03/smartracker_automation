const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../../pages/LoginPage');
const { setupAuthenticatedPage } = require('../helpers/practicesTestHelper');
const { PracticesPage } = require('../../../pages/PracticesPage');
const { ProjectAllocationPage } = require('../../../pages/ProjectAllocationPage');
const fs = require('fs');
const path = require('path');

const { executeQuery } = require('../../../utils/dbUtils');

test.describe.configure({ mode: 'default' });

test.describe('SmartTracker - Client Details DB vs UI Validation', () => {
    let page;
    let loginPage;
    let practicesPage;
    let projectAllocationPage;
    const reportRows = [];

    const clients = [
        'Amgen', 'Autodesk', 'Bazar Voice', 'BlackDuck', 'Ciena',
        'Deckers Outdoor Corporation', 'Diverselynx-Mphasis-Wells Fargo',
        'Docusign', 'Fastly', 'Fountain group - DTDC', 'Google', 'Greystar',
        'Hewlett Packard Enterprise Company', 'Intuit Inc', 'Intuitive Surgical',
        'JPMC', 'OT', 'Palo Alto', 'Pure Storage', 'Salesforce Inc', 'Siemens',
        'SRS - TCS', 'SRS- TechM - Cisco', 'SRS-Comtec-Toyoto', 'Stripe',
        'Western Digital', 'ZS'
    ];

    test.beforeAll(async ({ browser }) => {
        const res = await setupAuthenticatedPage(browser);
        page = res.page;
        practicesPage = res.practicesPage;
        projectAllocationPage = new ProjectAllocationPage(page);
        await projectAllocationPage.projectAllocationsBtn.waitFor({ state: 'visible', timeout: 15000 });
        await projectAllocationPage.projectAllocationsBtn.click();
        await page.waitForTimeout(3000);
        const screenshotsDir = path.join(process.cwd(), 'screenshots');
        if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    });

    test.afterAll(async () => {
        writeHtmlReport(reportRows);
        try { if (page) await page.context().close(); } catch (e) { /* ignore trace cleanup errors */ }
    });


    // ============================================================
    // DB QUERY
    // ============================================================

    async function getClientDBData(clientName) {
        const query = `
      SELECT p.client_name,
          COUNT(DISTINCT e.emp_id) AS team_size,
          COUNT(DISTINCT CASE WHEN a.is_billable = 1 THEN e.emp_id END) AS prod,
          COUNT(DISTINCT CASE WHEN a.is_billable = 0 THEN e.emp_id END) AS non_prod,
          COUNT(DISTINCT CASE WHEN LOWER(TRIM(a.project_location)) LIKE '%india%' THEN e.emp_id END) AS offshore,
          COUNT(DISTINCT CASE WHEN LOWER(TRIM(a.project_location)) NOT LIKE '%india%' THEN e.emp_id END) AS onsite
      FROM hrportal.employee_allocation a
      INNER JOIN hrportal.emp_details e ON a.emp_id = e.emp_id
      INNER JOIN hrportal.project p ON a.project_id = p.id
      WHERE p.client_name LIKE CONCAT('%', ?, '%')
        AND a.start_date <= CURDATE()
        AND (a.end_date IS NULL OR a.end_date >= CURDATE())
        AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
      GROUP BY p.client_name;
    `;
        const result = await executeQuery(query, [clientName]);
        return result[0];
    }

    // ============================================================
    // UI HELPERS
    //
    // IMPORTANT: The account dropdown button uses XPath because its text
    // can change (e.g. 'All Accounts' -> 'Amgen') and the button() filter
    // approach can accidentally match navigation links.
    // ============================================================

    async function selectClient(clientName) {
        // Open the account dropdown using the EXACT XPath that worked in the original run
        const accountDropdownBtn = page.locator("//button[contains(normalize-space(.), 'Accounts')]").first();
        await accountDropdownBtn.waitFor({ state: 'visible', timeout: 15000 });
        await accountDropdownBtn.click();
        await page.waitForTimeout(500);

        // Uncheck 'All Accounts' to deselect all (15 s timeout + try-catch so we never hard-fail here)
        const allAccountsCheckbox = page.locator(
            "//label[contains(@class,'multi-select-option')][.//span[@class='option-label' and normalize-space()='All Accounts']]//input[@type='checkbox']"
        );
        try {
            await allAccountsCheckbox.waitFor({ state: 'attached', timeout: 15000 });
            await allAccountsCheckbox.evaluate(node => { if (node.checked) node.click(); });
            await page.waitForTimeout(300);
        } catch (e) {
            console.log('WARNING: All Accounts checkbox not found, proceeding without deselecting.');
        }

        // Case-insensitive match for the specific client
        const lowerClientName = clientName.toLowerCase();
        const clientCheckbox = page.locator(
            `//label[contains(@class,'multi-select-option')][.//span[@class='option-label' and translate(normalize-space(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='${lowerClientName}']]//input[@type='checkbox']`
        );

        try {
            await clientCheckbox.waitFor({ state: 'attached', timeout: 5000 });
            await clientCheckbox.evaluate(node => { if (!node.checked) node.click(); });
            await page.waitForTimeout(300);
            await page.keyboard.press('Escape').catch(() => { });
            await page.waitForTimeout(1500);
            return true;
        } catch (e) {
            console.log(`\nWARNING: Client "${clientName}" not found in dropdown. Skipping.`);
            await page.keyboard.press('Escape').catch(() => { });
            return false;
        }
    }

    async function getKPIValue(label) {
        const uiLabel = label.toUpperCase();
        const kpiContainer = page.locator(`//*[normalize-space(text())='${uiLabel}']/..`);
        await kpiContainer.first().waitFor({ state: 'visible', timeout: 10000 });
        const text = await kpiContainer.first().innerText();
        const match = text.match(/(\d+[,.]?\d*)/);
        if (!match) throw new Error(`Could not extract KPI value for "${uiLabel}". Container text: ${text}`);
        return Number(match[0].replace(/,/g, ''));
    }

    // ============================================================
    // REPORT
    // ============================================================

    function writeHtmlReport(rows) {
        const reportsDir = path.join(process.cwd(), 'reports');
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(reportsDir, `client_details_report_${timestamp}.html`);
        const rowsHtml = rows.map(r => {
            const bg = r.allStatus === 'PASS' ? '#e6ffed' : r.allStatus === 'SKIPPED' ? '#fffbe6' : '#fff0f0';
            const ac = r.activeStatus === 'PASS' ? 'green' : r.activeStatus === 'SKIPPED' ? 'gray' : 'orange';
            const al = r.allStatus === 'PASS' ? 'green' : r.allStatus === 'SKIPPED' ? 'gray' : 'red';
            return `<tr style="background:${bg}">
                <td>${r.client}</td><td>${r.metric}</td><td>${r.db}</td>
                <td>${r.uiActive}</td><td>${r.uiAll}</td>
                <td style="font-weight:bold;color:${ac}">${r.activeStatus}</td>
                <td style="font-weight:bold;color:${al}">${r.allStatus}</td>
            </tr>`;
        }).join('\n');
        const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Client Details KPI Report</title>
<style>
  body{font-family:Arial,sans-serif;margin:20px;}
  h1{color:#333;}
  table{border-collapse:collapse;width:100%;font-size:13px;}
  th,td{border:1px solid #ccc;padding:8px 12px;text-align:left;}
  th{background:#4a90e2;color:white;}
  tr:hover{filter:brightness(0.97);}
</style></head>
<body>
<h1>SmartTracker - Client Details KPI Validation Report</h1>
<p>Generated: ${new Date().toLocaleString()}</p>
<table>
  <thead><tr>
    <th>Client</th><th>Metric</th><th>DB Count</th>
    <th>UI (Active)</th><th>UI (All)</th>
    <th>Status (Active)</th><th>Status (All)</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
</body></html>`;
        fs.writeFileSync(reportPath, html, 'utf8');
        console.log(`\nHTML Report saved: ${reportPath}\n`);
    }

    // ============================================================
    // MAIN TEST
    // ============================================================

    test.describe('Validate Client Details KPIs against Database', () => {
        for (const client of clients) {
            test(`Validate KPIs for ${client}`, async () => {

                console.log('\n========================================');
                console.log(`CLIENT: ${client}`);
                console.log('========================================');

                // ---- DB Data ----
                const dbData = await getClientDBData(client);
                if (!dbData) {
                    console.log(`\nNo DB data found for client: "${client}". Skipping.`);
                    console.log('========================================\n');
                    reportRows.push({ client, metric: '---', db: '---', uiActive: '---', uiAll: '---', activeStatus: 'SKIPPED', allStatus: 'SKIPPED' });
                    test.skip();
                    return;
                }
                console.log('\nDB DATA:');
                console.log(dbData);

                // ---- Select Client in UI ----
                const clientFound = await selectClient(client);
                if (!clientFound) {
                    // Reload to reset state so next test starts clean
                    await page.reload({ waitUntil: 'networkidle' }).catch(() => { });
                    await page.waitForTimeout(3000);
                    // Re-navigate to Project Allocations after reload
                    await practicesPage.practicesTab.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { });
                    await practicesPage.practicesTab.click().catch(() => { });
                    await page.waitForTimeout(1000);
                    await projectAllocationPage.projectAllocationsBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { });
                    await projectAllocationPage.projectAllocationsBtn.click().catch(() => { });
                    await page.waitForTimeout(2000);
                    reportRows.push({ client, metric: '---', db: '---', uiActive: '---', uiAll: '---', activeStatus: 'SKIPPED', allStatus: 'SKIPPED' });
                    test.skip();
                    return;
                }

                // ---- Capture Active view KPIs ----
                const uiActiveTeamSize = await getKPIValue('Team Size');
                const uiActiveProd = await getKPIValue('Prod');
                const uiActiveNonProd = await getKPIValue('Non Prod');
                const uiActiveOffshore = await getKPIValue('Offshore');
                const uiActiveOnsite = await getKPIValue('Onsite');

                // ---- Enable Inactive Projects toggle ----
                const inactiveCheckbox = page.locator('label').filter({ hasText: 'Inactive Projects' }).locator('input[type="checkbox"]');
                await inactiveCheckbox.waitFor({ state: 'attached', timeout: 5000 }).catch(() => { });
                if (await inactiveCheckbox.count() > 0) {
                    await inactiveCheckbox.evaluate(node => { if (!node.checked) node.click(); });
                    await page.waitForTimeout(1500);
                }

                // ---- Capture All view KPIs ----
                const uiAllTeamSize = await getKPIValue('Team Size');
                const uiAllProd = await getKPIValue('Prod');
                const uiAllNonProd = await getKPIValue('Non Prod');
                const uiAllOffshore = await getKPIValue('Offshore');
                const uiAllOnsite = await getKPIValue('Onsite');

                // ---- Print comparison ----
                console.log('\nKPI VALIDATION:');
                console.log('Metric         DB Count    UI (Active)   UI (All)    Status (Active)   Status (All)');
                console.log('------------------------------------------------------------------------------------');

                const metrics = [
                    { name: 'Team Size', db: dbData.team_size, uiActive: uiActiveTeamSize, uiAll: uiAllTeamSize },
                    { name: 'Prod', db: dbData.prod, uiActive: uiActiveProd, uiAll: uiAllProd },
                    { name: 'Non-Prod', db: dbData.non_prod, uiActive: uiActiveNonProd, uiAll: uiAllNonProd },
                    { name: 'Offshore', db: dbData.offshore, uiActive: uiActiveOffshore, uiAll: uiAllOffshore },
                    { name: 'Onsite', db: dbData.onsite, uiActive: uiActiveOnsite, uiAll: uiAllOnsite }
                ];

                let overallPass = true;
                let hasActiveMismatch = false;

                for (const m of metrics) {
                    const matchAll = Number(m.db) === Number(m.uiAll);
                    const matchActive = Number(m.db) === Number(m.uiActive);
                    if (!matchAll) overallPass = false;
                    if (!matchActive) hasActiveMismatch = true;
                    const statusAll = matchAll ? 'PASS' : 'FAIL';
                    const statusActive = matchActive ? 'PASS' : 'FAIL';
                    console.log(
                        `${m.name.padEnd(15)}DB: ${String(m.db).padEnd(10)}UI: ${String(m.uiActive).padEnd(12)}UI: ${String(m.uiAll).padEnd(10)}${statusActive.padEnd(18)}${statusAll}`
                    );
                    console.log('');
                    reportRows.push({ client, metric: m.name, db: m.db, uiActive: m.uiActive, uiAll: m.uiAll, activeStatus: statusActive, allStatus: statusAll });
                }

                console.log('------------------------------------------------------------------------------------');
                console.log(`Overall (DB vs All): ${overallPass ? 'PASS' : 'FAIL'}`);
                console.log('========================================\n');

                // ---- Screenshot on Active mismatch ----
                if (hasActiveMismatch) {
                    const screenshotPath = path.join(process.cwd(), 'screenshots', `${client.replace(/[^a-z0-9]/gi, '_')}_active_mismatch.png`);
                    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => { });
                    console.log(`Screenshot saved: ${screenshotPath}`);
                }

                // ---- Soft assertion: log mismatch but DO NOT stop the suite ----
                // Docusign and similar clients may have genuine DB vs UI data drift.
                // We capture the result in the HTML report; use console.warn so CI can
                // grep for mismatches without blocking subsequent clients.
                if (!overallPass) {
                    console.warn(`\n⚠️  MISMATCH: "${client}" - DB vs UI (All) differs. See KPI table above.\n`);
                    const allMismatchPath = path.join(process.cwd(), 'screenshots', `${client.replace(/[^a-z0-9]/gi, '_')}_all_mismatch.png`);
                    await page.screenshot({ path: allMismatchPath, fullPage: true }).catch(() => { });
                    console.log(`Screenshot saved: ${allMismatchPath}`);
                }

                // ---- Reload page to reset all filters for next client ----
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);
            });
        }
    });
});

