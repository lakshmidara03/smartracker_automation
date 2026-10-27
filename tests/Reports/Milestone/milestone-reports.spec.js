
const { test, expect } = require('@playwright/test');

const BASE_URL = (process.env.UI_BASE_URL || (process.env.BASE_URL && !process.env.BASE_URL.includes('13.61.179.149') ? process.env.BASE_URL : 'http://localhost:4200')).replace(/\/$/, '');

const MILESTONE_URL =
    `${BASE_URL}/reports/milestone-reports`;

// Use a known, editable test milestone.
const TEST_ACCOUNT = 'Fastly';
const TEST_SOW = 'Fastly july sow';

const SELECTORS = {
    accountFilter: 'button.multi-select-btn',
    statusButtons: '.pill-group button.pill',
    search: 'input[placeholder*="Search Account, SoW, Milestone"]',
    expandAll: 'button.action-btn:has-text("Expand all")',
    collapseAll: 'button.action-btn:has-text("Collapse all")',
    accountRows: '.client-row',
    accountName: '.client-name',
    invoiceAmountEdit: 'button[title="Edit invoice amount"]',
    invoiceAmountValue: '.inv-view .inv-value',
    milestoneTable: 'table',
};

async function openMilestoneReports(page) {
    await page.goto(MILESTONE_URL, {
        waitUntil: 'domcontentloaded',
    });

    await expect(
        page.getByRole('heading', { name: /Milestone Reports/i })
    ).toBeVisible();

    await expect(page.locator(SELECTORS.search)).toBeVisible();
    await expect(page.locator(SELECTORS.accountRows).first()).toBeVisible();
}

async function getStatusButton(page, name) {
    return page.locator(SELECTORS.statusButtons)
        .filter({ hasText: name });
}

async function searchFor(page, value) {
    const search = page.locator(SELECTORS.search);
    await search.fill(value);
}

async function clearSearch(page) {
    await page.locator(SELECTORS.search).fill('');
}

async function expandAccount(page, accountName) {
    const account = page.locator('.client-block')
        .filter({
            has: page.locator('.client-name', {
                hasText: accountName,
            }),
        });

    await expect(account).toBeVisible();

    const row = account.locator('.client-row').first();
    const toggle = row.locator('.toggle-icon');

    if (await toggle.count()) {
        const className = await toggle.getAttribute('class') || '';

        if (className.includes('chevron-right')) {
            await row.click();
        }
    } else {
        // Fallback if the icon selector differs in the live DOM.
        await row.click();
    }

    return account;
}

test.describe('Milestone Reports UI', () => {
    test.beforeEach(async ({ page }) => {
        await openMilestoneReports(page);
    });

    // ---------------------------------------------------
    // POSITIVE TEST CASES
    // ---------------------------------------------------

    test('MS-P01: page and filters load', async ({ page }) => {
        await expect(page.locator(SELECTORS.search)).toBeVisible();

        await expect(
            page.getByRole('button', { name: /Expand all/i })
        ).toBeVisible();

        await expect(
            page.getByRole('button', { name: /Collapse all/i })
        ).toBeVisible();

        await expect(
            page.getByText(TEST_ACCOUNT, { exact: true }).first()
        ).toBeVisible();
    });

    test('MS-P02: status filters are selectable', async ({ page }) => {
        for (const status of ['All', 'Ongoing', 'Closed']) {
            const button = await getStatusButton(page, status);

            await expect(button).toBeVisible();
            await button.click();
            await expect(button).toHaveClass(/pill-active/);
        }
    });

    test('MS-P03: search for an existing account', async ({ page }) => {
        await searchFor(page, TEST_ACCOUNT);

        await expect(
            page.getByText(TEST_ACCOUNT, { exact: true }).first()
        ).toBeVisible();

        await clearSearch(page);
    });

    test('MS-P04: search for an existing SoW', async ({ page }) => {
        await searchFor(page, TEST_SOW);

        await expect(
            page.getByText(TEST_SOW, { exact: true }).first()
        ).toBeVisible();

        await clearSearch(page);
    });

    test('MS-P05: expand all and collapse all', async ({ page }) => {
        await page.locator(SELECTORS.expandAll).click();

        await expect(
            page.getByText(TEST_SOW, { exact: true }).first()
        ).toBeVisible();

        await page.locator(SELECTORS.collapseAll).click();

        // The account row should remain visible after collapsing.
        await expect(
            page.locator('.client-name', {
                hasText: TEST_ACCOUNT,
            }).first()
        ).toBeVisible();
    });

    // ---------------------------------------------------
    // NEGATIVE TEST CASES
    // ---------------------------------------------------

    test('MS-N01: nonexistent search returns empty state', async ({ page }) => {
        await searchFor(page, 'NO_SUCH_MILESTONE_987654');

        await expect(
            page.getByText(/No milestone reports match the current filters/i)
        ).toBeVisible();
    });

    test('MS-N02: search with spaces is handled consistently', async ({ page }) => {
        await searchFor(page, `  ${TEST_ACCOUNT}  `);

        await expect(
            page.getByText(TEST_ACCOUNT, { exact: true }).first()
        ).toBeVisible();
    });

    test('MS-N03: selecting Invoiced opens confirmation; No cancels', async ({ page }) => {
        await page.locator(SELECTORS.expandAll).click();

        const sow = page.getByText(TEST_SOW, { exact: true }).first();
        await expect(sow).toBeVisible();

        // Locate the milestone row through its milestone text.
        // Replace this with a unique milestone name if the page
        // contains more than one matching row.
        const milestoneName = page.getByText(
            'Engagement Tenure 3 [excluding weekends]',
            { exact: true }
        ).first();

        await expect(milestoneName).toBeVisible();

        const row = milestoneName.locator('xpath=ancestor::tr[1]');
        const statusSelect = row.locator('select');

        // Do not assume the first select in the row is Invoice Status.
        // Confirm the actual row DOM before using this selector.
        await expect(statusSelect.first()).toBeVisible();

        const originalStatus = await statusSelect.first().inputValue();

        await statusSelect.first().selectOption({ label: 'Invoiced' });

        const dialog = page.getByText(
            /Are you sure you want to mark this milestone as Invoiced/i
        );

        await expect(dialog).toBeVisible();

        await page.getByRole('button', { name: 'No', exact: true }).click();

        await expect(dialog).not.toBeVisible();

        // Verify the status is still the original value.
        await expect(statusSelect.first()).toHaveValue(originalStatus);
    });

    // ---------------------------------------------------
    // EDGE CASES
    // ---------------------------------------------------

    test('MS-E01: clear search after empty results', async ({ page }) => {
        await searchFor(page, 'NO_SUCH_MILESTONE_987654');

        await expect(
            page.getByText(/No milestone reports match the current filters/i)
        ).toBeVisible();

        await clearSearch(page);

        await expect(
            page.getByText(TEST_ACCOUNT, { exact: true }).first()
        ).toBeVisible();
    });

    test('MS-E02: repeated expand/collapse does not break the page', async ({ page }) => {
        for (let i = 0; i < 3; i++) {
            await page.locator(SELECTORS.expandAll).click();
            await page.locator(SELECTORS.collapseAll).click();
        }

        await expect(page.locator(SELECTORS.search)).toBeVisible();
    });

    test('MS-E03: status filter can be changed repeatedly', async ({ page }) => {
        for (const status of ['Ongoing', 'Closed', 'All', 'Ongoing', 'All']) {
            const button = await getStatusButton(page, status);

            await button.click();
            await expect(button).toHaveClass(/pill-active/);
        }
    });
});
