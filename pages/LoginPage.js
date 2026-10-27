exports.LoginPage = class LoginPage {
  constructor(page) {
    this.page = page;
    this.microsoftSSOLogo = page.locator('//*[@class="micro-logo"]');
  }

  getMicrosoftLocators(msPage) {
    return {
      msEmailInput: msPage.locator('input[name="loginfmt"], input[placeholder="Email, phone, or Skype"]'),
      msNextButton: msPage.locator('input[id="idSIButton9"], input[value="Next"]'),
      msPasswordInput: msPage.locator('input[name="passwd"], input[placeholder="Password"]'),
      msSignInButton: msPage.locator('input[id="idSIButton9"], input[value="Sign in"]'),
      msStaySignedInNo: msPage.locator('input[id="idBtn_Back"], input[type="button"][value="No"]')
    };
  }

  async goto() {
    const baseUrl = process.env.BASE_URL || 'https://13.61.179.149/';
    const targetUrl = baseUrl.endsWith('/') ? baseUrl + 'login' : baseUrl + '/login';
    await this.page.goto(targetUrl);
  }

  async loginWithMicrosoft(email, password) {
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
      this.microsoftSSOLogo.click()
    ]);
    const msPage = newPage || this.page;
    await msPage.waitForLoadState('load', { timeout: 90000 });
    const { msEmailInput, msNextButton, msPasswordInput, msSignInButton, msStaySignedInNo } =
      this.getMicrosoftLocators(msPage);
    await msEmailInput.waitFor({ state: 'visible', timeout: 90000 });
    await msEmailInput.fill(email);
    await msNextButton.click();
    await msPasswordInput.waitFor({ state: 'visible', timeout: 90000 });
    await msPasswordInput.fill(password);
    await msSignInButton.click();
    try {
      await msStaySignedInNo.waitFor({ state: 'visible', timeout: 5000 });
      await msStaySignedInNo.click();
    } catch (e) {}
    if (newPage) {
      await Promise.race([
        newPage.waitForURL(
          url => !url.includes('microsoftonline.com') && !url.includes('login.live.com'),
          { timeout: 90000 }
        ).catch(() => {}),
        newPage.waitForEvent('close', { timeout: 90000 }).catch(() => {})
      ]);
      // Wait for the main page to process the MSAL token from the popup
      try {
        await this.page.waitForFunction(() => {
          return localStorage.getItem('token') !== null || localStorage.getItem('userDetails') !== null;
        }, { timeout: 30000 });
      } catch (e) {
        console.log('Token not found in localStorage within 30s. Proceeding anyway...');
      }

      const baseUrl = process.env.BASE_URL || 'https://13.61.179.149/';
      await this.page.goto(baseUrl, { waitUntil: 'load' });
    }
  }
};
