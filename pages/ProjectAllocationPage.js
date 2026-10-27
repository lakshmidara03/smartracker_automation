exports.ProjectAllocationPage = class ProjectAllocationPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // Locators provided by user
    this.projectAllocationsBtn = page.locator('//*[contains(text(),"Project Allocations")]').first();
    this.searchBar = page.getByPlaceholder('Search Account, Project, SoW...');
    this.paloAltoSection = page.locator("//span[@class='project-name' and normalize-space()='Palo Alto']");
    this.statsBtn = page.locator("//button[normalize-space()='Stats']");
    this.includeInactiveCheckbox = page.locator("//label[normalize-space()='Include Inactive Projects']/input[@type='checkbox']");
  }

  /**
   * Navigates to the Project Allocations section and searches for a specific project.
   * @param {string} searchText - The text to search for (default: 'palo alto')
   */
  async searchProjectAllocation(searchText = 'palo alto') {
    // 1. Open the Project Allocations section
    await this.projectAllocationsBtn.waitFor({ state: 'visible' });
    await this.projectAllocationsBtn.click();

    // 2. Locate the search bar and input the search text
    await this.searchBar.waitFor({ state: 'visible' });

    // Using pressSequentially as a best practice for search inputs
    await this.searchBar.fill(''); // Clear any existing text
    await this.searchBar.pressSequentially(searchText, { delay: 100 });

    // Wait a brief moment to allow search results to render
    await this.page.waitForTimeout(500);

    // 3. Click the specific project section from the search results
    await this.paloAltoSection.waitFor({ state: 'visible' });
    await this.paloAltoSection.click();

    // 4. Click on the Stats section
    await this.statsBtn.waitFor({ state: 'visible' });
    await this.statsBtn.click();

    // 5. Clear the search bar
    await this.searchBar.fill('');
    await this.page.waitForTimeout(500); // Wait for the list to reset

    // 6. Check the "Include Inactive Projects" checkbox
    await this.includeInactiveCheckbox.waitFor({ state: 'visible' });
    await this.includeInactiveCheckbox.check(); // check() ensures it gets checked if not already

    // 7. Go back to the Practices page using Playwright's native back navigation
    await this.page.goBack();
  }
};
