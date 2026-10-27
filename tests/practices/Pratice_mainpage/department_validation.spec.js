const { test, expect } = require('@playwright/test');
const { setupAuthenticatedPage } = require('./helpers/practicesTestHelper');

test.describe('SmartTracker Practices Validation Tests', () => {
  let page;
  let practicesPage;

  test.beforeAll(async ({ browser }) => {
    const res = await setupAuthenticatedPage(browser);
    page = res.page;
    practicesPage = res.practicesPage;
  });

  test.afterAll(async () => {
    if (page) await page.context().close();
  });

  test('TC02 - Validate Department Card Business Rules', async () => {
    test.setTimeout(180000);
    await practicesPage.validateDepartmentCards();
  });
});

