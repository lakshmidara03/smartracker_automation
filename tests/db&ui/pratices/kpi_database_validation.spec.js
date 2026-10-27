const { test, expect } = require('@playwright/test');
const { executeQuery } = require('../../../utils/dbUtils');
const { LoginPage } = require('../../../pages/LoginPage');
const { setupAuthenticatedPage } = require('../../practices/helpers/practicesTestHelper');
const { PracticesPage } = require('../../../pages/PracticesPage');

test.describe('KPI Cards Database Validation', () => {

  let dbResults = {};

  test.beforeAll(async () => {
    // 1. Execute the query to get the KPI data from the database
    const query = `
      SELECT
          resource_category,
          COUNT(DISTINCT emp_id) AS employee_count
      FROM
      (
          SELECT
              e.emp_id,
              CASE
                  WHEN p.project_type = 'PRODUCTION' AND a.is_billable = 0 THEN 'INVESTMENT'
                  WHEN p.project_type = 'PRODUCTION' AND a.is_billable = 1 THEN 'PRODUCTION'
                  WHEN p.project_type = 'BENCH' THEN 'BENCH'
                  WHEN p.project_type = 'LEAVE' THEN 'LEAVE'
                  WHEN p.project_type = 'HOLD' THEN 'HOLD'
                  WHEN p.project_type IN ('ON NOTICE', 'ONNOTICE') THEN 'ON NOTICE'
                  WHEN p.project_type = 'INTERNAL' THEN 'INTERNAL'
              END AS resource_category
          FROM hrportal.employee_allocation a
          INNER JOIN hrportal.emp_details e ON a.emp_id = e.emp_id
          INNER JOIN hrportal.project p ON a.project_id = p.id
          WHERE
              a.start_date <= CURDATE()
              AND (a.end_date IS NULL OR a.end_date >= CURDATE())
              AND e.is_deleted = 0
              AND p.project_type IN ('BENCH','LEAVE','HOLD','ON NOTICE','ONNOTICE','INTERNAL','PRODUCTION')
      ) AS resource_data
      GROUP BY resource_category
      ORDER BY resource_category;
    `;

    console.log('Fetching KPI data from Database...');
    const results = await executeQuery(query);

    // Transform DB results into a key-value object for easy lookup
    // e.g. { BENCH: 5, PRODUCTION: 64, INTERNAL: 2 }
    results.forEach(row => {
      if (row.resource_category) {
        dbResults[row.resource_category.toUpperCase()] = row.employee_count;
      }
    });

    console.log('Database KPI Totals:', dbResults);
  });

  test('Validate overall KPI counts against UI', async ({ browser }) => {
    // -----------------------------------
    // 1. GLOBAL AUTH & PRACTICES PAGE
    // -----------------------------------
    const { page, practicesPage } = await setupAuthenticatedPage(browser);

    // In your UI, are the KPI cards aggregated across all departments or is there a specific global KPI widget?
    // As a placeholder, we will sum up the values from all department cards if there isn't a global widget.

    const cards = page.locator('.ph-pcard').filter({ has: page.locator("xpath=.//div[contains(@class,'ph-pcard-badge--billable')]") });
    const cardCount = await cards.count();

    let uiTotals = {
      PRODUCTION: 0,
      BENCH: 0,
      INTERNAL: 0,
      INVESTMENT: 0,
      LEAVE: 0,
      NOTICE: 0,
      HOLD: 0
    };

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const productionStr = await card.locator("xpath=.//div[contains(@class,'ph-pcard-row')][.//span[normalize-space()='Production']]//span[2]").innerText().catch(() => '0');
      const benchStr = await card.locator("xpath=.//div[contains(@class,'ph-pcard-row')][.//span[normalize-space()='Bench']]//span[2]").innerText().catch(() => '0');
      const internalStr = await card.locator("xpath=.//div[contains(@class,'ph-pcard-row')][.//span[normalize-space()='Internal']]//span[2]").innerText().catch(() => '0');
      const investmentStr = await card.locator("xpath=.//div[contains(@class,'ph-pcard-row')][.//span[normalize-space()='Investment']]//span[2]").innerText().catch(() => '0');
      const leaveStr = await card.locator("xpath=.//div[contains(@class,'ph-pcard-row')][.//span[normalize-space()='Leave']]//span[2]").innerText().catch(() => '0');
      const noticeStr = await card.locator("xpath=.//div[contains(@class,'ph-pcard-row')][.//span[normalize-space()='Notice']]//span[2]").innerText().catch(() => '0');
      const holdStr = await card.locator("xpath=.//div[contains(@class,'ph-pcard-row')][.//span[normalize-space()='Hold']]//span[2]").innerText().catch(() => '0');

      uiTotals.PRODUCTION += parseInt(productionStr.trim(), 10) || 0;
      uiTotals.BENCH += parseInt(benchStr.trim(), 10) || 0;
      uiTotals.INTERNAL += parseInt(internalStr.trim(), 10) || 0;
      uiTotals.INVESTMENT += parseInt(investmentStr.trim(), 10) || 0;
      uiTotals.LEAVE += parseInt(leaveStr.trim(), 10) || 0;
      uiTotals.NOTICE += parseInt(noticeStr.trim(), 10) || 0;
      uiTotals.HOLD += parseInt(holdStr.trim(), 10) || 0;
    }

    console.log('Aggregated UI KPI Totals:', uiTotals);

    // Validate that UI aggregates match the DB totals
    // (If the UI has a specific global KPI card, we can replace the aggregation logic with a direct locator read)
    expect(uiTotals.PRODUCTION, 'Production count mismatch').toBe(dbResults['PRODUCTION'] || 0);
    expect(uiTotals.BENCH, 'Bench count mismatch').toBe(dbResults['BENCH'] || 0);
    expect(uiTotals.INTERNAL, 'Internal count mismatch').toBe(dbResults['INTERNAL'] || 0);
    expect(uiTotals.INVESTMENT, 'Investment count mismatch').toBe(dbResults['INVESTMENT'] || 0);
    expect(uiTotals.LEAVE, 'Leave count mismatch').toBe(dbResults['LEAVE'] || 0);
    expect(uiTotals.NOTICE, 'On Notice count mismatch').toBe(dbResults['ON NOTICE'] || 0);
    expect(uiTotals.HOLD, 'Hold count mismatch').toBe(dbResults['HOLD'] || 0);
  });
});
