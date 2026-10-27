const { test, expect } = require('@playwright/test');
const { executeQuery } = require('../../../utils/dbUtils');
const { PracticesPage } = require('../../../pages/PracticesPage');
const { setupAuthenticatedPage } = require('../../practices/helpers/practicesTestHelper');

// Practices to validate (in display order)
const practices = [
    'Digital Transformation',
    'Data & AI',
    'Revenue and Sales',
    'Enterprise Business Planning',
    'IP & Solutions'
];

// DB query: count unique employees per practice
const practiceCountQuery = `
SELECT
    a.practice,
    COUNT(DISTINCT a.emp_id) AS total_employees
FROM hrportal.employee_allocation AS a

INNER JOIN hrportal.emp_details AS e
    ON a.emp_id = e.emp_id

INNER JOIN hrportal.project AS p
    ON a.project_id = p.id

WHERE
    a.start_date <= CURDATE()
    AND (
        a.end_date IS NULL
        OR a.end_date >= CURDATE()
    )
    AND e.is_deleted = 0
    AND a.practice IN (
        'Digital Transformation',
        'Data & AI',
        'Revenue and Sales',
        'Enterprise Business Planning',
        'IP & Solutions'
    )

GROUP BY
    a.practice

ORDER BY
    CASE a.practice
        WHEN 'Digital Transformation'      THEN 1
        WHEN 'Data & AI'                   THEN 2
        WHEN 'Revenue and Sales'           THEN 3
        WHEN 'Enterprise Business Planning' THEN 4
        WHEN 'IP & Solutions'              THEN 5
        ELSE 6
    END;
`;

// Collect results for the final summary table
const summaryResults = [];

test.describe('Practice Count Validation: DB vs UI', () => {

    // Print summary table once after all tests finish
    test.afterAll(() => {
        console.log('\n\n============================================');
        console.log('  FINAL SUMMARY: Practice Count (DB vs UI) ');
        console.log('============================================');
        console.table(summaryResults);
    });

    test('Validate practice employee counts against DB', async ({ browser }) => {

        // -----------------------------------
        // 1. FETCH ALL PRACTICE COUNTS FROM DB
        // -----------------------------------
        console.log('\nFetching practice counts from database...');
        const dbRows = await executeQuery(practiceCountQuery, []);

        // Build a map: { 'Digital Transformation': 42, 'Data & AI': 30, ... }
        const dbCountMap = {};
        for (const row of dbRows) {
            dbCountMap[row.practice] = Number(row.total_employees);
        }
        console.log('DB counts fetched:', dbCountMap);

        // -----------------------------------
        // 2. GLOBAL AUTH & PRACTICES PAGE
        // -----------------------------------
        const { page, practicesPage } = await setupAuthenticatedPage(browser);

        // -----------------------------------
        // 4. CLICK THE PRODUCTION SECTION
        //    (Department practice cards are inside the production section)
        // -----------------------------------
        await practicesPage.productionBadge.waitFor({ state: 'visible' });
        await practicesPage.productionBadge.click();
        await page.waitForTimeout(2000);

        // -----------------------------------
        // 5. READ EACH PRACTICE CARD FROM UI
        // -----------------------------------
        for (const practice of practices) {
            console.log(`\n========== ${practice} ==========`);

            // Locate the department card by its title text
            const card = page.locator('.ph-pcard').filter({
                has: page.locator(`.ph-pcard-title`, { hasText: practice })
            }).first();

            let uiCount = 0;

            const cardVisible = await card.isVisible({ timeout: 5000 }).catch(() => false);
            if (cardVisible) {
                // The total resource count is the sum of all row values inside the card
                // Using the same locator pattern from PracticesPage.js
                const resourceRows = card.locator("xpath=.//div[contains(@class,'ph-pcard-row')]//span[2]");
                const rowCount = await resourceRows.count();
                for (let i = 0; i < rowCount; i++) {
                    const text = await resourceRows.nth(i).innerText().catch(() => '0');
                    uiCount += parseInt(text.trim(), 10) || 0;
                }
            } else {
                console.log(`Warning: Card for '${practice}' not found in UI.`);
            }

            const dbCount = dbCountMap[practice] ?? 0;
            const status = dbCount === uiCount ? 'PASS ✅' : 'FAIL ❌';

            console.log(`DB Count : ${dbCount}`);
            console.log(`UI Count : ${uiCount}`);
            console.log(`Status   : ${status}`);

            summaryResults.push({
                'Practice': practice,
                'DB Count': dbCount,
                'UI Count': uiCount,
                'Status': status
            });

            // Soft assert — all practices run even if one fails
            expect.soft(uiCount, `Mismatch for "${practice}": DB=${dbCount}, UI=${uiCount}`).toBe(dbCount);
            if (page) await page.context().close();
        }
    });
});

