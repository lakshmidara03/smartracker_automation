const { LoginPage } = require('../../../pages/LoginPage');
const { PracticesPage } = require('../../../pages/PracticesPage');
const { expect } = require('@playwright/test');

const SEARCH_BOX = "input[placeholder*='Search']";
const NO_RESULTS_TEXT = 'No results found for';

async function setupAuthenticatedPage(browser) {
    const context = await browser.newContext({ storageState: '.auth/user.json' });
    const page = await context.newPage();

    // Automatically click 'Yes' if the application's Session Timeout popup appears
    // await page.addLocatorHandler(
    //     page.getByRole('heading', { name: 'Do you want to continue the session?' }),
    //     async () => {
    //         console.log('Session timeout popup detected! Auto-clicking "Yes"');
    //         await page.getByRole('button', { name: 'Yes', exact: true }).click();
    //     }
    // );

    const { practicesPage } = await loginAndNavigatePractices(page);
    return { context, page, practicesPage };
}

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
async function loginAndNavigatePractices(page) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:4200/';
    // Auth state (cookies/localStorage) is pre-loaded by global setup.
    // Navigate to the app home – the session should already be active.
    await page.goto(baseUrl, { waitUntil: 'load' });

    // Wait up to 15s for the app to redirect away from login if needed
    if (page.url().includes('/login')) {
        await page.waitForURL(url => !url.includes('/login'), { timeout: 15000 }).catch(() => { });
    }

    // If still on login page, auth state didn't work
    if (page.url().includes('/login')) {
        throw new Error(
            'Session expired or auth state missing. Re-run tests to trigger global-setup again.'
        );
    }

    await page.waitForLoadState('networkidle', { timeout: 90000 });

    const practicesPage = new PracticesPage(page);
    await practicesPage.practicesTab.waitFor({ state: 'visible', timeout: 90000 });
    await practicesPage.practicesTab.click();

    // Wait for the data cards to actually render to prevent race conditions during early searches
    await page.locator('.ph-pcard, .kpi-card').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => { });

    await page.waitForLoadState('networkidle', { timeout: 90000 });
    return { practicesPage };
}





async function performSearch(page, query) {
    const searchBox = page.locator(SEARCH_BOX).first();
    await searchBox.waitFor({ state: 'visible', timeout: 15000 });

    // Clear the box and wait for any "empty search" API calls to resolve
    await searchBox.fill('');
    await page.waitForTimeout(1000);

    // Type slowly to ensure the debounce captures the final string
    await searchBox.pressSequentially(query, { delay: 100 });

    // Wait for UI update (Angular debounce and API resolution)
    await page.waitForTimeout(2000);
}

function getNoResultsMessage(page, query) {
    return page.getByText(`${NO_RESULTS_TEXT} "${query}"`);
}

async function expectSearchResults(page, query) {
    await expect(getNoResultsMessage(page, query)).toBeHidden();

    // If the query is not empty, the autocomplete dropdown should show results
    if (query.trim().length > 0) {
        // Assert that at least one result label is visible in the dropdown
        await expect(page.locator('.ph-result-label').first()).toBeVisible({ timeout: 5000 });
    }
}

async function expectNoSearchResults(page, query) {
    await expect(getNoResultsMessage(page, query)).toBeVisible();
}

module.exports = {
    SEARCH_BOX,
    NO_RESULTS_TEXT,
    loginAndNavigatePractices,
    setupAuthenticatedPage,
    performSearch,
    expectSearchResults,
    expectNoSearchResults,
};
