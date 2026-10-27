exports.AccountSummaryPage = class AccountSummaryPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // Locators provided by user
    this.accountSummaryBtn = page.locator("//*[@routerlink='/practice/account-summary']");
    this.selectAllCheckbox = page.locator("//label[contains(@class,'multi-select-option')][.//span[@class='option-label' and normalize-space()='Select All']]//input[@type='checkbox']");
    this.amgenAccountCheckbox = page.locator("//label[contains(@class,'multi-select-option')][.//span[@class='option-label' and normalize-space()='Amgen']]//input[@type='checkbox']");
    this.amgenProjectCheckbox = page.locator("//label[contains(@class,'multi-select-option')][.//span[@class='option-label' and normalize-space()='Amgen ETDG Capex project']]//input[@type='checkbox']");

    // Dropdown buttons that need to be opened first
    this.accountDropdownBtn = page.locator("//button[contains(normalize-space(.), 'All Accounts')]");
    this.projectDropdownBtn = page.locator("//button[contains(normalize-space(.), 'All Projects')]");
  }

  /**
   * Navigates to the Account Summary tab and selects the Amgen account and project.
   */
  async navigateToAccountSummary() {
    // 1. Click on the Account Summary button
    await this.accountSummaryBtn.waitFor({ state: 'visible' });
    await this.accountSummaryBtn.click();
    await this.page.waitForTimeout(2000); // Pause to let the page and data load

    // 2. Open Account Dropdown and Select the Amgen account filter
    await this.accountDropdownBtn.waitFor({ state: 'visible' });
    await this.accountDropdownBtn.click();
    await this.page.waitForTimeout(1000); // Wait for dropdown options to render in DOM

    // Uncheck "Select All" first
    await this.selectAllCheckbox.waitFor({ state: 'attached' });
    await this.selectAllCheckbox.evaluate(node => {
      if (node.checked) {
        node.click(); // Uncheck it
      }
    });
    await this.page.waitForTimeout(500);

    await this.amgenAccountCheckbox.waitFor({ state: 'attached' });
    // Use evaluate to bypass visibility checks if the dropdown is currently closed or the input is visually hidden
    await this.amgenAccountCheckbox.evaluate(node => {
      if (!node.checked) {
        node.click(); // Check it if not already checked
      }
    });

    // Close the dropdown by clicking the project dropdown button directly.
    // We cannot click accountDropdownBtn again because its text has changed to 'Amgen'.
    await this.page.waitForTimeout(1000); // Wait for the project list to update based on the account selection

    // 3. Open Project Dropdown and Select the Amgen project filter
    await this.projectDropdownBtn.waitFor({ state: 'visible' });
    await this.projectDropdownBtn.click();
    await this.page.waitForTimeout(1000); // Wait for dropdown options to render in DOM

    // Uncheck "Select All" first
    await this.selectAllCheckbox.waitFor({ state: 'attached' });
    await this.selectAllCheckbox.evaluate(node => {
      if (node.checked) {
        node.click(); // Uncheck it
      }
    });
    await this.page.waitForTimeout(500);

    await this.amgenProjectCheckbox.waitFor({ state: 'attached' });
    await this.amgenProjectCheckbox.evaluate(node => {
      if (!node.checked) {
        node.click(); // Check it if not already checked
      }
    });
    await this.page.waitForTimeout(1000); // Wait for results

    // 4. Reset filters back to default by clicking the 'Clear' button
    // Ensure any open dropdowns (like the Projects dropdown) are closed so they don't block the Clear button
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);

    // Locate any button containing the text 'Clear' but exclude 'Clear All'
    const clearFiltersBtn = this.page.locator('button').filter({ hasText: 'Clear' }).filter({ hasNotText: 'Clear All' }).first();

    await clearFiltersBtn.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

    if (await clearFiltersBtn.isVisible()) {
      // Use evaluate to click the clear button forcefully to avoid any viewport issues
      await clearFiltersBtn.evaluate(node => node.click());
      await this.page.waitForTimeout(1500); // Wait for table to reset and dropdown to update
    } else {
      // Fallback: manually click the Account dropdown and click 'Clear All' if the main Clear button is missing
      const accountDropdownBtn = this.page.locator('button').filter({ hasText: 'Amgen' }).first();
      if (await accountDropdownBtn.isVisible()) {
         await accountDropdownBtn.click();
         await this.page.waitForTimeout(500);
         const clearAllBtn = this.page.locator('button').filter({ hasText: 'Clear All' }).first();
         if (await clearAllBtn.isVisible()) {
            await clearAllBtn.evaluate(node => node.click());
         }
         await this.page.waitForTimeout(1000);
      }
    }

    // 5. Search for 'sridhar pokuri' (lowercase to show failure)
    const searchBox = this.page.locator("//input[@placeholder='Search by Emp Name, Account, Project, SOW...']");
    await searchBox.waitFor({ state: 'visible' });
    await searchBox.fill(''); // clear if any
    await searchBox.pressSequentially('sridhar pokuri', { delay: 100 });

    // Wait for 2 seconds after searching so the user can see the results (which will fail/be empty)
    await this.page.waitForTimeout(2000);

    // 6. Search for 'Sridhar Pokuri' (Case sensitive check)
    await searchBox.fill(''); // clear previous search
    await searchBox.pressSequentially('Sridhar Pokuri', { delay: 100 });
    await this.page.keyboard.press('Enter'); // Press enter just in case it's required to trigger the full search

    // Wait for 2 seconds after searching so the user can see the correct results load
    await this.page.waitForTimeout(2000);

    // 7. Scroll down the page to view the results
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await this.page.waitForTimeout(2000); // Wait 2 seconds to see the scrolled view

    // 7. Go back to the Practices page
    await this.page.goBack();
    await this.page.waitForTimeout(1500); // Brief pause to ensure the Practices page loads
  }
};
