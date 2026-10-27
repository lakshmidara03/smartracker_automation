const { test, expect } = require('@playwright/test');
const { executeQuery } = require('../../../utils/dbUtils');
const { PracticesPage } = require('../../../pages/PracticesPage');
const { LoginPage } = require('../../../pages/LoginPage');
const { setupAuthenticatedPage } = require('../../practices/helpers/practicesTestHelper');

const resourceCategories = [
    'PRODUCTION',
    'INVESTMENT',
    'BENCH',
    'LEAVE',
    'HOLD',
    'ON NOTICE',
    'INTERNAL'
];

const uiLabelMap = {
    'PRODUCTION': 'Production',
    'INVESTMENT': 'Investment',
    'BENCH': 'Bench',
    'LEAVE': 'Leave',
    'HOLD': 'Hold',
    'ON NOTICE': 'Notice',
    'INTERNAL': 'Internal'
};

const countQuery = `
SELECT
    COUNT(DISTINCT e.emp_id) AS employee_count
FROM hrportal.employee_allocation AS a
INNER JOIN hrportal.emp_details AS e ON a.emp_id = e.emp_id
INNER JOIN hrportal.project AS p ON a.project_id = p.id
WHERE
    a.start_date <= CURDATE()
    AND (a.end_date IS NULL OR a.end_date >= CURDATE())
    AND e.is_deleted = 0
    AND (
        (? = 'PRODUCTION' AND p.project_type = 'PRODUCTION' AND a.is_billable = 1)
        OR (? = 'INVESTMENT' AND p.project_type = 'PRODUCTION' AND a.is_billable = 0)
        OR (? = 'BENCH' AND p.project_type = 'BENCH')
        OR (? = 'LEAVE' AND p.project_type = 'LEAVE')
        OR (? = 'HOLD' AND p.project_type = 'HOLD')
        OR (? = 'ON NOTICE' AND p.project_type IN ('ON NOTICE', 'ONNOTICE'))
        OR (? = 'INTERNAL' AND p.project_type = 'INTERNAL')
    );
`;

// Collect results for the final summary table
const summaryResults = [];

test.describe('KPI Data Validation vs Database', () => {

    // Print the summary table once after ALL tests have finished
    test.afterAll(() => {
        console.log('\n\n========================================');
        console.log('   FINAL SUMMARY: DB vs UI (All KPIs)  ');
        console.log('========================================');
        console.table(summaryResults);
    });

    for (const resourceCategory of resourceCategories) {

        test(`Validate ${resourceCategory} KPI against Database`, async ({ browser }) => {

            console.log(`\n========== ${resourceCategory} ==========`);

            // -----------------------------------
            // 1. GLOBAL AUTH & PRACTICES PAGE
            // -----------------------------------
            const { page, practicesPage } = await setupAuthenticatedPage(browser);

            // -----------------------------------
            // 3. DB COUNT
            // -----------------------------------
            const dbParams = Array(7).fill(resourceCategory);
            const dbResult = await executeQuery(countQuery, dbParams);
            const dbCount = Number(dbResult[0]?.employee_count || 0);
            console.log(`DB unique employees for ${resourceCategory}: ${dbCount}`);

            // -----------------------------------
            // 4. UI COUNT (from KPI card)
            // -----------------------------------
            const uiLabel = uiLabelMap[resourceCategory];
            const kpiLocator = page.locator(
                `//div[contains(@class, 'kpi-info-small')]` +
                `[.//span[contains(@class, 'kpi-label-small') and contains(text(), '${uiLabel}')]]` +
                `//span[contains(@class, 'kpi-value-small')]`
            );

            let uiCount = 0;
            const kpiVisible = await kpiLocator.first().isVisible({ timeout: 10000 }).catch(() => false);

            if (kpiVisible) {
                const uiText = await kpiLocator.first().textContent();
                console.log(`Raw UI text for ${resourceCategory}: '${uiText}'`);
                uiCount = parseInt(uiText.replace(/[^0-9]/g, ''), 10) || 0;
            } else {
                console.log(`Warning: KPI card for '${uiLabel}' not found in UI.`);
            }

            console.log(`UI employees for ${resourceCategory}: ${uiCount}`);

            // -----------------------------------
            // 5. RECORD RESULT (always runs)
            // -----------------------------------
            const status = dbCount === uiCount ? 'PASS ✅' : 'FAIL ❌';
            summaryResults.push({
                'Category': resourceCategory,
                'DB Count': dbCount,
                'UI Count': uiCount,
                'Status': status
            });

            console.log(`Comparison: DB=${dbCount} | UI=${uiCount} | ${status}`);

            // -----------------------------------
            // 6. SOFT ASSERT — test is marked fail
            //    but execution continues for other tests
            // -----------------------------------
            expect.soft(uiCount, `Count mismatch for ${resourceCategory}: DB=${dbCount}, UI=${uiCount}`).toBe(dbCount);
            if (page) await page.context().close();
        });
    }
});
