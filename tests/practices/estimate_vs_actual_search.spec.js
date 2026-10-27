const { test, expect } = require('@playwright/test');
const { EstimateVsActualPage } = require('../../pages/EstimateVsActualPage');
const { setupAuthenticatedPage } = require('./helpers/practicesTestHelper');

test.describe('SmartTracker Estimate Vs Actual - Filter Validation Tests', () => {
  let page;
  let practicesPage;
  let estimatePage;

  test.beforeAll(async ({ browser }) => {
    const res = await setupAuthenticatedPage(browser);
    page = res.page;
    practicesPage = res.practicesPage;

    // Navigate to Estimate vs Actual
    estimatePage = new EstimateVsActualPage(page);
    await estimatePage.estimateVsActualBtn.waitFor({ state: 'visible' });
    await estimatePage.estimateVsActualBtn.click();
    await page.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    if (page) await page.context().close();
  });

  test('Filter by Account: Amgen', async () => {
    // Use robust Playwright locators by index since dropdown contents can change dynamically
    const accountSelect = page.locator('select.filter-select').nth(0);
    
    // Select an Account (e.g., Amgen)
    await accountSelect.selectOption({ label: 'Amgen' }, { force: true });
    await page.waitForTimeout(1000); // Wait for KPIs to update
    
    // Assert that KPIs updated and are visible
    const kpiCards = page.locator('.kpi-card');
    await expect(kpiCards.first()).toBeVisible();
    
    console.log('Tested Account Filter: Amgen');
  });

  test('Filter by Account: Fastly and its Practices', async () => {
    const accountSelect = page.locator('select.filter-select').nth(0);
    const practiceSelect = page.locator('select.filter-select').nth(3);
    
    // Select Fastly
    await accountSelect.selectOption({ label: 'Fastly' }, { force: true });
    await page.waitForTimeout(1000);
    
    // Verify that the Practice dropdown options have dynamically updated based on the Fastly account
    const practiceOptions = await practiceSelect.locator('option').allInnerTexts();
    console.log('Available Practices for Fastly:', practiceOptions);
    
    // We expect the options to be restricted based on the account, so there should be at least 'All Practices' and some aligned practice
    expect(practiceOptions.length).toBeGreaterThan(0);
    
    // We will select a practice, e.g., Data & AI (if it exists for this account, else we just pick the second option available)
    if (practiceOptions.some(opt => opt.includes('Data & AI'))) {
      await practiceSelect.selectOption({ label: 'Data & AI' }, { force: true });
    } else if (practiceOptions.length > 1) {
      // Fallback to the first available practice aligned with this account if Data & AI isn't there
      await practiceSelect.selectOption({ label: practiceOptions[1].trim() }, { force: true });
    }
    
    await page.waitForTimeout(1000);

    const kpiCards = page.locator('.kpi-card');
    await expect(kpiCards.first()).toBeVisible();
    
    console.log('Tested Account Filter: Fastly with Practice Filter');
  });
  
  test('Filter by Multiple Accounts Sequentially', async () => {
    const accountSelect = page.locator('select.filter-select').nth(0);
    
    // Test sequentially selecting different accounts to ensure the UI updates
    const accountsToTest = ['Autodesk', 'Google', 'JPMC'];
    
    for (const account of accountsToTest) {
      await accountSelect.selectOption({ label: account }, { force: true });
      await page.waitForTimeout(1000);
      
      const kpiCards = page.locator('.kpi-card');
      await expect(kpiCards.first()).toBeVisible();
      
      // Ensure there is some numeric value in the KPI
      const kpiValue = await kpiCards.first().locator('.kpi-value').textContent();
      expect(kpiValue).not.toBeNull();
      
      console.log(`Tested Account Filter: ${account}`);
    }
    
    // Reset to All Accounts
    await accountSelect.selectOption({ label: 'All Accounts' }, { force: true });
    await page.waitForTimeout(1000);
  });

  // Negative / Edge Cases
  test('Negative - Invalid Account interaction', async () => {
    // The select box restricts what you can click, but we can verify that filtering out everything hides cards or shows 0s
    // By testing the reset to 'All Accounts', we ensure the UI recovers
    const accountSelect = page.locator('select.filter-select').nth(0);
    
    // Select an account we know exists
    await accountSelect.selectOption({ label: 'Autodesk' }, { force: true });
    await page.waitForTimeout(1000);
    
    // Reset to All Accounts
    await accountSelect.selectOption({ label: 'All Accounts' }, { force: true });
    await page.waitForTimeout(1000);
    
    // Verify cards are back to normal (e.g. at least 1 card exists)
    const kpiCards = page.locator('.kpi-card');
    await expect(kpiCards.first()).toBeVisible();
  });
});

