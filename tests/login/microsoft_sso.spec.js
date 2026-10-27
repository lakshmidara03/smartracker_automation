const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../pages/LoginPage');

test.describe('Microsoft SSO Login Tests', () => {
  // Opt out of the global storageState so this test actually starts unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } });

  let loginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('TC01 - Microsoft SSO Login', async ({ page }) => {
    // Set a reasonable timeout for SSO login
    test.setTimeout(120000);

    const email = process.env.USER_EMAIL;
    const password = process.env.USER_PASSWORD;

    expect(email, 'USER_EMAIL should be defined in .env').toBeTruthy();
    expect(password, 'USER_PASSWORD should be defined in .env').toBeTruthy();

    await loginPage.loginWithMicrosoft(email, password);

    // Verify successful authentication by checking for a known post-login element
    await expect(page.getByText('Practices', { exact: true })).toBeVisible({ timeout: 60000 });
  });
});
