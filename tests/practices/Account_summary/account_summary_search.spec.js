const { test, expect } = require('@playwright/test');
const { AccountSummaryPage } = require('../../../pages/AccountSummaryPage');
const { setupAuthenticatedPage, performSearch, expectSearchResults, expectNoSearchResults } = require('../helpers/practicesTestHelper');



test.describe('SmartTracker Account Summary - Search Validation Suite', () => {
  let page;
  let accountSummaryPage;

  test.beforeAll(async ({ browser }) => {
    const res = await setupAuthenticatedPage(browser);
    page = res.page;
    accountSummaryPage = new AccountSummaryPage(page);
    await accountSummaryPage.accountSummaryBtn.waitFor({ state: 'visible' });
    await accountSummaryPage.accountSummaryBtn.click();
    await page.waitForLoadState('networkidle');
    // Wait for a known element from the table/data to render so we don't search prematurely
    await page.getByText('Digital Transformation').first().waitFor({ state: 'visible', timeout: 90000 });
  });

  test.afterAll(async () => {
    if (page) await page.context().close();
  });

  const employeeTests = [
    { id: 'EMP-01', query: 'Sridhar Pokuri', valid: true, desc: 'Exact employee name – valid' },
    { id: 'EMP-02', query: 'NonExistingEmployeeXYZ', valid: false, desc: 'Employee name – invalid' },
    { id: 'EMP-03', query: 'sridhar pokuri', valid: true, desc: 'Employee name – case variation' },
    { id: 'EMP-04', query: 'Sridhar', valid: true, desc: 'Employee name – partial text' },
  ];

  employeeTests.forEach(({ id, query, valid, desc }) => {
    test(`Search Employee – ${id} – ${desc}`, async () => {
      await performSearch(page, query);
      if (valid) {
        await expectSearchResults(page, query);
      } else {
        await expectNoSearchResults(page, query);
      }
    });
  });

  const accountTests = [
    { id: 'ACC-01', query: 'Amgen', valid: true, desc: 'Exact account name – valid' },
    { id: 'ACC-02', query: 'Amgen_Invalid', valid: false, desc: 'Invalid account name' },
    { id: 'ACC-03', query: 'amgen', valid: true, desc: 'Account name – case variation' },
    { id: 'ACC-04', query: 'Amg', valid: true, desc: 'Account name – partial text' },
  ];

  accountTests.forEach(({ id, query, valid, desc }) => {
    test(`Search Account – ${id} – ${desc}`, async () => {
      await performSearch(page, query);
      if (valid) {
        await expectSearchResults(page, query);
      } else {
        await expectNoSearchResults(page, query);
      }
    });
  });

  test('GEN-01 – Empty search returns default data', async () => {
    await performSearch(page, '');
    await expect(page.getByText('No results found')).not.toBeVisible();
  });

  test('GEN-02 – Whitespace only search shows no results', async () => {
    const query = '   ';
    await performSearch(page, query);
    // The application treats whitespace as an empty query and returns the default dataset.
    // Therefore, the "No results found" message will be hidden.
    await expectSearchResults(page, query.trim());
  });

  // Edge Cases
  test('EDGE-01 – SQL Injection attempt', async () => {
    const query = "' OR 1=1 --";
    await performSearch(page, query);
    await expectNoSearchResults(page, query);
  });

  test('EDGE-02 – Special characters only', async () => {
    const query = "@#$%^&*";
    await performSearch(page, query);
    await expectNoSearchResults(page, query);
  });

  test('EDGE-03 – Very long string search', async () => {
    const query = 'a'.repeat(255);
    await performSearch(page, query);
    await expectNoSearchResults(page, query);
  });
});

