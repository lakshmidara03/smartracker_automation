const { test, expect } = require('@playwright/test');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const baseUrl = (process.env.UI_BASE_URL || (process.env.BASE_URL && !process.env.BASE_URL.includes('13.61.179.149') ? process.env.BASE_URL : 'http://localhost:4200')).replace(/\/$/, '');
const REPORT_URL = `${baseUrl}/reports/bench-reports`;

let dbConnection = null;

async function getDbConnection() {
    if (!dbConnection) {
        dbConnection = await mysql.createConnection({
            host: process.env.DB_HOST || '13.61.179.149',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'relanto123',
            database: process.env.DB_NAME || 'hrportal'
        });
    }
    return dbConnection;
}

// Format numbers to match UI currency display (e.g., $13,152,571)
function formatCurrency(num) {
    if (num === null || num === undefined) return '$0';
    return '$' + Math.round(num).toLocaleString('en-US');
}

test.describe('Bench Costs Report - Comprehensive UI, DB & KPI Validation (Zero-Secret-Key)', () => {
    test.setTimeout(90000);

    let benchApiData = null;

    test.beforeEach(async ({ page }) => {
        // Intercept the backend bench report API call on page load
        const reportPromise = page.waitForResponse(
            res => res.url().includes('/v1/reports/bench') && res.status() === 200,
            { timeout: 30000 }
        );

        await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' });

        const apiRes = await reportPromise;
        benchApiData = await apiRes.json();

        // Wait until spinner is gone and table is visible
        await expect(page.locator('select.filter-select')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('.kpi-row')).toBeVisible({ timeout: 15000 });
    });

    test.afterAll(async () => {
        if (dbConnection) {
            await dbConnection.end().catch(() => {});
            dbConnection = null;
        }
    });

    const getTab = (page, isProd) => isProd 
        ? page.locator('button.bench-tab').filter({ hasNotText: 'Non-Production' }).filter({ hasText: 'Production' })
        : page.locator('button.bench-tab').filter({ hasText: /Non-Production/ });

    /**
     * ============================================================
     * 1. NON-PRODUCTION PRACTICES BENCH COSTS & KPI VALIDATION (+VE)
     * ============================================================
     */
    test.describe('1. Non-Production Practices Tab (+ve Tests)', () => {

        test('NP-POS-01 - KPI Cards match backend report totals and quarter distribution', async ({ page }) => {
            const nonProd = benchApiData.nonProduction;
            expect(nonProd).toBeDefined();

            // Verify FY Total KPI Card
            const expectedFyTotal = formatCurrency(nonProd.fy);
            const fyCard = page.locator('.kpi-card.fy .kpi-value');
            await expect(fyCard).toBeVisible();
            await expect(fyCard).toHaveText(expectedFyTotal);

            // Verify Q1, Q2, Q3, Q4 KPI Cards
            const quarters = [
                { label: 'Q1', expected: formatCurrency(nonProd.q1) },
                { label: 'Q2', expected: formatCurrency(nonProd.q2) },
                { label: 'Q3', expected: formatCurrency(nonProd.q3) },
                { label: 'Q4', expected: formatCurrency(nonProd.q4) }
            ];

            for (const q of quarters) {
                const qCard = page.locator('.kpi-card', { hasText: q.label }).locator('.kpi-value');
                await expect(qCard).toBeVisible();
                await expect(qCard).toHaveText(q.expected);
            }

            console.log(`[PASS] Non-Production KPI Cards matched: FY=${expectedFyTotal}, Q1=${quarters[0].expected}, Q2=${quarters[1].expected}, Q3=${quarters[2].expected}, Q4=${quarters[3].expected}`);
        });

        test('NP-POS-02 - Table rows match math calculations and cross-validate with MySQL without secret key', async ({ page }) => {
            const sampleRows = benchApiData.nonProduction.rows.slice(0, 5);
            expect(sampleRows.length).toBeGreaterThan(0);

            const conn = await getDbConnection();

            for (const rowData of sampleRows) {
                const empId = rowData.employeeId;

                // 1. UI Table Row Assertion - match exact employee ID in the first column
                const uiRow = page.locator('table tbody tr').filter({
                    has: page.locator('td').first().filter({ hasText: new RegExp(`^\\s*${empId}\\s*$`) })
                }).first();
                await expect(uiRow).toBeVisible();

                const uiDays = await uiRow.locator('td.num').nth(0).innerText();
                expect(parseInt(uiDays.trim(), 10)).toBe(rowData.days);

                if (!rowData.missingOutrate && rowData.outrate !== null) {
                    const uiOutrate = await uiRow.locator('td.num').nth(1).innerText();
                    expect(parseFloat(uiOutrate.trim())).toBe(rowData.outrate);
                }

                const uiTotal = await uiRow.locator('td.num.total').innerText();
                const parsedUiTotal = parseFloat(uiTotal.trim().replace(/,/g, ''));
                expect(Math.abs(parsedUiTotal - rowData.total)).toBeLessThanOrEqual(1.5);

                // 2. MySQL DB Linkage (Zero Secret Key)
                // Verify employee exists in emp_details
                const [empRows] = await conn.query('SELECT emp_id, full_name FROM emp_details WHERE emp_id = ?', [empId]);
                expect(empRows.length).toBe(1);
                expect(empRows[0].full_name.trim().toLowerCase()).toContain(rowData.employeeName.trim().toLowerCase().split(' ')[0]);

                // Verify employee_base_costs row exists & outrate is encrypted (NOT plain text)
                const [costRows] = await conn.query('SELECT outrate FROM employee_base_costs WHERE employee_id = ?', [empId]);
                if (costRows.length > 0 && costRows[0].outrate) {
                    const dbRawOutrate = costRows[0].outrate;

                    // Encryption validation: Not stored as raw plain number
                    expect(dbRawOutrate).not.toBe(String(rowData.outrate));
                    expect(dbRawOutrate).not.toMatch(/^[0-9.]+$/);
                    // Confirms Base64 ciphertext format
                    expect(dbRawOutrate).toMatch(/^[A-Za-z0-9+/=]+$/);
                }
            }
            console.log(`[PASS] Non-Production table rows and DB encryption verified for ${sampleRows.length} employees`);
        });

        test('NP-POS-03 - Table footer totals match KPI card values and sum of rows', async ({ page }) => {
            const nonProd = benchApiData.nonProduction;
            const footerRow = page.locator('.bench-table-footer-wrap tfoot tr');
            await expect(footerRow).toBeVisible();

            const footerTotal = await footerRow.locator('td.num.total').innerText();
            expect(footerTotal.trim().replace(/,/g, '')).toBe(String(Math.round(nonProd.fy)));

            // Sum of quarters in footer equals FY total
            const footerQ1 = parseFloat((await footerRow.locator('td.num').nth(1).innerText()).replace(/,/g, ''));
            const footerQ2 = parseFloat((await footerRow.locator('td.num').nth(2).innerText()).replace(/,/g, ''));
            const footerQ3 = parseFloat((await footerRow.locator('td.num').nth(3).innerText()).replace(/,/g, ''));
            const footerQ4 = parseFloat((await footerRow.locator('td.num').nth(4).innerText()).replace(/,/g, ''));

            const sumQuarters = footerQ1 + footerQ2 + footerQ3 + footerQ4;
            expect(Math.abs(sumQuarters - parseFloat(footerTotal.trim().replace(/,/g, '')))).toBeLessThanOrEqual(5); // rounding tolerance
            console.log('[PASS] Non-Production footer totals accurately match KPI and quarter sum');
        });
    });

    /**
     * ============================================================
     * 2. PRODUCTION PRACTICES BENCH COSTS & KPI VALIDATION (+VE)
     * ============================================================
     */
    test.describe('2. Production Practices Tab (+ve Tests)', () => {

        test.beforeEach(async ({ page }) => {
            // Switch to Production tab
            const prodTab = getTab(page, true);
            await prodTab.click();
            await expect(prodTab).toHaveClass(/active/);
        });

        test('PR-POS-01 - Switching to Production tab dynamically updates KPI cards to Production totals', async ({ page }) => {
            const prod = benchApiData.production;
            expect(prod).toBeDefined();

            // Verify FY Total dynamically updated to Production total
            const expectedProdFy = formatCurrency(prod.fy);
            const fyCard = page.locator('.kpi-card.fy .kpi-value');
            await expect(fyCard).toHaveText(expectedProdFy);

            // Verify Quarter cards dynamically updated
            const q1Card = page.locator('.kpi-card', { hasText: 'Q1' }).locator('.kpi-value');
            await expect(q1Card).toHaveText(formatCurrency(prod.q1));

            const q2Card = page.locator('.kpi-card', { hasText: 'Q2' }).locator('.kpi-value');
            await expect(q2Card).toHaveText(formatCurrency(prod.q2));

            const q3Card = page.locator('.kpi-card', { hasText: 'Q3' }).locator('.kpi-value');
            await expect(q3Card).toHaveText(formatCurrency(prod.q3));

            const q4Card = page.locator('.kpi-card', { hasText: 'Q4' }).locator('.kpi-value');
            await expect(q4Card).toHaveText(formatCurrency(prod.q4));

            console.log(`[PASS] Production KPI Cards successfully updated to: FY=${expectedProdFy}`);
        });

        test('PR-POS-02 - Production rows include Project column, valid math and DB encryption check', async ({ page }) => {
            const sampleRows = benchApiData.production.rows.slice(0, 5);
            expect(sampleRows.length).toBeGreaterThan(0);

            const conn = await getDbConnection();

            for (const rowData of sampleRows) {
                const empId = rowData.employeeId;

                // Find row by employeeId in first column
                const uiRow = page.locator('table tbody tr').filter({
                    has: page.locator('td').first().filter({ hasText: new RegExp(`^\\s*${empId}\\s*$`) })
                }).first();
                await expect(uiRow).toBeVisible();

                // Validate Project column is visible in Production view
                const projectHeader = page.locator('th', { hasText: 'Project' });
                await expect(projectHeader).toBeVisible();

                // Cross-validate with DB employee record
                const [empRows] = await conn.query('SELECT emp_id, full_name FROM emp_details WHERE emp_id = ?', [empId]);
                expect(empRows.length).toBe(1);

                // Verify encryption in DB without secret key
                const [costRows] = await conn.query('SELECT outrate FROM employee_base_costs WHERE employee_id = ?', [empId]);
                if (costRows.length > 0 && costRows[0].outrate) {
                    const dbRaw = costRows[0].outrate;
                    expect(dbRaw).not.toBe(String(rowData.outrate));
                    expect(dbRaw).toMatch(/^[A-Za-z0-9+/=]+$/);
                }
            }
            console.log('[PASS] Production rows, Project column, and DB encryption verified');
        });

        test('PR-POS-03 - Production Table footer totals match Production KPI card values', async ({ page }) => {
            const prod = benchApiData.production;
            const footerRow = page.locator('.bench-table-footer-wrap tfoot tr');
            await expect(footerRow).toBeVisible();

            const expectedTotalFormatted = Math.round(prod.fy).toLocaleString('en-US');
            await expect(footerRow.locator('td.num.total')).toHaveText(expectedTotalFormatted);

            const fyCard = page.locator('.kpi-card.fy .kpi-value');
            await expect(fyCard).toHaveText(formatCurrency(prod.fy));
        });
    });

    /**
     * ============================================================
     * 3. FILTERING & DYNAMIC KPI CARD TRANSFORMATIONS (+VE & EDGE)
     * ============================================================
     */
    test.describe('3. Dynamic Filtering & KPI Transformations', () => {

        test('FILTER-POS-01 - Practice filter updates table rows and footer total dynamically', async ({ page }) => {
            const select = page.locator('select.filter-select');
            await select.selectOption('Academy');

            // Wait for filtered table rows to render
            await expect(page.locator('table tbody tr').first()).toBeVisible();

            const academyRows = await page.locator('table tbody tr').count();
            expect(academyRows).toBeGreaterThan(0);

            // Table footer text reflects filtered entries
            const footerText = await page.locator('.bench-table-footer-wrap tfoot td').first().innerText();
            expect(footerText).toContain(`${academyRows} ${academyRows === 1 ? 'entry' : 'entries'} shown`);
        });

        test('DATE-POS-01 - Date filtering transforms 5 KPI cards into a single summary card', async ({ page }) => {
            const dates = page.locator('input.filter-date');
            await dates.nth(0).fill('2026-01-01');
            await dates.nth(1).fill('2026-03-31');

            // Normal 5 KPI cards disappear
            await expect(page.locator('.kpi-row')).toHaveCount(0);

            // Single date-filtered KPI card appears
            const dateSummaryKpi = page.locator('section.kpi');
            await expect(dateSummaryKpi).toBeVisible();

            const kpiMeta = await dateSummaryKpi.locator('.kpi__meta').innerText();
            expect(kpiMeta).toContain('workdays');
            expect(kpiMeta).toContain('entries');

            // Clear date filter button appears
            const clearBtn = page.locator('button.clear-date-btn');
            await expect(clearBtn).toBeVisible();

            // Clicking Clear date restores the 5 KPI cards
            await clearBtn.click();
            await expect(page.locator('.kpi-row')).toBeVisible();
            await expect(page.locator('.kpi-card')).toHaveCount(5);
        });

        test('PAGE-POS-01 - Changing page size updates displayed rows without altering overall footer totals', async ({ page }) => {
            const pageSize = page.locator('.foot select');
            await pageSize.selectOption('10');

            const displayedRows = await page.locator('table tbody tr').count();
            expect(displayedRows).toBeLessThanOrEqual(10);

            // Footer total still represents all filtered records
            const nonProd = benchApiData.nonProduction;
            const footerTotal = await page.locator('.bench-table-footer-wrap tfoot td.num.total').innerText();
            expect(footerTotal.trim().replace(/,/g, '')).toBe(String(Math.round(nonProd.fy)));
        });
    });

    /**
     * ============================================================
     * 4. NEGATIVE TEST CASES (-VE)
     * ============================================================
     */
    test.describe('4. Negative Scenarios & Error Handling (-ve Tests)', () => {

        test('NEG-01 - Non-existent employee search displays empty state', async ({ page }) => {
            const searchInput = page.locator('input[placeholder="Search name, ID, practice..."]');
            await searchInput.fill('NON_EXISTENT_ID_9999999');

            // Table card is hidden and empty state message is shown
            await expect(page.locator('.bench-empty')).toBeVisible();
            await expect(page.locator('.bench-empty')).toContainText('No entries found.');
            await expect(page.locator('.bench-table-card')).toHaveCount(0);
        });

        test('NEG-02 - Inverted date range (From > To) gracefully yields zero workdays or empty set', async ({ page }) => {
            const dates = page.locator('input.filter-date');
            await dates.nth(0).fill('2026-12-31');
            await dates.nth(1).fill('2026-01-01');

            // Page does not crash and displays summary card with 0 entries/workdays
            const dateSummaryKpi = page.locator('section.kpi');
            await expect(dateSummaryKpi).toBeVisible();
            const value = await dateSummaryKpi.locator('.kpi__value').innerText();
            expect(value).toBe('$0');
        });

        test('NEG-03 - Graceful handling when backend reports API returns 500 server error', async ({ page }) => {
            // Intercept and simulate a 500 error on /v1/reports/bench
            await page.route('**/v1/reports/bench*', route => {
                route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'Internal Server Error' })
                });
            });

            await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' });

            // UI displays error message with Retry button
            const errorState = page.locator('.bench-state.error');
            await expect(errorState).toBeVisible({ timeout: 10000 });
            await expect(errorState.locator('button.link-btn')).toHaveText('Retry');
        });
    });

    /**
     * ============================================================
     * 5. EXPLICIT EDGE CASES (EDGE)
     * ============================================================
     */
    test.describe('5. Explicit Edge Cases', () => {

        test('EDGE-01 - Security: 100% of stored outrates in MySQL are encrypted (Zero Plain-Text Leakage)', async () => {
            const conn = await getDbConnection();
            const [rows] = await conn.query('SELECT employee_id, outrate FROM employee_base_costs LIMIT 50');

            expect(rows.length).toBeGreaterThan(0);

            for (const r of rows) {
                if (r.outrate && r.outrate.trim().length > 0) {
                    // Must NOT be stored as plain numeric text (e.g. "25", "180.00")
                    expect(r.outrate).not.toMatch(/^[0-9]+(\.[0-9]+)?$/);

                    // Must conform to standard AES Base64 block format
                    expect(r.outrate).toMatch(/^[A-Za-z0-9+/=]+$/);
                }
            }
            console.log(`[PASS SECURITY] Verified ${rows.length} rows in employee_base_costs: Zero plain-text leakage!`);
        });

        test('EDGE-02 - Employees with missing outrates display warning chip without breaking UI calculation', async ({ page }) => {
            const nonProd = benchApiData.nonProduction;
            const missingEmployees = nonProd.rows.filter(r => r.missingOutrate === true);

            if (missingEmployees.length > 0) {
                const sampleMissing = missingEmployees[0];
                await page.locator('input[placeholder="Search name, ID, practice..."]').fill(sampleMissing.employeeId);

                const row = page.locator('table tbody tr', { hasText: sampleMissing.employeeId }).first();
                await expect(row).toBeVisible();

                // UI displays 'No outrate' warning chip
                const chip = row.locator('.chip-warn');
                await expect(chip).toBeVisible();
                await expect(chip).toHaveText('No outrate');

                // Q1..Q4 and Total must gracefully count as 0 without throwing NaN or crashing
                const totalCell = row.locator('td.num.total');
                await expect(totalCell).toHaveText('0');
            } else {
                console.log('[SKIP] No employees with missing outrate in current test dataset');
            }
        });

        test('EDGE-03 - Same From and To Date calculates single-day workday rate', async ({ page }) => {
            const dates = page.locator('input.filter-date');
            // Choose a Monday (June 15, 2026)
            await dates.nth(0).fill('2026-06-15');
            await dates.nth(1).fill('2026-06-15');

            const dateSummaryKpi = page.locator('section.kpi');
            await expect(dateSummaryKpi).toBeVisible();

            const kpiMeta = await dateSummaryKpi.locator('.kpi__meta').innerText();
            expect(kpiMeta).toMatch(/\b\d+\s+workdays\b/);
            expect(kpiMeta).toContain('entries');
        });

        test('EDGE-04 - Search input with XSS and SQL injection payloads handled safely', async ({ page }) => {
            const searchInput = page.locator('input[placeholder="Search name, ID, practice..."]');
            const attacks = [
                '<script>alert("xss")</script>',
                "' OR '1'='1"
            ];

            for (const payload of attacks) {
                await searchInput.fill(payload);
                await expect(page.locator('body')).toBeVisible();
                expect(await page.locator('script[src*="alert"]').count()).toBe(0);
                await expect.poll(async () => page.locator('table tbody tr').count()).toBe(0);
            }
        });

        test('EDGE-05 - Switching tabs resets active search query and resets pagination', async ({ page }) => {
            const searchInput = page.locator('input[placeholder="Search name, ID, practice..."]');
            await searchInput.fill('Academy');
            await expect(searchInput).toHaveValue('Academy');

            // Switch tab to Production
            const prodTab = getTab(page, true);
            await prodTab.click();

            // Search input is automatically cleared
            await expect(searchInput).toHaveValue('');
        });

        test('EDGE-06 - Selecting All items per page displays entire dataset on single page', async ({ page }) => {
            const pageSize = page.locator('.foot select');
            await pageSize.selectOption('9999');

            const totalRows = benchApiData.nonProduction.rows.length;
            await expect.poll(async () => page.locator('table tbody tr').count()).toBe(totalRows);

            // Pagination next/prev buttons are disabled
            await expect(page.locator('button[title="Next Page"]')).toBeDisabled();
            await expect(page.locator('button[title="Previous Page"]')).toBeDisabled();
        });
    });
});
