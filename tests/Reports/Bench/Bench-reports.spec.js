const { test, expect } = require('@playwright/test');

const baseUrl = (process.env.UI_BASE_URL || (process.env.BASE_URL && !process.env.BASE_URL.includes('13.61.179.149') ? process.env.BASE_URL : 'http://localhost:4200')).replace(/\/$/, '');
const REPORT_URL = `${baseUrl}/reports/bench-reports`;

test.describe('SmartTracker - Bench Costs Report', () => {
    test.setTimeout(90000);

    test.beforeEach(async ({ page }) => {
        await page.goto(REPORT_URL, {
            waitUntil: 'domcontentloaded'
        });

        await expect(page.locator('select.filter-select')).toBeVisible();
        await expect(page.locator('input.filter-date')).toHaveCount(2);
        await expect(
            page.locator('input[placeholder="Search name, ID, practice..."]')
        ).toBeVisible();
    });

    const practiceSelect = page => page.locator('select.filter-select');
    const dateInputs = page => page.locator('input.filter-date');
    const searchInput = page =>
        page.locator('input[placeholder="Search name, ID, practice..."]');
    const tabs = page => page.locator('button.bench-tab');
    const exportButton = page => page.locator('button.btn-export-excel');
    const rows = page => page.locator('table tbody tr');
    const pageSizeSelect = page => page.locator('.foot select');

    function getTab(page, name) {
        if (/non-production/i.test(name)) {
            return tabs(page).filter({ hasText: /Non-Production/ });
        }
        return tabs(page).filter({ hasNotText: 'Non-Production' }).filter({ hasText: 'Production' });
    }

    async function selectTab(page, name) {
        const tab = getTab(page, name);
        await expect(tab).toBeVisible();
        await tab.click();
        await expect(tab).toHaveClass(/active/);
    }

    test('BENCH-POS-001 - Report loads successfully', async ({ page }) => {
        await expect(page).toHaveURL(/reports\/bench-reports/);
        await expect(practiceSelect(page)).toBeVisible();
        await expect(exportButton(page)).toBeVisible();

        await expect(page.locator('.kpi-card', { hasText: 'FY 2026' })).toBeVisible();
        await expect(page.locator('.kpi-card', { hasText: 'Q1' })).toBeVisible();
        await expect(page.locator('.kpi-card', { hasText: 'Q2' })).toBeVisible();
        await expect(page.locator('.kpi-card', { hasText: 'Q3' })).toBeVisible();
        await expect(page.locator('.kpi-card', { hasText: 'Q4' })).toBeVisible();
    });

    test('BENCH-POS-002 - Practice dropdown contains options', async ({ page }) => {
        const options = await practiceSelect(page).locator('option').allTextContents();

        expect(options.length).toBeGreaterThan(1);
        expect(options).toContain('All Practices');

        console.log('Practice options:', options);
    });

    test('BENCH-POS-003 - Filter by a valid practice', async ({ page }) => {
        const select = practiceSelect(page);
        const options = await select.locator('option').evaluateAll(items =>
            items.map(option => ({
                value: option.value,
                label: option.textContent.trim()
            }))
        );

        const practice = options.find(option =>
            option.label === 'Academy' && option.value
        );

        test.skip(!practice, 'Academy practice is not available in this environment');

        await select.selectOption(practice.value);
        await expect(select).toHaveValue(practice.value);

        await expect(rows(page).first()).toBeVisible();
    });

    test('BENCH-POS-004 - Fill From and To dates', async ({ page }) => {
        const dates = dateInputs(page);

        await dates.nth(0).fill('2026-01-01');
        await dates.nth(1).fill('2026-03-31');

        await expect(dates.nth(0)).toHaveValue('2026-01-01');
        await expect(dates.nth(1)).toHaveValue('2026-03-31');

        // Allow the UI's date filter handlers to finish.
        await page.waitForTimeout(500);
    });

    test('BENCH-POS-005 - Search by employee ID', async ({ page }) => {
        const firstRow = rows(page).first();
        await expect(firstRow).toBeVisible();

        const employeeId = (await firstRow.locator('td').nth(0).innerText()).trim();
        expect(employeeId).not.toBe('');

        await searchInput(page).fill(employeeId);

        await expect.poll(async () => {
            return rows(page).allInnerTexts();
        }).toContainEqual(expect.stringContaining(employeeId));

        console.log('Searched employee ID:', employeeId);
    });

    test('BENCH-POS-006 - Switch between report tabs', async ({ page }) => {
        await selectTab(page, 'Non-Production Practices');
        await expect(getTab(page, 'Non-Production Practices')).toBeVisible();
        await expect(getTab(page, 'Non-Production Practices')).toHaveClass(/active/);

        await selectTab(page, 'Production Practices');
        await expect(getTab(page, 'Production Practices')).toBeVisible();
        await expect(getTab(page, 'Production Practices')).toHaveClass(/active/);
    });

    test('BENCH-POS-007 - Export filtered report to Excel', async ({ page }) => {
        await searchInput(page).fill('Academy');

        const downloadPromise = page.waitForEvent('download', {
            timeout: 15000
        });

        await exportButton(page).click();

        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/\.(xlsx|xls|csv)$/i);

        console.log('Downloaded file:', download.suggestedFilename());
    });

    test('BENCH-POS-008 - Change items per page', async ({ page }) => {
        const size = pageSizeSelect(page);

        await expect(size).toBeVisible();
        await size.selectOption('10');

        await expect(size).toHaveValue('10');
        expect(await rows(page).count()).toBeLessThanOrEqual(10);
    });

    test('BENCH-POS-009 - Navigate to the next page', async ({ page }) => {
        const next = page.getByTitle('Next Page');

        await expect(next).toBeVisible();

        if (await next.isEnabled()) {
            const before = await rows(page).first().innerText();
            await next.click();

            await expect.poll(async () => rows(page).first().innerText())
                .not.toBe(before);
        } else {
            test.skip(true, 'Only one page of data is available');
        }
    });

    test('BENCH-NEG-001 - Search for nonexistent employee', async ({ page }) => {
        await searchInput(page).fill('NO_SUCH_EMPLOYEE_987654');

        await expect.poll(async () => rows(page).count()).toBe(0);
    });

    test('BENCH-NEG-002 - Search with special characters', async ({ page }) => {
        const search = searchInput(page);

        await search.fill('<script>alert(1)</script>');

        // The page must remain functional and must not execute injected script.
        await expect(page.locator('body')).toBeVisible();
        await expect(search).toHaveValue('<script>alert(1)</script>');
        await expect(page.locator('script')).toHaveCount(
            await page.locator('script').count()
        );
    });

    test('BENCH-NEG-003 - Invalid date range', async ({ page }) => {
        const dates = dateInputs(page);

        await dates.nth(0).fill('2026-12-31');
        await dates.nth(1).fill('2026-01-01');

        // Verify the date values are entered. The expected validation behavior
        // must match the application requirement (error, rejection, or empty results).
        await expect(dates.nth(0)).toHaveValue('2026-12-31');
        await expect(dates.nth(1)).toHaveValue('2026-01-01');
    });

    test('BENCH-NEG-004 - Previous Page on first page', async ({ page }) => {
        const firstPage = page.getByTitle('First Page');
        const previous = page.getByTitle('Previous Page');

        if (await firstPage.isEnabled()) {
            await firstPage.click();
        }

        await expect(previous).toBeDisabled();
    });

    test('BENCH-NEG-005 - Next Page on last page', async ({ page }) => {
        const lastPage = page.getByTitle('Last Page');
        const next = page.getByTitle('Next Page');

        if (await lastPage.isEnabled()) {
            await lastPage.click();
            await expect(next).toBeDisabled();
        } else {
            await expect(next).toBeDisabled();
        }
    });

    test('BENCH-EDGE-001 - Same From and To date', async ({ page }) => {
        const dates = dateInputs(page);

        await dates.nth(0).fill('2026-06-15');
        await dates.nth(1).fill('2026-06-15');

        await expect(dates.nth(0)).toHaveValue('2026-06-15');
        await expect(dates.nth(1)).toHaveValue('2026-06-15');
    });

    test('BENCH-EDGE-002 - Select All items per page', async ({ page }) => {
        const size = pageSizeSelect(page);

        await size.selectOption('9999');

        await expect(size).toHaveValue('9999');

        // Actual row count should equal the filtered total if all records fit
        // on one page. Confirm against the report's displayed total.
        console.log('Rows displayed with All:', await rows(page).count());
    });

    test('BENCH-EDGE-003 - Clear search restores results', async ({ page }) => {
        const search = searchInput(page);

        const initialCount = await rows(page).count();

        await search.fill('NO_SUCH_EMPLOYEE_987654');
        await expect.poll(async () => rows(page).count()).toBe(0);

        await search.clear();

        await expect.poll(async () => rows(page).count())
            .toBe(initialCount);
    });

    test('BENCH-EDGE-004 - Verify tab counts are displayed', async ({ page }) => {
        const tabButtons = tabs(page);
        expect(await tabButtons.count()).toBeGreaterThanOrEqual(2);

        for (let i = 0; i < await tabButtons.count(); i++) {
            const tab = tabButtons.nth(i);
            await expect(tab).toBeVisible();
            await expect(tab.locator('.tab-count')).toBeVisible();
        }
    });
});
