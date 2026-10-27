const { test, expect } = require('@playwright/test');
const { executeQuery } = require('../../../utils/dbUtils');
const { PracticesPage } = require('../../../pages/PracticesPage');
const { setupAuthenticatedPage } = require('../../practices/helpers/practicesTestHelper');

const practices = [
    'Digital Transformation',
    'Data & AI',
    'Revenue and Sales',
    'Enterprise Business Planning',
    'IP & Solutions'
];

// DB query: detailed breakdown per practice (Total, Billable, Non-Billable, and all categories)
const breakdownQuery = `
WITH base_data AS (
    SELECT
        e.emp_id,
        a.is_billable,
        p.project_type
    FROM hrportal.employee_allocation AS a

    INNER JOIN hrportal.emp_details AS e
        ON a.emp_id = e.emp_id

    INNER JOIN hrportal.project AS p
        ON a.project_id = p.id

    WHERE
        a.practice = ?
        AND a.start_date <= CURDATE()
        AND (
            a.end_date IS NULL
            OR a.end_date >= CURDATE()
        )
        AND e.is_deleted = 0
),

summary AS (
    SELECT
        COUNT(DISTINCT emp_id)                                                      AS total_count,
        COUNT(DISTINCT CASE WHEN is_billable = 1 THEN emp_id END)                  AS billable_count,
        COUNT(DISTINCT CASE WHEN is_billable = 0 THEN emp_id END)                  AS non_billable_count,
        COUNT(DISTINCT CASE WHEN project_type = 'PRODUCTION' AND is_billable = 1 THEN emp_id END) AS production_count,
        COUNT(DISTINCT CASE WHEN project_type = 'PRODUCTION' AND is_billable = 0 THEN emp_id END) AS investment_count,
        COUNT(DISTINCT CASE WHEN project_type = 'BENCH'     THEN emp_id END)       AS bench_count,
        COUNT(DISTINCT CASE WHEN project_type = 'INTERNAL'  THEN emp_id END)       AS internal_count,
        COUNT(DISTINCT CASE WHEN project_type = 'LEAVE'     THEN emp_id END)       AS leave_count,
        COUNT(DISTINCT CASE WHEN project_type IN ('ON NOTICE', 'ONNOTICE') THEN emp_id END) AS on_notice_count,
        COUNT(DISTINCT CASE WHEN project_type = 'HOLD'      THEN emp_id END)       AS hold_count
    FROM base_data
)

SELECT 'Total'        AS project_type, total_count        AS employee_count FROM summary UNION ALL
SELECT 'Billable'     AS project_type, billable_count     AS employee_count FROM summary UNION ALL
SELECT 'Non-Billable' AS project_type, non_billable_count AS employee_count FROM summary UNION ALL
SELECT 'Production'   AS project_type, production_count   AS employee_count FROM summary UNION ALL
SELECT 'Investment'   AS project_type, investment_count   AS employee_count FROM summary UNION ALL
SELECT 'Bench'        AS project_type, bench_count        AS employee_count FROM summary UNION ALL
SELECT 'Internal'     AS project_type, internal_count     AS employee_count FROM summary UNION ALL
SELECT 'Leave'        AS project_type, leave_count        AS employee_count FROM summary UNION ALL
SELECT 'On Notice'    AS project_type, on_notice_count    AS employee_count FROM summary UNION ALL
SELECT 'Hold'         AS project_type, hold_count         AS employee_count FROM summary;
`;

// Collects all rows for the final summary table
const summaryResults = [];

