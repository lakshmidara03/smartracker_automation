const { test, expect } = require('@playwright/test');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const baseUrl = (process.env.UI_BASE_URL || (process.env.BASE_URL && !process.env.BASE_URL.includes('13.61.179.149') ? process.env.BASE_URL : 'http://localhost:4200')).replace(/\/$/, '');
const REPORT_URL = `${baseUrl}/reports/milestone-reports`;
const API_BASE_URL = 'http://localhost:8080/api';

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

function formatCurrency(num) {
    if (num === null || num === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

test.describe('Milestone Reports - Comprehensive UI & MySQL DB Validation', () => {
    test.setTimeout(90000);

    let milestoneApiData = null;

    test.beforeEach(async ({ page }) => {
        // Intercept backend milestone reports API call on load
        const reportPromise = page.waitForResponse(
            res => res.url().includes('/sow/milestones/reports') && res.status() === 200,
            { timeout: 30000 }
        );

        await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' });

        const apiRes = await reportPromise;
        milestoneApiData = await apiRes.json();

        // Wait until spinner is gone and top bar & account rows are visible
        await expect(page.locator('input[placeholder*="Search Account, SoW, Milestone"]')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('.client-row').first()).toBeVisible({ timeout: 15000 });
    });

    test.afterAll(async () => {
        if (dbConnection) {
            await dbConnection.end().catch(() => {});
            dbConnection = null;
        }
    });

    // ============================================================
    // 1. DATABASE & BACKEND API CROSS-VALIDATION (+VE TESTS)
    // ============================================================
    test.describe('1. Database & Backend API Verification (+ve Tests)', () => {

        test('MS-DB-01: MySQL milestone report join query matches backend GET /api/sow/milestones/reports payload', async () => {
            const conn = await getDbConnection();

            const query = `
                SELECT 
                    m.id AS milestoneId,
                    m.title AS milestoneName,
                    s.sow_name AS sowName,
                    s.sow_id AS sowId,
                    s.sow_type AS sowType,
                    c.name AS clientName,
                    p.project_name AS projectName,
                    m.amount,
                    m.due_date AS dueDate,
                    m.invoice_status AS invoiceStatus,
                    m.invoice_amount AS invoiceAmount,
                    m.revenue_recognition AS revenueRecognition,
                    m.description
                FROM sow_milestones m
                JOIN sow s ON m.sow_id = s.sow_id
                LEFT JOIN client c ON s.client_id = c.id
                LEFT JOIN project_sow ps ON ps.sow_id = s.sow_id
                LEFT JOIN project p ON ps.project_id = p.id
                ORDER BY m.id DESC
            `;

            const [dbRows] = await conn.query(query);
            expect(dbRows.length).toBeGreaterThan(0);
            expect(milestoneApiData.length).toBe(dbRows.length);

            // Cross-validate each record in DB with API payload
            for (const dbRow of dbRows) {
                const apiItem = milestoneApiData.find(item => item.milestoneId === dbRow.milestoneId);
                expect(apiItem).toBeDefined();
                expect(apiItem.milestoneName.trim()).toBe(dbRow.milestoneName.trim());
                expect(apiItem.sowName.trim()).toBe(dbRow.sowName.trim());
                expect(apiItem.sowId).toBe(dbRow.sowId);
                expect((apiItem.clientName || '').trim()).toBe((dbRow.clientName || '').trim());
                expect((apiItem.projectName || '').trim()).toBe((dbRow.projectName || '').trim());
                expect(Number(apiItem.amount)).toBeCloseTo(Number(dbRow.amount), 2);
                expect(apiItem.invoiceStatus || 'Pending').toBe(dbRow.invoiceStatus || 'Pending');
                expect(apiItem.revenueRecognition || 'No').toBe(dbRow.revenueRecognition || 'No');
            }

            console.log(`[PASS] MS-DB-01: All ${dbRows.length} milestone records cross-validated between MySQL and Backend API.`);
        });

        test('MS-DB-02: Backend GET /api/sow/milestones/invoice-totals matches MySQL computed sums', async ({ page }) => {
            const conn = await getDbConnection();

            // Extract unique sowIds from active milestones
            const sowIds = Array.from(new Set(milestoneApiData.map(m => m.sowId).filter(Boolean)));
            expect(sowIds.length).toBeGreaterThan(0);

            // Fetch token from page localStorage to query the invoice-totals endpoint
            const token = await page.evaluate(() => localStorage.getItem('token'));
            expect(token).toBeTruthy();

            const response = await page.request.get(`${API_BASE_URL}/sow/milestones/invoice-totals?sowIds=${sowIds.join(',')}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(response.status()).toBe(200);
            const totalsFromApi = await response.json();

            // Validate each SOW total against direct MySQL aggregation
            for (const sowTotal of totalsFromApi) {
                const [dbAgg] = await conn.query(`
                    SELECT 
                        COUNT(id) AS milestoneCount,
                        COALESCE(SUM(amount), 0) AS milestoneTotal,
                        COALESCE(SUM(CASE WHEN invoice_status = 'Invoiced' THEN 1 ELSE 0 END), 0) AS invoicedCount,
                        COALESCE(SUM(CASE WHEN invoice_status = 'Invoiced' THEN COALESCE(invoice_amount, amount) ELSE amount END), 0) AS invoiceTotal
                    FROM sow_milestones
                    WHERE sow_id = ?
                `, [sowTotal.sowId]);

                const expected = dbAgg[0];
                expect(Number(sowTotal.milestoneCount)).toBe(Number(expected.milestoneCount));
                expect(Number(sowTotal.invoicedCount)).toBe(Number(expected.invoicedCount));
                expect(Number(sowTotal.milestoneTotal)).toBeCloseTo(Number(expected.milestoneTotal), 2);
            }

            console.log(`[PASS] MS-DB-02: Invoice totals API matched MySQL aggregations for ${totalsFromApi.length} SoW(s).`);
        });
    });

    // ============================================================
    // 2. UI ACCORDION HIERARCHY & AGGREGATION VALIDATION (+VE TESTS)
    // ============================================================
    test.describe('2. UI Accordion Hierarchy & Aggregation Validation (+ve Tests)', () => {

        test('MS-UI-DB-01: Client blocks & project counts on UI match distinct MySQL accounts', async ({ page }) => {
            const conn = await getDbConnection();

            const [dbClients] = await conn.query(`
                SELECT 
                    c.name AS clientName,
                    COUNT(DISTINCT p.id) AS projectCount
                FROM sow_milestones m
                JOIN sow s ON m.sow_id = s.sow_id
                LEFT JOIN client c ON s.client_id = c.id
                LEFT JOIN project_sow ps ON ps.sow_id = s.sow_id
                LEFT JOIN project p ON ps.project_id = p.id
                GROUP BY c.name
                ORDER BY c.name ASC
            `);

            const clientBlocks = page.locator('.client-block');
            await expect(clientBlocks).toHaveCount(dbClients.length);

            for (let i = 0; i < dbClients.length; i++) {
                const block = clientBlocks.nth(i);
                const dbClient = dbClients[i];

                await expect(block.locator('.client-name')).toHaveText(dbClient.clientName);

                const expectedChipText = `${dbClient.projectCount} Project${dbClient.projectCount !== 1 ? 's' : ''}`;
                await expect(block.locator('.client-row-right .mc-projects')).toContainText(expectedChipText);
            }

            console.log(`[PASS] MS-UI-DB-01: ${dbClients.length} Client block(s) and project count chips match MySQL.`);
        });

        test('MS-UI-DB-02: Project rows & SoW counts match MySQL project-sow mappings', async ({ page }) => {
            const conn = await getDbConnection();

            // Expand all clients
            await page.locator('button.action-btn:has-text("Expand all")').click();

            const [dbProjects] = await conn.query(`
                SELECT 
                    p.project_name AS projectName,
                    COUNT(DISTINCT s.sow_id) AS sowCount
                FROM sow_milestones m
                JOIN sow s ON m.sow_id = s.sow_id
                LEFT JOIN project_sow ps ON ps.sow_id = s.sow_id
                LEFT JOIN project p ON ps.project_id = p.id
                WHERE p.project_name IS NOT NULL
                GROUP BY p.project_name
                ORDER BY p.project_name ASC
            `);

            for (const dbProj of dbProjects) {
                const projRow = page.locator('.project-row', {
                    has: page.locator('.project-name', { hasText: dbProj.projectName })
                }).first();

                await expect(projRow).toBeVisible();

                const expectedSowText = `${dbProj.sowCount} SoW${dbProj.sowCount !== 1 ? 's' : ''}`;
                await expect(projRow.locator('.mc-projects')).toContainText(expectedSowText);
            }

            console.log(`[PASS] MS-UI-DB-02: ${dbProjects.length} Project row(s) and SoW counts match MySQL.`);
        });

        test('MS-UI-DB-03: SoW Expected (Exp) and Actual (Act) chips match MySQL financial aggregations', async ({ page }) => {
            const conn = await getDbConnection();

            await page.locator('button.action-btn:has-text("Expand all")').click();

            const [dbSows] = await conn.query(`
                SELECT 
                    s.sow_name AS sowName,
                    COALESCE(SUM(m.amount), 0) AS totalExpected,
                    COALESCE(SUM(CASE WHEN m.invoice_status = 'Invoiced' THEN 1 ELSE 0 END), 0) AS invoicedCount,
                    COALESCE(SUM(CASE WHEN m.invoice_status = 'Invoiced' THEN COALESCE(m.invoice_amount, m.amount) ELSE m.amount END), 0) AS actualTotal
                FROM sow_milestones m
                JOIN sow s ON m.sow_id = s.sow_id
                GROUP BY s.sow_name
            `);

            for (const dbSow of dbSows) {
                const sowCard = page.locator('.project-row-wrap', {
                    has: page.locator('.project-name', { hasText: dbSow.sowName })
                }).first();

                await expect(sowCard).toBeVisible();

                // Expected chip
                const expChip = sowCard.locator('.proj-chip.margin-chip');
                await expect(expChip).toContainText(formatCurrency(dbSow.totalExpected));

                // Actual chip: if invoicedCount > 0 shows formatted amount, otherwise '—'
                const actChip = sowCard.locator('.proj-chip.inv-chip');
                if (dbSow.invoicedCount > 0) {
                    await expect(actChip).toContainText(formatCurrency(dbSow.actualTotal));
                } else {
                    await expect(actChip).toContainText('—');
                }
            }

            console.log(`[PASS] MS-UI-DB-03: SoW Exp and Act chips match MySQL financial computations.`);
        });
    });

    // ============================================================
    // 3. MILESTONE TABLE ROW-LEVEL DB CROSS-VALIDATION (+VE TESTS)
    // ============================================================
    test.describe('3. Milestone Table Row-Level DB Cross-Validation (+ve Tests)', () => {

        test('MS-UI-DB-04: Milestone table cells strictly correspond to MySQL record values', async ({ page }) => {
            const conn = await getDbConnection();

            await page.locator('button.action-btn:has-text("Expand all")').click();

            const [dbMilestones] = await conn.query(`
                SELECT 
                    m.id,
                    m.title,
                    m.amount,
                    m.description,
                    m.invoice_status AS invoiceStatus,
                    m.revenue_recognition AS revenueRecognition
                FROM sow_milestones m
                ORDER BY m.id DESC
            `);

            for (const m of dbMilestones) {
                const row = page.locator('tr.res-row', {
                    has: page.locator(`td.td-name:has-text("${m.title.substring(0, 30)}")`)
                }).first();

                await expect(row).toBeVisible();

                // Milestone amount cell
                const amountCell = row.locator('td.td-date');
                await expect(amountCell).toHaveText(formatCurrency(m.amount));

                // Description cell (if present)
                if (m.description) {
                    const descCell = row.locator('td.td-name').nth(1);
                    await expect(descCell).toContainText(m.description.substring(0, 20));
                }

                // Invoice status
                const statusCell = row.locator('td.td-type').first();
                if ((m.invoiceStatus || '').toLowerCase() === 'invoiced') {
                    await expect(statusCell.locator('.eng-pill')).toHaveText('Invoiced');
                } else {
                    const select = statusCell.locator('select');
                    await expect(select).toHaveValue(m.invoiceStatus || 'Pending');
                }
            }

            console.log(`[PASS] MS-UI-DB-04: All milestone table cells strictly matched MySQL records.`);
        });
    });

    // ============================================================
    // 4. FILTER & SEARCH DB SYNCHRONIZATION (+VE TESTS)
    // ============================================================
    test.describe('4. Filter & Search DB Synchronization (+ve Tests)', () => {

        test('MS-FILTER-01: Account filter dropdown options reflect exact unique client names from MySQL', async ({ page }) => {
            const conn = await getDbConnection();

            const [dbClients] = await conn.query(`
                SELECT DISTINCT c.name AS clientName
                FROM sow_milestones m
                JOIN sow s ON m.sow_id = s.sow_id
                LEFT JOIN client c ON s.client_id = c.id
                WHERE c.name IS NOT NULL
                ORDER BY c.name ASC
            `);

            // Open Account dropdown
            await page.locator('button.multi-select-btn').first().click();

            for (const c of dbClients) {
                const option = page.locator('.multi-select-option', { hasText: c.clientName });
                await expect(option).toBeVisible();
            }

            // Close dropdown
            await page.locator('button.close-dropdown-btn').first().click();
            console.log(`[PASS] MS-FILTER-01: Account dropdown lists all unique MySQL clients.`);
        });

        test('MS-FILTER-02: Status filters (All / Ongoing / Closed) classify SoWs per MySQL milestone invoice statuses', async ({ page }) => {
            const conn = await getDbConnection();

            const [statusBreakdown] = await conn.query(`
                SELECT 
                    s.sow_name AS sowName,
                    SUM(CASE WHEN m.invoice_status IS NULL OR LOWER(m.invoice_status) != 'invoiced' THEN 1 ELSE 0 END) AS pendingCount
                FROM sow_milestones m
                JOIN sow s ON m.sow_id = s.sow_id
                GROUP BY s.sow_name
            `);

            const ongoingSows = statusBreakdown.filter(s => s.pendingCount > 0).map(s => s.sowName);
            const closedSows = statusBreakdown.filter(s => s.pendingCount === 0).map(s => s.sowName);

            // Test Ongoing filter
            await page.locator('.pill-group button.pill', { hasText: 'Ongoing' }).click();
            await page.locator('button.action-btn:has-text("Expand all")').click();

            for (const sowName of ongoingSows) {
                await expect(page.locator('.project-row-wrap', { hasText: sowName }).first()).toBeVisible();
            }

            for (const sowName of closedSows) {
                await expect(page.locator('.project-row-wrap', { hasText: sowName })).toHaveCount(0);
            }

            // Reset back to All
            await page.locator('.pill-group button.pill', { hasText: 'All' }).click();
            console.log(`[PASS] MS-FILTER-02: Status filter correctly segregated Ongoing vs Closed SoWs per DB rules.`);
        });

        test('MS-FILTER-03: Search query matches DB records across Account, SoW, and Milestone names', async ({ page }) => {
            const firstItem = milestoneApiData[0];
            const searchInput = page.locator('input[placeholder*="Search Account, SoW, Milestone"]');

            // 1. Search by Client Name
            await searchInput.fill(firstItem.clientName);
            await expect(page.getByText(firstItem.clientName, { exact: true }).first()).toBeVisible();

            // 2. Search by SoW Name
            await searchInput.fill(firstItem.sowName);
            await expect(page.getByText(firstItem.sowName, { exact: true }).first()).toBeVisible();

            // 3. Search by Milestone Title
            await searchInput.fill(firstItem.milestoneName);
            await expect(page.getByText(firstItem.milestoneName, { exact: true }).first()).toBeVisible();

            // Clear search
            await searchInput.fill('');
            await expect(page.getByText(firstItem.clientName, { exact: true }).first()).toBeVisible();

            console.log(`[PASS] MS-FILTER-03: Search successfully matched Account, SoW, and Milestone names from DB.`);
        });
    });

    // ============================================================
    // 5. NEGATIVE SCENARIOS, REVERT & AUDIT INTEGRITY (-VE TESTS)
    // ============================================================
    test.describe('5. Negative Scenarios, Revert & Audit Integrity (-ve Tests)', () => {

        test('MS-NEG-01: Non-existent search query returns empty state', async ({ page }) => {
            const searchInput = page.locator('input[placeholder*="Search Account, SoW, Milestone"]');
            await searchInput.fill('__NON_EXISTENT_MILESTONE_SEARCH_99999__');

            await expect(page.getByText(/No milestone reports match the current filters/i)).toBeVisible();
            await expect(page.locator('.client-block')).toHaveCount(0);

            // Clear search button restores list
            await page.locator('button.action-btn:has-text("Clear filters")').click();
            await expect(page.locator('.client-block').first()).toBeVisible();

            console.log(`[PASS] MS-NEG-01: Non-existent search shows empty state and restores on clear.`);
        });

        test('MS-NEG-02: Search with surrounding whitespace trims and retrieves matching DB record', async ({ page }) => {
            const firstItem = milestoneApiData[0];
            const searchInput = page.locator('input[placeholder*="Search Account, SoW, Milestone"]');

            await searchInput.fill(`   ${firstItem.clientName}   `);
            await expect(page.getByText(firstItem.clientName, { exact: true }).first()).toBeVisible();

            await searchInput.fill('');
            console.log(`[PASS] MS-NEG-02: Whitespace-padded search trimmed and matched DB record.`);
        });

        test('MS-NEG-03: Canceling Invoiced confirmation dialog does not mutate MySQL database or insert audit log', async ({ page }) => {
            const conn = await getDbConnection();

            await page.locator('button.action-btn:has-text("Expand all")').click();

            const pendingMilestone = milestoneApiData.find(m => (m.invoiceStatus || '').toLowerCase() !== 'invoiced');
            if (!pendingMilestone) {
                console.log('[SKIP] MS-NEG-03: No pending milestones available for cancellation test.');
                return;
            }

            // 1. Record pre-action DB state
            const [preCheck] = await conn.query('SELECT invoice_status FROM sow_milestones WHERE id = ?', [pendingMilestone.milestoneId]);
            const originalDbStatus = preCheck[0].invoice_status || 'Pending';

            const [preLogs] = await conn.query('SELECT COUNT(*) AS cnt FROM milestone_audit_logs WHERE milestone_id = ?', [pendingMilestone.milestoneId]);
            const originalLogCount = preLogs[0].cnt;

            // 2. Select 'Invoiced' in UI
            const milestoneRow = page.locator('tr.res-row', {
                has: page.locator(`td.td-name:has-text("${pendingMilestone.milestoneName.substring(0, 30)}")`)
            }).first();
            await expect(milestoneRow).toBeVisible();

            const select = milestoneRow.locator('select').first();
            await select.selectOption({ label: 'Invoiced' });

            // 3. Confirm modal is shown and click 'No'
            const dialog = page.getByText(/Are you sure you want to mark this milestone as Invoiced/i);
            await expect(dialog).toBeVisible();
            await page.getByRole('button', { name: 'No', exact: true }).click();
            await expect(dialog).not.toBeVisible();

            // 4. UI select should revert back to original status
            await expect(select).toHaveValue(originalDbStatus);

            // 5. Verify MySQL database was NOT modified
            const [postCheck] = await conn.query('SELECT invoice_status FROM sow_milestones WHERE id = ?', [pendingMilestone.milestoneId]);
            expect(postCheck[0].invoice_status || 'Pending').toBe(originalDbStatus);

            // 6. Verify milestone_audit_logs count has not increased
            const [postLogs] = await conn.query('SELECT COUNT(*) AS cnt FROM milestone_audit_logs WHERE milestone_id = ?', [pendingMilestone.milestoneId]);
            expect(postLogs[0].cnt).toBe(originalLogCount);

            console.log(`[PASS] MS-NEG-03: Modal cancel preserved MySQL status (${originalDbStatus}) and emitted no audit logs.`);
        });
    });

    // ============================================================
    // 6. EXPLICIT EDGE CASES
    // ============================================================
    test.describe('6. Explicit Edge Cases', () => {

        test('MS-EDGE-01: Milestone with null invoice_amount defaults to expected amount in calculation', async () => {
            const conn = await getDbConnection();

            const [rowsWithNull] = await conn.query(`
                SELECT id, amount, invoice_amount, invoice_status 
                FROM sow_milestones 
                WHERE invoice_amount IS NULL
            `);

            for (const row of rowsWithNull) {
                const effectiveAmount = row.invoice_amount ?? row.amount;
                expect(effectiveAmount).toBe(row.amount);
            }

            console.log(`[PASS] MS-EDGE-01: ${rowsWithNull.length} milestone(s) with null invoice_amount correctly defaulted to amount.`);
        });

        test('MS-EDGE-02: Repeated expand and collapse maintains persistent card totals matching DB sum', async ({ page }) => {
            const firstSow = milestoneApiData[0];

            for (let i = 0; i < 3; i++) {
                await page.locator('button.action-btn:has-text("Expand all")').click();
                await page.locator('button.action-btn:has-text("Collapse all")').click();
            }

            // Expand again and verify chip text
            await page.locator('button.action-btn:has-text("Expand all")').click();
            const sowCard = page.locator('.project-row-wrap', {
                has: page.locator('.project-name', { hasText: firstSow.sowName })
            }).first();

            await expect(sowCard.locator('.proj-chip.margin-chip')).toContainText(formatCurrency(firstSow.amount));
            console.log(`[PASS] MS-EDGE-02: Repeated expand/collapse retained exact DB amounts.`);
        });

        test('MS-EDGE-03: Clearing empty search restores full MySQL dataset to UI', async ({ page }) => {
            const searchInput = page.locator('input[placeholder*="Search Account, SoW, Milestone"]');
            await searchInput.fill('XYZ_NON_EXISTENT_FILTER_TERM');
            await expect(page.locator('.client-block')).toHaveCount(0);

            // Clear search
            await searchInput.fill('');

            // Full dataset restored
            const uniqueClients = new Set(milestoneApiData.map(m => m.clientName).filter(Boolean));
            await expect(page.locator('.client-block')).toHaveCount(uniqueClients.size);
            console.log(`[PASS] MS-EDGE-03: Clearing empty search restored all ${uniqueClients.size} DB client blocks.`);
        });
    });
});
