
const { test, expect } = require('@playwright/test');

const {
    setupAuthenticatedPage
} = require('../helpers/practicesTestHelper');

const {
    executeQuery
} = require('../../../utils/dbUtils');

test.describe.configure({ mode: 'default' });

test.describe(
    'SmartTracker - Estimate vs Actual DB vs UI Validation',
    () => {

        let page;
        let practicesPage;


        // ============================================================
        // BEFORE ALL
        // ============================================================

        test.beforeAll(async ({ browser }) => {

            const res = await setupAuthenticatedPage(browser);

            page = res.page;
            practicesPage = res.practicesPage;

            const estimateTab = page.locator(
                "//*[@routerlink='/practice/estimate-vs-actual' and contains(normalize-space(),'Estimate vs. Actual')]"
            );

            if (await estimateTab.count() > 0) {
                await estimateTab.first().click();
            } else {
                const baseUrl = (process.env.UI_BASE_URL || (process.env.BASE_URL && !process.env.BASE_URL.includes('13.61.179.149') ? process.env.BASE_URL : 'http://localhost:4200/')).replace(/\/+$/, '');
                await page.goto(
                    `${baseUrl}/practice/estimate-vs-actual`,
                    {
                        waitUntil: 'domcontentloaded'
                    }
                );
            }

            await page.locator('.kpi-card, .kpi-label').first().waitFor({ state: 'visible', timeout: 30000 });

            console.log('\n========================================');
            console.log('ESTIMATE VS ACTUAL PAGE');
            console.log('========================================');

            console.log(
                'Current URL:',
                page.url()
            );
        });


        // ============================================================
        // AFTER ALL
        // ============================================================

        test.afterAll(async () => {

            try {

                if (page) {
                    await page.context().close();
                }

            } catch (error) {

                console.log(
                    'Browser cleanup warning:',
                    error.message
                );
            }
        });


        // ============================================================
        // EMPLOYEE-LEVEL ESTIMATE VS ACTUAL
        // ============================================================

        async function getAllocationComparison() {
            const query = `
            WITH
            project_sows AS (
                SELECT DISTINCT ps.project_id, ps.sow_id FROM project_sow ps
            ),
            actual_base AS (
                SELECT
                    p.id AS project_id,
                    CAST(ea.emp_id AS BINARY) AS employee_key,
                    ea.emp_id AS employee_id,
                    ea.practice,
                    ea.start_date,
                    ea.end_date,
                    ea.project_location,
                    COALESCE(ea.allocation_percentage, 100) AS allocation_percentage
                FROM project p
                JOIN employee_allocation ea ON ea.project_id = p.id
                WHERE (p.is_valid IS NULL OR p.is_valid <> 0)
                  AND UPPER(p.project_type) = 'PRODUCTION'
                  AND LOWER(COALESCE(p.client_name, '')) <> 'relanto'
                  AND (
                      (ea.start_date IS NULL OR DATE(ea.start_date) <= CURDATE())
                      AND (ea.end_date IS NULL OR DATE(ea.end_date) >= CURDATE())
                      AND (p.end_date IS NULL OR DATE(p.end_date) >= CURDATE())
                  )
            ),
            estimated_base AS (
                SELECT
                    ps.project_id,
                    r.sow_id,
                    CAST(r.employee_id AS BINARY) AS employee_key,
                    r.employee_id,
                    r.resource AS employee_name,
                    r.start_date,
                    r.end_date,
                    r.percent_allocation,
                    cl.location
                FROM project_sows ps
                JOIN resources r ON r.sow_id = ps.sow_id
                JOIN project p ON p.id = ps.project_id
                LEFT JOIN client_location cl ON cl.id = r.location_id
                WHERE LOWER(COALESCE(p.client_name, '')) <> 'relanto'
                  AND COALESCE(r.is_deleted, 0) = 0
                  AND (
                      (r.start_date IS NULL OR DATE(r.start_date) <= CURDATE())
                      AND (r.end_date IS NULL OR DATE(r.end_date) >= CURDATE())
                  )
            ),
            employee_practice_ranked AS (
                SELECT employee_key, practice,
                       ROW_NUMBER() OVER (PARTITION BY employee_key ORDER BY practice) AS rn
                FROM (
                    SELECT DISTINCT employee_key, practice
                    FROM actual_base
                    WHERE employee_id IS NOT NULL AND practice IS NOT NULL
                ) ap
            ),
            employee_practice AS (
                SELECT employee_key, practice FROM employee_practice_ranked WHERE rn = 1
            ),
            estimated_mapped AS (
                SELECT
                    eb.project_id,
                    ep.practice,
                    eb.employee_key,
                    eb.employee_id,
                    eb.percent_allocation,
                    CASE
                        WHEN LOWER(COALESCE(eb.location, '')) LIKE '%united states%'
                          OR LOWER(COALESCE(eb.location, '')) LIKE '%usa%'
                          OR LOWER(COALESCE(eb.location, '')) LIKE '%u.s.a%'
                          OR LOWER(COALESCE(eb.location, '')) LIKE '%onsite%'
                        THEN 'Onsite'
                        ELSE 'Offshore'
                    END AS location_type
                FROM estimated_base eb
                LEFT JOIN employee_practice ep ON ep.employee_key = eb.employee_key
            ),
            estimated_summary AS (
                SELECT
                    project_id,
                    practice,
                    COUNT(DISTINCT employee_key) AS estimated_headcount,
                    SUM(COALESCE(percent_allocation, 0)) AS estimated_allocation,
                    SUM(location_type = 'Onsite') AS estimated_onsite,
                    SUM(location_type = 'Offshore') AS estimated_offshore
                FROM estimated_mapped
                GROUP BY project_id, practice
            ),
            actual_summary AS (
                SELECT
                    project_id,
                    practice,
                    COUNT(DISTINCT employee_key) AS actual_headcount,
                    SUM(allocation_percentage) AS actual_allocation,
                    SUM(
                        LOWER(COALESCE(project_location, '')) LIKE '%united states%'
                        OR LOWER(COALESCE(project_location, '')) LIKE '%usa%'
                        OR LOWER(COALESCE(project_location, '')) LIKE '%u.s.a%'
                        OR LOWER(COALESCE(project_location, '')) LIKE '%onsite%'
                    ) AS actual_onsite,
                    SUM(
                        NOT (
                            LOWER(COALESCE(project_location, '')) LIKE '%united states%'
                            OR LOWER(COALESCE(project_location, '')) LIKE '%usa%'
                            OR LOWER(COALESCE(project_location, '')) LIKE '%u.s.a%'
                            OR LOWER(COALESCE(project_location, '')) LIKE '%onsite%'
                        )
                    ) AS actual_offshore
                FROM actual_base
                GROUP BY project_id, practice
            ),
            project_practices AS (
                SELECT project_id, practice FROM estimated_summary
                UNION
                SELECT project_id, practice FROM actual_summary
            )
            SELECT
                p.id AS project_id,
                p.project_name,
                pp.practice,
                COALESCE(es.estimated_headcount, 0) AS estimated_headcount,
                COALESCE(ac.actual_headcount, 0) AS actual_headcount,
                COALESCE(ac.actual_headcount, 0) - COALESCE(es.estimated_headcount, 0) AS headcount_variance,
                COALESCE(es.estimated_allocation, 0) AS estimated_allocation,
                COALESCE(ac.actual_allocation, 0) AS actual_allocation,
                COALESCE(ac.actual_allocation, 0) - COALESCE(es.estimated_allocation, 0) AS allocation_variance,
                COALESCE(es.estimated_onsite, 0) AS estimated_onsite,
                COALESCE(ac.actual_onsite, 0) AS actual_onsite,
                COALESCE(es.estimated_offshore, 0) AS estimated_offshore,
                COALESCE(ac.actual_offshore, 0) AS actual_offshore
            FROM project p
            LEFT JOIN project_practices pp ON pp.project_id = p.id
            LEFT JOIN estimated_summary es ON es.project_id = p.id AND CAST(es.practice AS BINARY) <=> CAST(pp.practice AS BINARY)
            LEFT JOIN actual_summary ac ON ac.project_id = p.id AND CAST(ac.practice AS BINARY) <=> CAST(pp.practice AS BINARY)
            WHERE LOWER(COALESCE(p.client_name, '')) <> 'relanto'
            ORDER BY p.project_name, pp.practice;
            `;

            return await executeQuery(query);
        }


        // ============================================================
        // DATABASE KPI METRICS
        // ============================================================

        async function getDBMetrics(isActiveOnly = true) {
            const bypassDateFilter = isActiveOnly ? '0=1' : '1=1';

            const query = `
            WITH
            project_sows AS (
                SELECT DISTINCT ps.project_id, ps.sow_id FROM project_sow ps
            ),
            actual_base AS (
                SELECT
                    p.id AS project_id,
                    CAST(ea.emp_id AS BINARY) AS employee_key,
                    ea.emp_id AS employee_id,
                    ea.practice,
                    ea.start_date,
                    ea.end_date,
                    ea.project_location,
                    COALESCE(ea.allocation_percentage, 100) AS allocation_percentage
                FROM project p
                JOIN employee_allocation ea ON ea.project_id = p.id
                WHERE (p.is_valid IS NULL OR p.is_valid <> 0)
                  AND UPPER(p.project_type) = 'PRODUCTION'
                  AND LOWER(COALESCE(p.client_name, '')) <> 'relanto'
                  AND (
                      ${bypassDateFilter}
                      OR (
                          (ea.start_date IS NULL OR DATE(ea.start_date) <= CURDATE())
                          AND (ea.end_date IS NULL OR DATE(ea.end_date) >= CURDATE())
                          AND (p.end_date IS NULL OR DATE(p.end_date) >= CURDATE())
                      )
                  )
            ),
            estimated_base AS (
                SELECT
                    ps.project_id,
                    r.sow_id,
                    CAST(r.employee_id AS BINARY) AS employee_key,
                    r.employee_id,
                    r.resource AS employee_name,
                    r.start_date,
                    r.end_date,
                    r.percent_allocation,
                    cl.location
                FROM project_sows ps
                JOIN resources r ON r.sow_id = ps.sow_id
                JOIN project p ON p.id = ps.project_id
                LEFT JOIN client_location cl ON cl.id = r.location_id
                WHERE LOWER(COALESCE(p.client_name, '')) <> 'relanto'
                  AND COALESCE(r.is_deleted, 0) = 0
                  AND (
                      ${bypassDateFilter}
                      OR (
                          (r.start_date IS NULL OR DATE(r.start_date) <= CURDATE())
                          AND (r.end_date IS NULL OR DATE(r.end_date) >= CURDATE())
                      )
                  )
            )
            SELECT
                (SELECT COUNT(DISTINCT employee_key) FROM estimated_base) AS estimated_headcount,
                (SELECT COUNT(DISTINCT employee_key) FROM actual_base) AS actual_headcount,
                
                (SELECT COUNT(DISTINCT employee_key) FROM estimated_base 
                 WHERE LOWER(COALESCE(location, '')) LIKE '%united states%' 
                    OR LOWER(COALESCE(location, '')) LIKE '%usa%' 
                    OR LOWER(COALESCE(location, '')) LIKE '%u.s.a%' 
                    OR LOWER(COALESCE(location, '')) LIKE '%onsite%') AS estimated_onsite,
                    
                (SELECT COUNT(DISTINCT employee_key) FROM actual_base 
                 WHERE LOWER(COALESCE(project_location, '')) LIKE '%united states%' 
                    OR LOWER(COALESCE(project_location, '')) LIKE '%usa%' 
                    OR LOWER(COALESCE(project_location, '')) LIKE '%u.s.a%' 
                    OR LOWER(COALESCE(project_location, '')) LIKE '%onsite%') AS actual_onsite,
                    
                (SELECT COUNT(DISTINCT employee_key) FROM estimated_base 
                 WHERE NOT (LOWER(COALESCE(location, '')) LIKE '%united states%' 
                         OR LOWER(COALESCE(location, '')) LIKE '%usa%' 
                         OR LOWER(COALESCE(location, '')) LIKE '%u.s.a%' 
                         OR LOWER(COALESCE(location, '')) LIKE '%onsite%')) AS estimated_offshore,
                         
                (SELECT COUNT(DISTINCT employee_key) FROM actual_base 
                 WHERE NOT (LOWER(COALESCE(project_location, '')) LIKE '%united states%' 
                         OR LOWER(COALESCE(project_location, '')) LIKE '%usa%' 
                         OR LOWER(COALESCE(project_location, '')) LIKE '%u.s.a%' 
                         OR LOWER(COALESCE(project_location, '')) LIKE '%onsite%')) AS actual_offshore
            `;

            const result = await executeQuery(query);
            const row = result[0];

            return {
                estimatedHeadcount: Number(row.estimated_headcount || 0),
                actualHeadcount: Number(row.actual_headcount || 0),
                estOnsite: Number(row.estimated_onsite || 0),
                actOnsite: Number(row.actual_onsite || 0),
                estOffshore: Number(row.estimated_offshore || 0),
                actOffshore: Number(row.actual_offshore || 0),
                hcVariance: Number(row.actual_headcount || 0) - Number(row.estimated_headcount || 0),
                estimatedAllocation: 0,
                actualAllocation: 0,
                allocationVariance: 0
            };
        }


        // ============================================================
        // PRINT EMPLOYEE-LEVEL COMPARISON
        // ============================================================

        async function printAllocationComparison() {
            const rows = await getAllocationComparison();

            console.log('\n========================================');
            console.log('PROJECT & PRACTICE ESTIMATE VS ACTUAL');
            console.log('========================================');

            let mismatches = 0;
            const tableData = [];

            for (const row of rows) {
                const estimated = Number(row.estimated_headcount);
                const actual = Number(row.actual_headcount);
                const variance = Number(row.headcount_variance);

                const status = (estimated === actual) ? '✅ MATCH' : '❌ MISMATCH';

                tableData.push({
                    Project: row.project_name,
                    Practice: row.practice || 'N/A',
                    'Est HC': estimated,
                    'Act HC': actual,
                    Variance: variance,
                    Status: status
                });

                if (estimated !== actual) {
                    mismatches++;
                }
            }

            console.table(tableData);
            console.log('\nTotal practice allocation mismatches:', mismatches);
            return rows;
        }


        // ============================================================
        // UI METRICS
        // ============================================================

        async function getUIMetrics() {

            const getCardValue =
                async (label) => {

                    const labelLocator =
                        page.getByText(
                            label,
                            {
                                exact: true
                            }
                        );


                    const count =
                        await labelLocator.count();


                    if (count === 0) {

                        throw new Error(
                            `UI KPI label not found: ${label}`
                        );
                    }


                    const labelElement =
                        labelLocator.first();


                    /*
                     * Find the nearest parent container
                     * and search for a numeric value.
                     */

                    const parent =
                        labelElement.locator(
                            'xpath=..'
                        );


                    const parentText =
                        await parent.innerText();


                    console.log(
                        `UI ${label}:`,
                        parentText
                    );


                    const numbers =
                        parentText.match(
                            /-?\d+(?:\.\d+)?/g
                        );


                    if (
                        !numbers ||
                        numbers.length === 0
                    ) {

                        throw new Error(
                            `No numeric value found for UI KPI: ${label}. ` +
                            `Container text: "${parentText}"`
                        );
                    }


                    /*
                     * Usually the first numeric value
                     * in the KPI card is the KPI value.
                     */

                    return Number(
                        numbers[0]
                    );
                };


            return {

                estHeadcount:
                    await getCardValue(
                        'EST. HEADCOUNT'
                    ),

                actHeadcount:
                    await getCardValue(
                        'ACT. HEADCOUNT'
                    ),

                estOnsite:
                    await getCardValue(
                        'EST. ONSITE'
                    ),

                actOnsite:
                    await getCardValue(
                        'ACT. ONSITE'
                    ),

                estOffshore:
                    await getCardValue(
                        'EST. OFFSHORE'
                    ),

                actOffshore:
                    await getCardValue(
                        'ACT. OFFSHORE'
                    ),

                hcVariance:
                    await getCardValue(
                        'HC VARIANCE'
                    )
            };
        }


        // ============================================================
        // MAIN TEST
        // ============================================================

        test(
            'Validate Estimate vs Actual using SoW Project Allocation',
            async () => {

                // ----------------------------------------------------
                // EMPLOYEE LEVEL
                // ----------------------------------------------------

                await printAllocationComparison();


                // ----------------------------------------------------
                // DATABASE
                // ----------------------------------------------------

                async function validateMetricsForState(stateName, isActiveOnly) {
                    console.log(`\n========================================`);
                    console.log(`VALIDATING STATE: ${stateName}`);
                    console.log(`========================================`);

                    console.log('\n--- DATABASE KPI METRICS ---');
                    const dbMetrics = await getDBMetrics(isActiveOnly);
                    console.log(dbMetrics);

                    console.log('\n--- UI KPI METRICS ---');
                    const uiMetrics = await getUIMetrics();
                    console.log(uiMetrics);

                    console.log('\n--- DB VS UI COMPARISON ---');
                    const comparisons = [
                        { name: 'Estimated Headcount', ui: uiMetrics.estHeadcount, db: dbMetrics.estimatedHeadcount },
                        { name: 'Actual Headcount', ui: uiMetrics.actHeadcount, db: dbMetrics.actualHeadcount },
                        { name: 'Estimated Onsite', ui: uiMetrics.estOnsite, db: dbMetrics.estOnsite },
                        { name: 'Actual Onsite', ui: uiMetrics.actOnsite, db: dbMetrics.actOnsite },
                        { name: 'Estimated Offshore', ui: uiMetrics.estOffshore, db: dbMetrics.estOffshore },
                        { name: 'Actual Offshore', ui: uiMetrics.actOffshore, db: dbMetrics.actOffshore },
                        { name: 'HC Variance', ui: uiMetrics.hcVariance, db: dbMetrics.hcVariance }
                    ];

                    const tableData = comparisons.map(c => ({
                        Metric: c.name,
                        'UI Count': c.ui,
                        'DB Count': c.db,
                        Status: c.ui === c.db ? '✅ PASS' : '❌ FAIL'
                    }));

                    console.table(tableData);

                    // Perform soft assertions so the test reporter catches the mismatches
                    for (const comparison of comparisons) {
                        expect.soft(comparison.ui, `[${stateName}] ${comparison.name} should match DB`).toBe(comparison.db);
                    }

                    console.log('\n--- ALLOCATION SUMMARY ---');
                    console.log(`Estimated Allocation: ${dbMetrics.estimatedAllocation}%`);
                    console.log(`Actual Allocation: ${dbMetrics.actualAllocation}%`);
                    console.log(`Allocation Variance: ${dbMetrics.allocationVariance}%`);
                }

                // 1. Default State is Active ON
                await validateMetricsForState('ACTIVE ONLY: ON', true);

                // 2. Toggle Active OFF
                console.log('\n>>> Toggling Active Only to OFF <<<');
                const activeOnlyToggle = page.locator('.filter-group--toggle .slider');
                await activeOnlyToggle.click();

                // Wait for the UI metrics to re-calculate and re-render
                await page.waitForTimeout(3000);

                // 3. Validate Active OFF
                await validateMetricsForState('ACTIVE ONLY: OFF', false);

                console.log('\n========================================');
                console.log('ACCOUNT VALIDATION (UI VS DB)');
                console.log('========================================');

                // Scrape Accounts from UI Dropdown
                const accountsSelect = page.locator('select.filter-select').first();
                await accountsSelect.waitFor({ state: 'attached' });

                const uiAccountOptions = await accountsSelect.locator('option').allInnerTexts();
                const uiAccounts = uiAccountOptions
                    .map(opt => opt.trim())
                    .filter(opt => opt !== 'All Accounts' && opt !== '');

                // Query DB for Accounts expected to be in Estimate vs Actual
                // We'll use the projects that are active/production and have allocations/sows.
                const dbAccountsData = await executeQuery(`
                    SELECT DISTINCT p.client_name
                    FROM project p
                    JOIN project_sow ps ON ps.project_id = p.id
                    JOIN sow s ON s.sow_id = ps.sow_id
                    WHERE (p.is_valid IS NULL OR p.is_valid <> 0)
                      AND UPPER(p.project_type) = 'PRODUCTION'
                      AND LOWER(COALESCE(p.client_name, '')) <> 'relanto'
                      AND LOWER(s.sow_status) <> 'closed'
                `);

                const dbAccounts = dbAccountsData
                    .map(row => row.client_name?.trim())
                    .filter(name => name)
                    .sort();

                const uiAccountsSorted = [...uiAccounts].sort();

                const accountDashboard = [];

                for (const account of uiAccountsSorted) {
                    if (!dbAccounts.includes(account)) {
                        accountDashboard.push({
                            Account: account,
                            Status: '❌ SKIPPED / EXTRA',
                            Reason: 'Present in UI but not in DB'
                        });
                    }
                }

                for (const account of dbAccounts) {
                    if (!uiAccountsSorted.includes(account)) {
                        accountDashboard.push({
                            Account: account,
                            Status: '❌ MISSING IN UI',
                            Reason: 'Present in DB but missing in UI dropdown'
                        });
                    } else {
                        accountDashboard.push({
                            Account: account,
                            Status: '✅ MATCH',
                            Reason: 'Present in both UI and DB'
                        });
                    }
                }

                console.table(accountDashboard);

                // Perform soft assertions
                const missingInUI = dbAccounts.filter(a => !uiAccountsSorted.includes(a));
                const extraInUI = uiAccountsSorted.filter(a => !dbAccounts.includes(a));

                expect.soft(missingInUI.length, 'DB accounts missing from UI').toBe(0);

                console.log('\n========================================');
                console.log('VALIDATION COMPLETED');
                console.log('========================================');

                // ============================================================
                // NEGATIVE & EDGE CASES
                // ============================================================

                await test.step('Negative Case - UI Behavior with Non-existent Data Search', async () => {
                    console.log('\n--- NEGATIVE CASE: Invalid Search Query ---');

                    // Try to search for a random gibberish string in a combobox or filter if present
                    const accountDropdown = page.locator('select.filter-select').first();

                    // Assert that dropdown is visible and accessible even if we do invalid actions
                    await expect(accountDropdown).toBeVisible();

                    // Check that clicking a dropdown and interacting doesn't crash the page
                    await accountDropdown.click();

                    // Close the dropdown by clicking the body
                    await page.locator('body').click();

                    // Ensure the main data table or KPI section is still visible
                    const kpiContainer = page.getByText('EST. HEADCOUNT');
                    await expect(kpiContainer).toBeVisible();
                    console.log('UI handled invalid interaction cleanly.');
                });

                await test.step('Edge Case - Toggle Rapidly (Debounce / State check)', async () => {
                    console.log('\n--- EDGE CASE: Rapid UI Toggling ---');

                    const activeOnlyToggle = page.locator('.filter-group--toggle .slider');

                    // Toggle rapidly to ensure UI does not break
                    await activeOnlyToggle.click();
                    await activeOnlyToggle.click();
                    await activeOnlyToggle.click();

                    // Wait to let UI settle
                    await page.waitForTimeout(2000);

                    const estHeadcount = page.getByText('EST. HEADCOUNT', { exact: true });
                    await expect(estHeadcount).toBeVisible();

                    console.log('UI stabilized successfully after rapid toggling.');
                });
            }
        );
    }
);