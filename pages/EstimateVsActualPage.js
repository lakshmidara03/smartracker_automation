exports.EstimateVsActualPage = class EstimateVsActualPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // Locators provided by user
    this.estimateVsActualBtn = page.locator("//*[@routerlink='/practice/estimate-vs-actual' and contains(normalize-space(),'Estimate vs. Actual')]");

    // Using contains(@class, 'filter-select') to be more robust, as 'ng-untouched ng-pristine' classes change when interacted with
    // Adding .first() because the page contains 3 identical dropdowns (2 are disabled)
    this.accountSelect = page.locator("//select[contains(@class, 'filter-select')]").first();

    // Toggle button locator provided by user
    this.activeOnlyToggle = page.locator("//span[@class='filter-label' and normalize-space()='Active Only']/following-sibling::label[contains(@class,'toggle-switch')]//input[@type='checkbox']");

    // SOW and Allocation Buttons
    // Using contains() for the text to handle dynamic counts (e.g. "SOW Resources 102")
    this.sowResourcesBtn = page.locator("//button[contains(normalize-space(.),'SOW Resources')]");
    this.actualAllocationsBtn = page.locator("//button[contains(@class,'tab-btn') and contains(normalize-space(.),'Actual Allocations')]");
  }

  /**
   * Navigates to the Estimate vs Actual tab and filters by given accounts.
   * @param {string|string[]} accounts - The accounts to select (default: ['fastly', 'google'])
   */
  async navigateAndSearch() {
    // 1. Click on the Estimate vs Actual button
    await this.estimateVsActualBtn.waitFor({ state: 'visible' });
    await this.estimateVsActualBtn.click();

    // 2. Locate the account dropdown and select 'fastly'
    await this.accountSelect.waitFor({ state: 'attached' }); // Wait for attached instead of visible if it's hidden
    // Force the selection in case the <select> is visually hidden by a custom Angular dropdown UI
    await this.accountSelect.selectOption({ label: 'Fastly' }, { force: true });
    await this.page.waitForTimeout(1000); // Brief pause to see the selection

    // 3. Select 'google'
    await this.accountSelect.selectOption({ label: 'Google' }, { force: true });
    await this.page.waitForTimeout(1000); // Brief pause to see the selection

    // 4. Reset back to "All Accounts"
    // Using label matching to select the default All Accounts option
    await this.accountSelect.selectOption({ label: 'All Accounts' }, { force: true });
    await this.page.waitForTimeout(1000);

    // 5. Turn off the 'Active Only' toggle
    // The <input type="checkbox"> is visually hidden by the toggle UI. Playwright considers it outside the viewport.
    // Using evaluate() bypasses Playwright's actionability checks (viewport, visibility, size).
    await this.activeOnlyToggle.waitFor({ state: 'attached' });
    await this.activeOnlyToggle.evaluate(node => {
      if (node.checked) {
        node.click(); // Click it to trigger the framework's change detection
      }
    });
    await this.page.waitForTimeout(1000); // Brief pause after toggle

    // 6. Click SOW Resources button
    await this.sowResourcesBtn.waitFor({ state: 'visible' });
    await this.sowResourcesBtn.click();
    await this.page.waitForTimeout(1000);

    // 7. Click Actual Allocations button
    await this.actualAllocationsBtn.waitFor({ state: 'visible' });
    await this.actualAllocationsBtn.click();
    await this.page.waitForTimeout(1000);

    // 8. Go back to the Practices page using Playwright's native back navigation
    await this.page.goBack();
  }
};
