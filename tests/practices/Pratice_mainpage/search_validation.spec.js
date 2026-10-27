const { test, expect } = require('@playwright/test');
const { setupAuthenticatedPage, performSearch } = require('../helpers/practicesTestHelper');



test.describe('SmartTracker Practices - Search Filter Tests', () => {
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

  // performSearch is imported from helpers

  test('Search by Employee Name - Exists (Sridhar Pokuri)', async () => {
    const query = 'Sridhar Pokuri';
    await performSearch(page, query);

    // Assert that the 'No results found' message is NOT visible
    await expect(page.getByText(`No results found for "${query}"`)).toBeHidden();

    // Assert that the autocomplete dropdown shows the expected result
    await expect(page.locator('.ph-result-label', { hasText: 'Sridhar Pokuri' }).first()).toBeVisible();

    console.log('Tested existing employee search.');
  });

  test('Search by Employee Name - Does not exist (raju)', async () => {
    const query = 'raju';
    await performSearch(page, query);

    // Assert that the 'No results found' message IS visible
    await expect(page.getByText(`No results found for "${query}"`)).toBeVisible();

    console.log('Tested non-existing employee search.');
  });

  test('Search by Account Name - Exists (fastly)', async () => {
    const query = 'fastly';
    await performSearch(page, query);

    await expect(page.getByText(`No results found for "${query}"`)).toBeHidden();
    await expect(page.locator('.ph-result-label', { hasText: 'fastly' }).first()).toBeVisible({ timeout: 5000 }).catch(async () => {
      // Fallback: It might be case sensitive in the UI render
      await expect(page.locator('.ph-result-label', { hasText: 'Fastly' }).first()).toBeVisible();
    });

    console.log('Tested existing account search.');
  });

  test('Search by Account Name - Does not exist (fastlllly)', async () => {
    const query = 'fastlllly';
    await performSearch(page, query);

    await expect(page.getByText(`No results found for "${query}"`)).toBeVisible();

    console.log('Tested non-existing account search.');
  });

  test('Search by Project - Case sensitivity check (AI-SOW vs ai-sow)', async () => {
    // Exact match
    let query = 'AI-SOW';
    await performSearch(page, query);
    await expect(page.getByText(`No results found for "${query}"`)).toBeHidden();
    await expect(page.locator('.ph-result-label', { hasText: 'AI-SOW' }).first()).toBeVisible();
    console.log('Tested exact project match.');

    // Lowercase match
    query = 'ai-sow';
    await performSearch(page, query);
    // Assuming search is case insensitive, so it should still find results
    await expect(page.getByText(`No results found for "${query}"`)).toBeHidden();
    // The rendered result might preserve the original case from the backend
    await expect(page.locator('.ph-result-label', { hasText: 'AI-SOW' }).first()).toBeVisible();
    console.log('Tested lowercase project match.');
  });

  // Negative Search Tests
  test('Search with random characters (xyz)', async () => {
    const query = 'xyz';
    await performSearch(page, query);

    // We expect the 'No results found' message to appear since 'xyz' shouldn't match anything
    await expect(page.getByText(`No results found for "${query}"`)).toBeVisible();

    console.log('Tested negative search with random string (xyz).');
  });

  // Edge Cases
  test('Search with special characters only', async () => {
    const query = '!@#$%^&*()';
    await performSearch(page, query);
    await expect(page.getByText(`No results found for "${query}"`)).toBeVisible();
  });

  test('Search with excessively long string', async () => {
    const query = 'a'.repeat(255);
    await performSearch(page, query);
    await expect(page.getByText(`No results found for "${query}"`)).toBeVisible();
  });
});

