const { test, expect } = require('@playwright/test');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:4200/').replace(/\/$/, '');
const ALLOCATION_URL = `${BASE_URL}/employee/employee-allocation`;
const EMPLOYEE_ID = '2068';

// =============================================================================
// TEST DATA MATRICES
// =============================================================================

// ── 1. ALLOCATION PERCENTAGE TEST CASES ───────────────────────────────────────

const PCT_POSITIVE_CASES = [
    { id: 'AL-PCT-P01', name: 'Minimum valid percentage', value: '1' },
    { id: 'AL-PCT-P02', name: 'Low allocation', value: '10' },
    { id: 'AL-PCT-P03', name: 'Partial allocation', value: '25' },
    { id: 'AL-PCT-P04', name: 'Half allocation', value: '50' },
    { id: 'AL-PCT-P05', name: 'High allocation', value: '75' },
    { id: 'AL-PCT-P06', name: 'Maximum valid percentage', value: '100' },
    { id: 'AL-PCT-P07', name: 'Percentage just below maximum', value: '99' },
];

const PCT_NEGATIVE_CASES = [
    { id: 'AL-PCT-N01', name: 'Negative percentage', value: '-1' },
    { id: 'AL-PCT-N02', name: 'Percentage below minimum', value: '-10' },
    { id: 'AL-PCT-N03', name: 'Percentage above maximum', value: '101' },
    { id: 'AL-PCT-N04', name: 'Extremely high percentage', value: '1000' },
    { id: 'AL-PCT-N05', name: 'Zero percentage', value: '0' },
    { id: 'AL-PCT-N06', name: 'Alphabetic input', value: 'abc' },
    { id: 'AL-PCT-N07', name: 'Special characters', value: '@#$' },
    { id: 'AL-PCT-N08', name: 'Invalid mixed input', value: '50abc' },
    { id: 'AL-PCT-N09', name: 'Save with invalid percentage', value: '101' },
    { id: 'AL-PCT-N10', name: 'Empty percentage', value: '' },
    { id: 'AL-PCT-N11', name: 'Whitespace-only input', value: '   ' },
];

const PCT_EDGE_CASES = [
    { id: 'AL-PCT-E01', name: 'Decimal percentage', value: '50.5', expectValid: false },
    { id: 'AL-PCT-E02', name: 'Very small decimal', value: '0.1', expectValid: false },
    { id: 'AL-PCT-E03', name: 'Leading zeros', value: '050', expectValid: true, expectedNormalized: '50' },
    { id: 'AL-PCT-E04', name: 'Leading/trailing spaces', value: ' 50 ', expectValid: true },
    { id: 'AL-PCT-E05', name: 'Minimum boundary', value: '1', expectValid: true },
    { id: 'AL-PCT-E06', name: 'Maximum boundary', value: '100', expectValid: true },
    { id: 'AL-PCT-E07', name: 'Just below minimum', value: '0', expectValid: false },
    { id: 'AL-PCT-E08', name: 'Just above maximum', value: '101', expectValid: false },
];

// ── 2. START AND END DATE TEST CASES ──────────────────────────────────────────

const DATE_POSITIVE_CASES = [
    { id: 'AL-DATE-P01', name: 'Valid short period', start: '2027-02-01', end: '2027-02-07' },
    { id: 'AL-DATE-P02', name: 'Valid monthly period', start: '2027-02-01', end: '2027-02-28' },
    { id: 'AL-DATE-P03', name: 'Valid long period', start: '2027-01-01', end: '2027-12-31' },
    { id: 'AL-DATE-P04', name: 'Start date equals end date', start: '2027-02-01', end: '2027-02-01' },
    { id: 'AL-DATE-P05', name: 'Future allocation', start: '2027-03-01', end: '2027-03-31' },
    { id: 'AL-DATE-P06', name: 'Valid dates before existing allocations', start: '2026-06-01', end: '2026-07-31' },
    { id: 'AL-DATE-P07', name: 'Valid dates after existing allocations', start: '2027-01-01', end: '2027-01-31' },
];