test.describe('Practice Breakdown Validation: DB vs UI', () => {

    test.afterAll(() => {
        console.log('\n\n=======================================================');
        console.log('  FINAL SUMMARY: Detailed Practice Breakdown (DB vs UI)');
        console.log('=======================================================');
        console.table(summaryResults);
    });

    test('Validate detailed practice breakdown against DB', async ({ browser }) => {

        // -----------------------------------
        // 1. GLOBAL AUTH & PRACTICES PAGE
        // -----------------------------------
        const { page, practicesPage } = await setupAuthenticatedPage(browser);

        await practicesPage.productionBadge.waitFor({ state: 'visible' });
        await practicesPage.productionBadge.click();
        await page.waitForTimeout(2000);

        // -----------------------------------
        // 3. LOOP THROUGH EACH PRACTICE
        // -----------------------------------
        for (const practice of practices) {

            console.log(`\n\n========================================`);
            console.log(`  Practice: ${practice}`);
            console.log(`========================================`);

            // ---- DB: run breakdown query ----
            const dbRows = await executeQuery(breakdownQuery, [practice]);

            // Convert rows into a map: { 'Total': 89, 'Billable': 70, ... }
            const dbMap = {};
            for (const row of dbRows) {
                dbMap[row.project_type] = Number(row.employee_count);
            }
            console.log('DB Breakdown:', dbMap);

            // ---- UI: locate the practice card ----
            const card = page.locator('.ph-pcard').filter({
                has: page.locator('.ph-pcard-title', { hasText: practice })
            }).first();

            const cardVisible = await card.isVisible({ timeout: 5000 }).catch(() => false);
            if (!cardVisible) {
                console.log(`Warning: Card for '${practice}' not found in UI.`);
                // Record all as 'N/A' and continue
                for (const label of Object.keys(dbMap)) {
                    summaryResults.push({ Practice: practice, Metric: label, 'DB Count': dbMap[label], 'UI Count': 'N/A', Status: 'WARN ⚠️' });
                }
                continue;
            }

            // UI locators based on PracticesPage.js patterns
            const uiMap = {};

            // Row values: Production, Investment, Bench, Internal, Leave, Notice, Hold
            const rowLabels = ['Production', 'Investment', 'Bench', 'Internal', 'Leave', 'Notice', 'Hold'];
            // Map UI label 'Notice' to DB label 'On Notice'
            const uiToDbLabel = { 'Notice': 'On Notice' };

            for (const label of rowLabels) {
                const rowLocator = card.locator(
                    `xpath=.//div[contains(@class,'ph-pcard-row')][.//span[normalize-space()='${label}']]//span[2]`
                );
                const rowVisible = await rowLocator.isVisible({ timeout: 3000 }).catch(() => false);
                const text = rowVisible ? await rowLocator.innerText().catch(() => '0') : '0';
                const dbLabel = uiToDbLabel[label] || label;
                uiMap[dbLabel] = parseInt(text.trim(), 10) || 0;
            }

            // Billable badge
            const billableLocator = card.locator(
                `xpath=.//div[contains(@class,'ph-pcard-badge--billable')]//span[contains(@class,'ph-badge-num')]`
            );
            const billableText = await billableLocator.first().innerText().catch(() => '0');
            uiMap['Billable'] = parseInt(billableText.trim(), 10) || 0;

            // Non-Billable badge
            const nonBillableLocator = card.locator(
                `xpath=.//div[contains(@class,'ph-pcard-badge--nonbillable')]//span[contains(@class,'ph-badge-num')]`
            );
            const nonBillableText = await nonBillableLocator.first().innerText().catch(() => '0');
            uiMap['Non-Billable'] = parseInt(nonBillableText.trim(), 10) || 0;

            // Total = Billable + Non-Billable
            uiMap['Total'] = uiMap['Billable'] + uiMap['Non-Billable'];

            console.log('UI Breakdown:', uiMap);

            // ---- Compare each metric ----
            const metrics = ['Total', 'Billable', 'Non-Billable', 'Production', 'Investment', 'Bench', 'Internal', 'Leave', 'On Notice', 'Hold'];

            for (const metric of metrics) {
                const dbVal = dbMap[metric] ?? 0;
                const uiVal = uiMap[metric] ?? 0;
                const status = dbVal === uiVal ? 'PASS ✅' : 'FAIL ❌';

                summaryResults.push({
                    'Practice': practice,
                    'Metric': metric,
                    'DB Count': dbVal,
                    'UI Count': uiVal,
                    'Status': status
                });

                // Soft assert so all practices/metrics are always checked
                expect.soft(uiVal, `[${practice}] "${metric}": DB=${dbVal}, UI=${uiVal}`).toBe(dbVal);
            }
        }

        if (page) await page.context().close();
    });
});

