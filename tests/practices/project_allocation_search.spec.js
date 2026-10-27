const { test, expect } = require('@playwright/test');
const { ProjectAllocationPage } = require('../../pages/ProjectAllocationPage');
const { setupAuthenticatedPage, performSearch, expectSearchResults, expectNoSearchResults } = require('./helpers/practicesTestHelper');

test.describe('SmartTracker Project Allocations - Search Validation Suite', () => {
  let page;
  let projectPage;

  test.beforeAll(async ({ browser }) => {
    const res = await setupAuthenticatedPage(browser);
    page = res.page;

    projectPage = new ProjectAllocationPage(page);
    await projectPage.projectAllocationsBtn.waitFor({ state: 'visible' });
    await projectPage.projectAllocationsBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 90000 });
  });

  test.afterAll(async () => {
    if (page) await page.context().close();
  });

  // Positive Test Cases
  test('Search Project – PROJ-01 – Exact project name – valid', async () => {
    const query = 'Digital Transformation';
    await performSearch(page, query);
    await expect(page.getByText(`No results found`)).toBeHidden();
    await expect(page.locator('.project-name').first()).toBeVisible({ timeout: 5000 });
  });

  test('Search Project – PROJ-02 – Partial project name', async () => {
    const query = 'Digi';
    await performSearch(page, query);
    await expect(page.getByText(`No results found`)).toBeHidden();
    await expect(page.locator('.project-name').first()).toBeVisible({ timeout: 5000 });
  });

  test('Search Project – PROJ-03 – Case variation', async () => {
    const query = 'digital transformation';
    await performSearch(page, query);
    await expect(page.getByText(`No results found`)).toBeHidden();
    await expect(page.locator('.project-name').first()).toBeVisible({ timeout: 5000 });
  });

  // Negative Test Cases
  test('Search Project – PROJ-NEG-01 – Invalid project name', async () => {
    const query = 'NonExistentProject12345';
    await performSearch(page, query);
    // When no projects match, the project cards/names should disappear
    await expect(page.locator('.project-name').first()).toBeHidden({ timeout: 5000 });
  });

  test('Search Project – PROJ-NEG-02 – Special characters', async () => {
    const query = '@#$%^&*()';
    await performSearch(page, query);
    await expect(page.locator('.project-name').first()).toBeHidden({ timeout: 5000 });
  });

  // Edge Cases
  test('Search Project – PROJ-EDGE-01 – Empty search returns default data', async () => {
    await performSearch(page, '');
    // When empty, it shouldn't show no results
    await expect(page.getByText('No results found')).toBeHidden();
    await expect(page.locator('.project-name').first()).toBeVisible({ timeout: 5000 });
  });

  test('Search Project – PROJ-EDGE-02 – Extremely long string', async () => {
    const query = 'a'.repeat(255); // 255 character string
    await performSearch(page, query);
    await expect(page.locator('.project-name').first()).toBeHidden({ timeout: 5000 });
  });
});