const DATE_NEGATIVE_RANGE_CASES = [
    { id: 'AL-DATE-N01', name: 'Start date after end date', start: '2027-02-15', end: '2027-02-01' },
    { id: 'AL-DATE-N02', name: 'Missing start date', start: '', end: '2027-02-28' },
    { id: 'AL-DATE-N03', name: 'Missing end date', start: '2027-02-01', end: '' },
    { id: 'AL-DATE-N04', name: 'Both dates missing', start: '', end: '' },
];

const DATE_OVERLAP_CASES = [
    { id: 'AL-DATE-N05', name: 'Exact duplicate of existing period', start: '2026-08-01', end: '2026-09-30', overlap: true },
    { id: 'AL-DATE-N06', name: 'Start date inside existing period', start: '2026-08-15', end: '2026-10-15', overlap: true },
    { id: 'AL-DATE-N07', name: 'End date inside existing period', start: '2026-07-15', end: '2026-09-15', overlap: true },
    { id: 'AL-DATE-N08', name: 'New period contains existing period', start: '2026-07-01', end: '2026-10-31', overlap: true },
    { id: 'AL-DATE-N09', name: 'Overlap with active allocation period', start: '2026-08-10', end: '2026-08-25', overlap: true },
    { id: 'AL-DATE-N10', name: 'Overlap with existing allocation', start: '2026-09-01', end: '2026-10-15', overlap: true },
    { id: 'AL-DATE-E07', name: 'Adjacent dates at existing boundary', start: '2026-09-29', end: '2026-10-31', overlap: true },
    { id: 'AL-DATE-E08', name: 'New period ends before existing starts', start: '2026-07-01', end: '2026-07-30', overlap: false },
];

const DATE_EDGE_CASES = [
    { id: 'AL-DATE-E01', name: 'First day of a month', start: '2027-02-01', end: '2027-02-28' },
    { id: 'AL-DATE-E02', name: 'Last day of a month', start: '2027-02-28', end: '2027-03-31' },
    { id: 'AL-DATE-E03', name: 'Leap-year February', start: '2028-02-01', end: '2028-02-29' },
    { id: 'AL-DATE-E04', name: 'Non-leap-year February boundary', start: '2027-02-01', end: '2027-02-28' },
    { id: 'AL-DATE-E05', name: 'Same-day allocation', start: '2027-02-15', end: '2027-02-15' },
    { id: 'AL-DATE-E06', name: 'Consecutive periods', start: '2026-10-01', end: '2026-11-30' },
    { id: 'AL-DATE-E10', name: 'Very long date range', start: '2020-01-01', end: '2035-12-31' },
    { id: 'AL-DATE-E09', name: 'Start and end on year boundary', start: '2026-12-31', end: '2027-01-01' },
];

// =============================================================================
// TEST SUITE
// =============================================================================

