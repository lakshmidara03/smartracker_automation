const { test, expect } = require('@playwright/test');

// SOW Owner Management - UI Automation
// Project: SmartTracker
// Run:
// npx playwright test tests/Admin/sow-owner/sow-owner-ui.spec.js --workers=1
//
// Optional:
// $env:BASE_URL = "http://localhost:4200"
//
// IMPORTANT:
// 1. Delete tests create and delete only their own demo records.
// 2. Unexpected errors and assertion failures must remain visible.
// 3. Selectors and validation messages must match the actual application DOM.

const BASE_URL = (
    process.env.BASE_URL || 'http://localhost:4200'
).replace(/\/$/, '');

const CLIENT_URL = `${BASE_URL}/admin/sow-owner/client`;
const RELANTO_URL = `${BASE_URL}/admin/sow-owner/relanto`;

function uniqueName(prefix) {
    return `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

// --------------------------------------------------
// NAVIGATION HELPERS
// --------------------------------------------------

async function openClientOwners(page) {
    await page.goto(CLIENT_URL);
    await expect(
        page.getByText('SOW Owner Management', { exact: true })
    ).toBeVisible();

    await expect(
        page.getByText('Client SOW Owners', { exact: true })
    ).toBeVisible();
}

async function openRelantoOwners(page) {
    await page.goto(RELANTO_URL);
    await expect(
        page.getByText('SOW Owner Management', { exact: true })
    ).toBeVisible();

    await expect(
        page.getByText('Relanto SOW Owners', { exact: true })
    ).toBeVisible();
}

// --------------------------------------------------
// LOCATORS
// --------------------------------------------------

function clientDropdown(page) {
    return page.locator('select').first();
}

function clientOwnerInput(page) {
    return page.getByPlaceholder(
        'Enter Client SoW Owner name',
        { exact: true }
    );
}

function relantoOwnerInput(page) {
    return page.getByPlaceholder(
        'Enter Relanto SoW Owner Name',
        { exact: true }
    );
}

function clientAddButton(page) {
    return page.getByRole('button', {
        name: /Add Client SOW Owner/i
    });
}

function clientUpdateButton(page) {
    return page.getByRole('button', {
        name: /Update Client SOW Owner/i
    });
}

function relantoAddButton(page) {
    return page.getByRole('button', {
        name: /Add RelantoSow/i
    });
}

function relantoUpdateButton(page) {
    return page.getByRole('button', {
        name: /Update RelantoSow/i
    });
}

async function selectValidClient(page) {
    const dropdown = clientDropdown(page);

    await expect(dropdown).toBeVisible();

    const options = await dropdown.locator('option').evaluateAll(
        elements =>
            elements.map(option => ({
                value: option.value,
                text: option.textContent.trim()
            }))
    );

    const client = options.find(
        option =>
            option.value.trim() !== '' &&
            !/^select a client$/i.test(option.text)
    );

    expect(
        client,
        `Expected a valid client option. Actual options: ${JSON.stringify(options)}`
    ).toBeTruthy();

    await dropdown.selectOption(client.value);
    await expect(dropdown).toHaveValue(client.value);

    return client;
}

async function findUniqueRow(page, name) {
    const row = page.locator('tbody tr').filter({
        hasText: name
    });

    await expect(
        row,
        `Expected exactly one row containing "${name}"`
    ).toHaveCount(1);

    return row;
}

// Handles either a browser confirmation dialog or an application modal dialog.
async function cancelDeleteModal(page, row) {
    const dialogPromise = page.waitForEvent('dialog', { timeout: 1000 }).catch(() => null);
    await row.getByRole('button', { name: /^Delete$/i }).click();

    const dialog = await dialogPromise;
    if (dialog) {
        await dialog.dismiss();
        return;
    }

    const noButton = page.getByRole('button', { name: /^(No|Cancel)$/i }).last();
    await expect(noButton).toBeVisible({ timeout: 5000 });
    await noButton.click();
}

async function confirmDeleteModal(page, row) {
    const dialogPromise = page.waitForEvent('dialog', { timeout: 1000 }).catch(() => null);
    await row.getByRole('button', { name: /^Delete$/i }).click();

    const dialog = await dialogPromise;
    if (dialog) {
        await dialog.accept();
        return;
    }

    const yesButton = page.getByRole('button', { name: /^(Yes|Confirm|Delete)$/i }).last();
    await expect(yesButton).toBeVisible({ timeout: 5000 });
    await yesButton.click();
}

// ==================================================
// TEST SUITE
// ==================================================

test.describe('Admin - SOW Owner Management UI', () => {

    // -----------------------------------------------
    // 1. PAGE LOADING AND NAVIGATION
    // -----------------------------------------------

    test('SOW-UI-001: Client SOW Owners page loads', async ({ page }) => {
        await openClientOwners(page);

        await expect(clientDropdown(page)).toBeVisible();
        await expect(clientOwnerInput(page)).toBeVisible();
        await expect(clientAddButton(page)).toBeVisible();
        await expect(page.locator('table')).toBeVisible();
    });

    test('SOW-UI-002: Relanto SOW Owners page loads', async ({ page }) => {
        await openRelantoOwners(page);

        await expect(relantoOwnerInput(page)).toBeVisible();
        await expect(relantoAddButton(page)).toBeVisible();
        await expect(page.locator('table')).toBeVisible();
    });

    test('SOW-UI-003: Switch between both owner tabs', async ({ page }) => {
        await openClientOwners(page);

        await page.getByText('Relanto SOW Owners', {
            exact: true
        }).click();

        await expect(relantoOwnerInput(page)).toBeVisible();

        await page.getByText('Client SOW Owners', {
            exact: true
        }).click();

        await expect(clientOwnerInput(page)).toBeVisible();
        await expect(clientDropdown(page)).toBeVisible();
    });

    test('SOW-UI-004: Refresh the client owners page', async ({ page }) => {
        await openClientOwners(page);

        await page.reload();

        await expect(
            page.getByText('SOW Owner Management', { exact: true })
        ).toBeVisible();

        await expect(clientOwnerInput(page)).toBeVisible();
        await expect(page.locator('table')).toBeVisible();
    });

    // -----------------------------------------------
    // 2. CLIENT SOW OWNER POSITIVE TESTS
    // -----------------------------------------------

    test('SOW-UI-010: Create a demo client SOW owner', async ({ page }) => {
        await openClientOwners(page);

        const demoName = uniqueName('AUTO_DEMO_CLIENT');

        await selectValidClient(page);
        await clientOwnerInput(page).fill(demoName);
        await clientAddButton(page).click();

        const row = await findUniqueRow(page, demoName);

        await expect(row).toContainText(demoName);
    });

    test('SOW-UI-011: Edit a demo client SOW owner', async ({ page }) => {
        await openClientOwners(page);

        const originalName = uniqueName('AUTO_DEMO_CLIENT_EDIT');
        const updatedName = uniqueName('AUTO_DEMO_CLIENT_UPD');

        await selectValidClient(page);
        await clientOwnerInput(page).fill(originalName);
        await clientAddButton(page).click();

        const row = await findUniqueRow(page, originalName);

        await row.getByRole('button', {
            name: /^Edit$/i
        }).click();

        await expect(clientOwnerInput(page)).toHaveValue(originalName);

        await clientOwnerInput(page).fill(updatedName);
        await clientUpdateButton(page).click();

        const updatedRow = await findUniqueRow(page, updatedName);
        await expect(updatedRow).toContainText(updatedName);

        await expect(
            page.locator('tbody tr').filter({ hasText: originalName })
        ).toHaveCount(0);
    });

    test('SOW-UI-012: Cancel client owner edit', async ({ page }) => {
        await openClientOwners(page);

        const originalName = uniqueName('AUTO_DEMO_CLIENT_CANCEL');

        await selectValidClient(page);
        await clientOwnerInput(page).fill(originalName);
        await clientAddButton(page).click();

        const row = await findUniqueRow(page, originalName);

        await row.getByRole('button', {
            name: /^Edit$/i
        }).click();

        await clientOwnerInput(page).fill(`${originalName}_UNSAVED`);

        await page.getByRole('button', {
            name: /^Cancel$/i
        }).click();

        await findUniqueRow(page, originalName);

        await expect(
            page.locator('tbody tr').filter({
                hasText: `${originalName}_UNSAVED`
            })
        ).toHaveCount(0);
    });

    // -----------------------------------------------
    // 3. CLIENT SOW OWNER NEGATIVE TESTS
    // -----------------------------------------------

    test('SOW-UI-020: Client owner name is required', async ({ page }) => {
        await openClientOwners(page);

        await selectValidClient(page);
        await clientOwnerInput(page).fill('');
        await clientAddButton(page).click();

        await expect(
            page.getByText(/owner.*required|required.*owner/i).first()
        ).toBeVisible();
    });

    test('SOW-UI-021: Client owner name cannot be whitespace only', async ({ page }) => {
        await openClientOwners(page);

        await selectValidClient(page);
        await clientOwnerInput(page).fill('     ');
        await clientAddButton(page).click();

        const errorMsg = page.getByText(/owner.*required|required.*owner|valid.*owner|name.*required/i).first();
        const isErrorVisible = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false);
        if (!isErrorVisible) {
            const whitespaceRows = page.locator('tbody tr td:first-child').filter({ hasText: /^\s*$/ });
            expect(await whitespaceRows.count()).toBe(0);
        } else {
            await expect(errorMsg).toBeVisible();
        }
    });

    test('SOW-UI-022: Client selection is required', async ({ page }) => {
        await openClientOwners(page);

        await clientOwnerInput(page).fill(uniqueName('AUTO_NO_CLIENT'));
        await clientDropdown(page).selectOption({ index: 0 });

        await clientAddButton(page).click();

        await expect(
            page.getByText(/client is required|required.*client/i).first()
        ).toBeVisible();
    });

    // -----------------------------------------------
    // 4. CLIENT OWNER DEMO DELETE
    // -----------------------------------------------

    test('SOW-UI-030: Delete only a newly created demo client owner', async ({ page }) => {
        await openClientOwners(page);

        const demoName = uniqueName('AUTO_DEMO_CLIENT_DEL');

        await selectValidClient(page);
        await clientOwnerInput(page).fill(demoName);
        await clientAddButton(page).click();

        let row = await findUniqueRow(page, demoName);

        // Cancel deletion first and verify that the row remains.
        await cancelDeleteModal(page, row);

        await findUniqueRow(page, demoName);

        // Confirm deletion of this test-created record only.
        row = await findUniqueRow(page, demoName);
        await confirmDeleteModal(page, row);

        await expect(
            page.locator('tbody tr').filter({ hasText: demoName })
        ).toHaveCount(0);

        await page.reload();

        await expect(
            page.locator('tbody tr').filter({ hasText: demoName })
        ).toHaveCount(0);
    });

    // -----------------------------------------------
    // 5. RELANTO SOW OWNER POSITIVE TESTS
    // -----------------------------------------------

    test('SOW-UI-040: Create a demo Relanto SOW owner', async ({ page }) => {
        await openRelantoOwners(page);

        const demoName = uniqueName('AUTO_DEMO_RELANTO');

        await relantoOwnerInput(page).fill(demoName);
        await relantoAddButton(page).click();

        const row = await findUniqueRow(page, demoName);

        await expect(row).toContainText(demoName);
    });

    test('SOW-UI-041: Edit a demo Relanto SOW owner', async ({ page }) => {
        await openRelantoOwners(page);

        const originalName = uniqueName('AUTO_DEMO_RELANTO_EDIT');
        const updatedName = uniqueName('AUTO_DEMO_RELANTO_UPD');

        await relantoOwnerInput(page).fill(originalName);
        await relantoAddButton(page).click();

        const row = await findUniqueRow(page, originalName);

        await row.getByRole('button', {
            name: /^Edit$/i
        }).click();

        await expect(relantoOwnerInput(page)).toHaveValue(originalName);

        await relantoOwnerInput(page).fill(updatedName);

        await page.getByRole('button', {
            name: /Update RelantoSow/i
        }).click();

        await findUniqueRow(page, updatedName);

        await expect(
            page.locator('tbody tr').filter({ hasText: originalName })
        ).toHaveCount(0);
    });

    test('SOW-UI-042: Cancel Relanto owner edit', async ({ page }) => {
        await openRelantoOwners(page);

        const originalName = uniqueName('AUTO_DEMO_RELANTO_CANCEL');

        await relantoOwnerInput(page).fill(originalName);
        await relantoAddButton(page).click();

        const row = await findUniqueRow(page, originalName);

        await row.getByRole('button', {
            name: /^Edit$/i
        }).click();

        await relantoOwnerInput(page).fill(`${originalName}_UNSAVED`);

        await page.getByRole('button', {
            name: /^Cancel$/i
        }).click();

        await findUniqueRow(page, originalName);

        await expect(
            page.locator('tbody tr').filter({
                hasText: `${originalName}_UNSAVED`
            })
        ).toHaveCount(0);
    });

    // -----------------------------------------------
    // 6. RELANTO SOW OWNER NEGATIVE TESTS
    // -----------------------------------------------

    test('SOW-UI-050: Relanto owner name is required', async ({ page }) => {
        await openRelantoOwners(page);

        await relantoOwnerInput(page).fill('');
        await relantoAddButton(page).click();

        await expect(
            page.getByText(/name is required|required.*name/i).first()
        ).toBeVisible();
    });

    test('SOW-UI-051: Relanto owner name cannot be whitespace only', async ({ page }) => {
        await openRelantoOwners(page);

        await relantoOwnerInput(page).fill('     ');
        await relantoAddButton(page).click();

        const errorMsg = page.getByText(/name is required|required.*name|valid.*name|owner.*required/i).first();
        const isErrorVisible = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false);
        if (!isErrorVisible) {
            const whitespaceRows = page.locator('tbody tr td:first-child').filter({ hasText: /^\s*$/ });
            expect(await whitespaceRows.count()).toBe(0);
        } else {
            await expect(errorMsg).toBeVisible();
        }
    });

    // -----------------------------------------------
    // 7. RELANTO OWNER DEMO DELETE
    // -----------------------------------------------

    test('SOW-UI-060: Delete only a newly created demo Relanto owner', async ({ page }) => {
        await openRelantoOwners(page);

        const demoName = uniqueName('AUTO_DEMO_RELANTO_DEL');

        await relantoOwnerInput(page).fill(demoName);
        await relantoAddButton(page).click();

        let row = await findUniqueRow(page, demoName);

        // Cancel first to validate that cancellation preserves the record.
        await cancelDeleteModal(page, row);

        await findUniqueRow(page, demoName);

        // Confirm deletion of the demo record.
        row = await findUniqueRow(page, demoName);
        await confirmDeleteModal(page, row);

        await expect(
            page.locator('tbody tr').filter({ hasText: demoName })
        ).toHaveCount(0);

        await page.reload();

        await expect(
            page.locator('tbody tr').filter({ hasText: demoName })
        ).toHaveCount(0);
    });
});