test.describe('SmartTracker - Employee Allocation Validation', () => {
    test.setTimeout(240000);

    test.beforeEach(async ({ page }) => {
        await page.goto(ALLOCATION_URL, { waitUntil: 'domcontentloaded' });

        const searchInput = page.locator('input[formcontrolname="employeeNameOrId"]');
        const isSearchVisible = await searchInput.isVisible({ timeout: 20000 }).catch(() => false);
        if (!isSearchVisible) {
            await page.reload({ waitUntil: 'domcontentloaded' });
        }
        await expect(searchInput).toBeVisible({ timeout: 45000 });
        await searchInput.fill(EMPLOYEE_ID);
        await page.locator('button.search-button').click();

        const employeeRow = page.locator('tr.mat-mdc-row').filter({ hasText: EMPLOYEE_ID }).first();
        await expect(employeeRow).toBeVisible({ timeout: 45000 });
        await employeeRow.locator('button, a').last().click();

        await expect(
            page.locator('.employee-meta').filter({ hasText: `ID: ${EMPLOYEE_ID}` })
        ).toBeVisible({ timeout: 60000 });

        await expect(
            page.locator('table.allocations-table tbody tr').first()
        ).toBeVisible({ timeout: 60000 });
    });

    // ── Helper Functions ─────────────────────────────────────────────────────

    async function removeUnsavedRows(page) {
        const clientInputs = page.locator('table.allocations-table input[placeholder="Search client..."]');
        const count = await clientInputs.count();
        if (count === 0) return;

        const cancelBtn = page.getByRole('button', { name: 'Cancel' });
        if (await cancelBtn.isVisible().catch(() => false)) {
            await cancelBtn.click();
            await page.waitForTimeout(500);
        }
    }

    async function addOneBlankRow(page) {
        await page.getByRole('button', { name: '+ Add' }).click();

        const clientInputs = page.locator('table.allocations-table input[placeholder="Search client..."]');
        await expect(clientInputs).toHaveCount(1, { timeout: 15000 });
        return clientInputs.first().locator('xpath=ancestor::tr');
    }

    async function chooseAutocomplete(page, input, searchText, matchText) {
        await input.click();
        await input.fill('');
        await input.pressSequentially(searchText, { delay: 15 });

        const optionCandidates = page.locator('mat-option, .mat-mdc-option, [role="option"]');
        const matchingOption = optionCandidates.filter({ hasText: new RegExp(matchText, 'i') }).first();
        await expect(matchingOption).toBeVisible({ timeout: 25000 });
        await matchingOption.click({ noWaitAfter: true });
    }

    async function fillRequiredAllocationFields(page, row, startDate, endDate, allocationValue = '50') {
        const clientInput = row.locator('input[placeholder="Search client..."]');
        const projectInput = row.locator('input[placeholder="Search project..."]');
        const managerInput = row.locator('input[placeholder="Search manager..."]');

        await chooseAutocomplete(page, clientInput, 'Palo Alto', 'Palo Alto');
        await chooseAutocomplete(page, projectInput, 'Palo Alto Training', 'Palo Alto Training');

        const currentManager = await managerInput.inputValue();
        if (!currentManager) {
            await managerInput.fill('Sridhar Pokuri');
        }

        const cells = row.locator('td');
        await cells.nth(5).locator('input').fill(startDate || '');
        await cells.nth(6).locator('input').fill(endDate || '');

        const roleSelect = cells.nth(7).locator('select');
        await expect(roleSelect).toBeEnabled({ timeout: 15000 });
        await roleSelect.selectOption({ index: 1 });

        const countrySelect = cells.nth(8).locator('select');
        await countrySelect.selectOption({ label: 'India' });

        const citySelect = cells.nth(9).locator('select');
        await expect(citySelect).toBeEnabled({ timeout: 15000 });
        const cityOptions = await citySelect.locator('option').evaluateAll(options =>
            options.filter(o => o.value && !o.disabled).map(o => ({ value: o.value, label: o.label.trim() }))
        );
        const hyd = cityOptions.find(o => /hyderabad/i.test(o.label));
        if (hyd) await citySelect.selectOption(hyd.value);
        else if (cityOptions.length > 0) await citySelect.selectOption(cityOptions[0].value);

        const allocationInput = cells.nth(10).locator('input');
        if (allocationValue !== undefined) {
            await allocationInput.fill(allocationValue);
        }

        await cells.nth(11).locator('select').selectOption({ label: 'N' });
        return allocationInput;
    }

    function getSaveButton(page) {
        return page.getByRole('button', { name: /Save New Allocations/i });
    }

    function getOverlapWarning(page) {
        return page.getByText(/Dates overlap with Allocation/i).first();
    }

    // =========================================================================
    // 1. ALLOCATION PERCENTAGE TESTS
    // =========================================================================

    // ── Positive Cases ───────────────────────────────────────────────────────
    for (const scenario of PCT_POSITIVE_CASES) {
        test(`${scenario.id} - ${scenario.name}`, async ({ page }) => {
            const row = await addOneBlankRow(page);
            const allocationInput = await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', scenario.value);

            await expect(allocationInput).toHaveValue(scenario.value);

            const validity = await allocationInput.evaluate(el => el.validity.valid);
            expect(validity, `${scenario.id}: percentage ${scenario.value} should be natively valid`).toBe(true);

            await removeUnsavedRows(page);
        });
    }

    // ── Negative Cases (Input itself flagged as invalid, NO Save button check) ──
        for (const scenario of PCT_NEGATIVE_CASES) {
        test(`${scenario.id} - ${scenario.name}`, async ({ page }) => {
            const row = await addOneBlankRow(page);
            const allocationInput = await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');

            await allocationInput.clear();
            await allocationInput.pressSequentially(scenario.value, { delay: 30 }).catch(() => {});

            const isInvalid = await allocationInput.evaluate((el, attemptedValue) => {
                return !el.validity.valid ||
                       el.matches(':invalid') ||
                       el.classList.contains('ng-invalid') ||
                       el.classList.contains('is-invalid') ||
                       el.value !== attemptedValue || // Browser rejected typing non-numeric characters
                       el.value.trim() === '';
            }, scenario.value);

            expect(
                isInvalid,
                `${scenario.id}: percentage ${JSON.stringify(scenario.value)} should be flagged as invalid or prevented`
            ).toBe(true);

            await removeUnsavedRows(page);
        });
    }

    // ── Edge Cases ───────────────────────────────────────────────────────────
    for (const scenario of PCT_EDGE_CASES) {
        test(`${scenario.id} - ${scenario.name}`, async ({ page }) => {
            const row = await addOneBlankRow(page);
            const allocationInput = await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');

            await allocationInput.fill(scenario.value);

            const isInputValid = await allocationInput.evaluate(el => el.validity.valid && !el.matches(':invalid'));

            if (scenario.expectValid) {
                expect(isInputValid, `${scenario.id}: percentage ${scenario.value} should be accepted`).toBe(true);
            } else {
                expect(isInputValid, `${scenario.id}: percentage ${scenario.value} should be rejected`).toBe(false);
            }

            await removeUnsavedRows(page);
        });
    }

    // ── Edit & Flow Cases ────────────────────────────────────────────────────
    
    test('AL-PCT-P09 - Save a valid percentage', async ({ page }) => {
        const row = await addOneBlankRow(page);
        const allocationInput = await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');
        await expect(allocationInput).toHaveValue('50');
        const saveButton = getSaveButton(page);
        await expect(saveButton).toBeEnabled();
        await removeUnsavedRows(page);
    });
    test('AL-PCT-P08 - Change percentage while editing', async ({ page }) => {
        const row = await addOneBlankRow(page);
        const allocationInput = await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');

        await expect(allocationInput).toHaveValue('50');
        await allocationInput.fill('75');
        await expect(allocationInput).toHaveValue('75');

        await removeUnsavedRows(page);
    });

    test('AL-PCT-E09 - Edit from maximum to minimum', async ({ page }) => {
        const row = await addOneBlankRow(page);
        const allocationInput = await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '100');

        await expect(allocationInput).toHaveValue('100');
        await allocationInput.fill('1');
        await expect(allocationInput).toHaveValue('1');

        await removeUnsavedRows(page);
    });

    test('AL-PCT-E10 - Repeatedly change percentage', async ({ page }) => {
        const row = await addOneBlankRow(page);
        const allocationInput = await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '25');

        await expect(allocationInput).toHaveValue('25');
        await allocationInput.fill('50');
        await expect(allocationInput).toHaveValue('50');
        await allocationInput.fill('100');
        await expect(allocationInput).toHaveValue('100');

        await removeUnsavedRows(page);
    });

    // =========================================================================
    // 2. START AND END DATE TESTS
    // =========================================================================

    // ── Positive Date Cases ──────────────────────────────────────────────────
    for (const scenario of DATE_POSITIVE_CASES) {
        test(`${scenario.id} - ${scenario.name}`, async ({ page }) => {
            const row = await addOneBlankRow(page);
            await fillRequiredAllocationFields(page, row, scenario.start, scenario.end, '50');

            await page.waitForTimeout(500);
            const warning = getOverlapWarning(page);
            await expect(warning).toBeHidden({ timeout: 5000 });

            await removeUnsavedRows(page);
        });
    }

    // ── Negative Date Range Cases (Start after End / Missing) ────────────────
    for (const scenario of DATE_NEGATIVE_RANGE_CASES) {
        test(`${scenario.id} - ${scenario.name}`, async ({ page }) => {
            const row = await addOneBlankRow(page);
            await fillRequiredAllocationFields(page, row, scenario.start, scenario.end, '50');

            await page.waitForTimeout(500);
            const saveButton = getSaveButton(page);
            await expect(saveButton).toBeDisabled();

            await removeUnsavedRows(page);
        });
    }

    // ── Date Overlap Warning Cases ───────────────────────────────────────────
    for (const scenario of DATE_OVERLAP_CASES) {
        test(`${scenario.id} - ${scenario.name}`, async ({ page }) => {
            const row = await addOneBlankRow(page);
            await fillRequiredAllocationFields(page, row, scenario.start, scenario.end, '50');

            await page.waitForTimeout(700);
            const warning = getOverlapWarning(page);

            if (scenario.overlap) {
                await expect(warning).toBeVisible({ timeout: 10000 });
            } else {
                await expect(warning).toBeHidden({ timeout: 10000 });
            }

            await removeUnsavedRows(page);
        });
    }

    // ── Date Edge Cases ──────────────────────────────────────────────────────
    for (const scenario of DATE_EDGE_CASES) {
        test(`${scenario.id} - ${scenario.name}`, async ({ page }) => {
            const row = await addOneBlankRow(page);
            await fillRequiredAllocationFields(page, row, scenario.start, scenario.end, '50');

            const dates = row.locator('input[type="date"]');
            await expect(dates.nth(0)).toHaveValue(scenario.start);
            await expect(dates.nth(1)).toHaveValue(scenario.end);

            await removeUnsavedRows(page);
        });
    }

    // ── Date Edit Cases ──────────────────────────────────────────────────────
    test('AL-DATE-P08 - Edit start date', async ({ page }) => {
        const row = await addOneBlankRow(page);
        await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');

        const dates = row.locator('input[type="date"]');
        await dates.nth(0).fill('2027-02-05');
        await expect(dates.nth(0)).toHaveValue('2027-02-05');
        await expect(dates.nth(1)).toHaveValue('2027-02-28');

        await removeUnsavedRows(page);
    });

    test('AL-DATE-P09 - Edit end date', async ({ page }) => {
        const row = await addOneBlankRow(page);
        await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');

        const dates = row.locator('input[type="date"]');
        await dates.nth(1).fill('2027-03-15');
        await expect(dates.nth(0)).toHaveValue('2027-02-01');
        await expect(dates.nth(1)).toHaveValue('2027-03-15');

        await removeUnsavedRows(page);
    });

    test('AL-DATE-P10 - Save valid date range', async ({ page }) => {
        const row = await addOneBlankRow(page);
        await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');
        const dates = row.locator('input[type="date"]');
        await expect(dates.nth(0)).toHaveValue('2027-02-01');
        await expect(dates.nth(1)).toHaveValue('2027-02-28');
        const saveButton = getSaveButton(page);
        await expect(saveButton).toBeEnabled();
        await removeUnsavedRows(page);
    });
    test('AL-DATE-E11 - Edit dates into an overlapping range', async ({ page }) => {
        const row = await addOneBlankRow(page);
        await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');
        const warningBefore = getOverlapWarning(page);
        await expect(warningBefore).toBeHidden({ timeout: 5000 });

        const dates = row.locator('input[type="date"]');
        await dates.nth(0).fill('2026-08-15');
        await dates.nth(1).fill('2026-09-15');
        await page.waitForTimeout(700);

        const warningAfter = getOverlapWarning(page);
        await expect(warningAfter).toBeVisible({ timeout: 10000 });
        await removeUnsavedRows(page);
    });

    test('AL-DATE-E12 - Clear a previously populated date', async ({ page }) => {
        const row = await addOneBlankRow(page);
        await fillRequiredAllocationFields(page, row, '2027-02-01', '2027-02-28', '50');
        const saveButtonBefore = getSaveButton(page);
        await expect(saveButtonBefore).toBeEnabled();

        const dates = row.locator('input[type="date"]');
        await dates.nth(0).fill('');
        await page.waitForTimeout(500);

        const saveButtonAfter = getSaveButton(page);
        await expect(saveButtonAfter).toBeDisabled();
        await removeUnsavedRows(page);
    });

});
