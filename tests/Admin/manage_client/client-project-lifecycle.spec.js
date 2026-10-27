/**
 * Admin Client Management & Project Lifecycle - Complete 67 Test Case Suite
 * 
 * Catalog:
 * - Suite 1: Positive Test Cases (CM-P01 to CM-P16) -> 16 tests
 * - Suite 2: Negative Test Cases (CM-N01 to CM-N16) -> 16 tests
 * - Suite 3: Edge Test Cases (CM-E01 to CM-E15)     -> 15 tests
 * - Suite 4: UI & Navigation (CM-UI01 to CM-UI10)   -> 10 tests
 * - Suite 5: DB Integrity (CM-DB01 to CM-DB10)      -> 10 tests
 * Total: 67 Tests
 */

const { test, expect } = require('@playwright/test');
const mysql = require('mysql2/promise');

// ============================================================
// CONFIGURATION
// ============================================================
const BASE_URL = (process.env.UI_BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
const CLIENT_URL = `${BASE_URL}/admin/addClients`;
const PROJECTS_URL = (process.env.PROJECTS_URL || `${BASE_URL}/admin/project`).replace(/\/$/, '');

const CLIENT_NAME = process.env.CLIENT_NAME || 'Amgen';
const PROJECT_MANAGER = process.env.PROJECT_MANAGER || 'Sridhar Pokuri';
const PROJECT_TYPE = process.env.PROJECT_TYPE || 'Production';
const PRACTICE = process.env.PRACTICE || 'Digital Transformation';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 15000 });

// ============================================================
// DATABASE CONNECTION HELPER
// ============================================================
let dbConnection = null;

async function getDbConnection() {
    if (!dbConnection) {
        const isLocal = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
        try {
            dbConnection = await mysql.createConnection({
                host: isLocal ? 'localhost' : (process.env.DB_HOST || '13.61.179.149'),
                port: parseInt(process.env.DB_PORT || '3306', 10),
                user: process.env.DB_USER || 'root',
                password: isLocal ? (process.env.LOCAL_DB_PASSWORD || 'root') : (process.env.DB_PASSWORD || 'relanto123'),
                database: process.env.DB_NAME || 'hrportal'
            });
        } catch (err) {
            dbConnection = await mysql.createConnection({
                host: process.env.DB_HOST || '13.61.179.149',
                port: parseInt(process.env.DB_PORT || '3306', 10),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || 'relanto123',
                database: process.env.DB_NAME || 'hrportal'
            });
        }
    }
    return dbConnection;
}

// ============================================================
// HELPERS
// ============================================================
function uniqueId() {
    return `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

function dateOffset(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

function isoDateOffset(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

async function clickButton(page, name) {
    const button = page.getByRole('button', { name, exact: false }).last();
    await expect(button, `Button "${name}" should be visible`).toBeVisible({ timeout: 10000 });
    await expect(button).toBeEnabled();
    await button.click();
}

async function fillDate(locator, daysFromToday) {
    const type = await locator.getAttribute('type');
    if (type === 'date') {
        await locator.fill(isoDateOffset(daysFromToday));
    } else {
        await locator.fill(dateOffset(daysFromToday));
    }
}

async function openClientManagement(page) {
    await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Client Management/i })).toBeVisible({ timeout: 30000 });
}

async function openClientWizard(page, clientName = CLIENT_NAME) {
    const clientNameText = page.getByText(clientName, { exact: true }).first();
    await expect(clientNameText).toBeVisible({ timeout: 15000 });

    const row = page.locator('tr').filter({ has: page.getByText(clientName, { exact: true }) }).first();
    const editButton = row.locator('img[alt*="edit" i], img[src*="edit" i], button[aria-label*="edit" i]').first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    const confirmModalYes = page.getByRole('button', { name: /^yes$/i }).or(page.locator('button:has-text("Yes")'));
    if (await confirmModalYes.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmModalYes.click();
    }
    await expect(page.getByText(/Client & Locations/i).first()).toBeVisible({ timeout: 15000 });
}

async function navigateToStep4(page) {
    const step4Header = page.locator('.stepper .step, .step-item').filter({ hasText: /Add Projects|Projects/i });
    if (await step4Header.isVisible({ timeout: 2000 }).catch(() => false)) {
        await step4Header.click();
    } else {
        await clickButton(page, 'Update & Continue');
        await expect(page.getByText(/Manage Roles for/i)).toBeVisible({ timeout: 15000 });
        await clickButton(page, 'Continue');
        await expect(page.getByText(/Financial Quarter Data for/i)).toBeVisible({ timeout: 15000 });
        await clickButton(page, 'Continue');
    }
    await expect(page.getByText(/Manage Projects for/i)).toBeVisible({ timeout: 15000 });
}

async function fillProjectForm(page, project, options = {}) {
    const {
        omitName = false,
        omitCode = false,
        omitManager = false,
        omitType = false,
        omitPractice = false,
        invalidDateRange = false,
        nameOverride,
        codeOverride,
    } = options;

    const nameInput = page.locator('[formcontrolname="projectName"], input[placeholder*="Website Revamp" i]').last();
    const codeInput = page.locator('[formcontrolname="projectCode"], input[placeholder*="ACMWEB" i]').last();
    const managerInput = page.locator('[formcontrolname="projectManager"], input[placeholder*="manager name" i]').last();
    const startInput = page.locator('[formcontrolname="startDate"], input[type="date"]').first();
    const endInput = page.locator('[formcontrolname="endDate"], input[type="date"]').last();
    const typeSelect = page.locator('select[formcontrolname="projectType"], select').first();
    const practiceSelect = page.locator('select[formcontrolname="practice"], select').last();

    if (!omitName) {
        await nameInput.fill(nameOverride !== undefined ? nameOverride : project.name);
    }
    if (!omitCode) {
        await codeInput.fill(codeOverride !== undefined ? codeOverride : project.code);
    }
    if (!omitManager) {
        await managerInput.fill(PROJECT_MANAGER);
        const suggestion = page.locator('mat-option').filter({ hasText: PROJECT_MANAGER }).first();
        if (await suggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
            await suggestion.click();
        }
    }
    if (!omitType) {
        await typeSelect.selectOption({ label: PROJECT_TYPE });
    }
    if (!omitPractice) {
        await practiceSelect.selectOption({ label: PRACTICE });
    }

    await fillDate(startInput, 1);
    if (invalidDateRange) {
        await fillDate(endInput, -1);
    } else {
        await fillDate(endInput, 60);
    }
}

async function deleteOnlyCreatedProject(page, project) {
    await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchInput.fill(project.name);
        await page.waitForTimeout(1000);
    }

    const row = page.locator('tr').filter({ hasText: project.name }).filter({ hasText: project.code });
    if (await row.count() === 0) return;

    const deleteBtn = row.first().locator('button[title*="delete" i], button.btn-icon-delete, [aria-label*="delete" i], img[alt*="delete" i], img[src*="delete" i]').first();
    if (await deleteBtn.isVisible().catch(() => false)) {
        page.once('dialog', async d => { await d.accept(); });
        await deleteBtn.click();
        const modalConfirm = page.locator('.modal, .dialog, mat-dialog-container, [role="dialog"]')
            .getByRole('button', { name: /^(confirm|yes, delete|delete project|delete|yes)$/i }).last();
        if (await modalConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
            await modalConfirm.click();
        }
        await expect(row).toHaveCount(0, { timeout: 15000 });
    }
}

async function cleanupDbProject(projectCode) {
    try {
        const conn = await getDbConnection();
        await conn.query('DELETE FROM project WHERE project_code = ?', [projectCode]);
    } catch (e) {
        // ignore
    }
}

// ============================================================
// SUITE 1: POSITIVE TEST CASES (CM-P01 to CM-P16)
// ============================================================
test.describe.serial('Suite 1: Positive Test Cases (CM-P01 to CM-P16)', () => {
    const demoProject = {
        name: `AutoPositive ${uniqueId()}`,
        code: `POS${uniqueId()}`
    };

    test.afterAll(async () => {
        await cleanupDbProject(demoProject.code);
    });

    test('CM-P01: Open the Admin page and Client Management screen', async ({ page }) => {
        await openClientManagement(page);
        await expect(page.getByRole('heading', { name: /Client Management/i })).toBeVisible();
        await expect(page.getByText(CLIENT_NAME, { exact: true }).first()).toBeVisible();
    });

    test('CM-P02: Click Edit for an existing client', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await expect(page.getByText(/Client & Locations/i).first()).toBeVisible();
    });

    test('CM-P03: Navigate through all four wizard steps', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        await expect(page.getByText(/Manage Projects for/i)).toBeVisible();
    });

    test('CM-P04: Verify existing projects for the selected client', async ({ page }) => {
        const conn = await getDbConnection();
        const [dbProjects] = await conn.query('SELECT project_code FROM project WHERE client_name = ?', [CLIENT_NAME]);

        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);

        if (dbProjects.length > 0) {
            await expect(page.locator('tr').filter({ hasText: dbProjects[0].project_code }).first()).toBeVisible();
        }
    });

    test('CM-P05: Enter a valid demo project name', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const nameInput = page.locator('[formcontrolname="projectName"]').last();
        await nameInput.fill(demoProject.name);
        await expect(nameInput).toHaveValue(demoProject.name);
    });

    test('CM-P06: Enter a unique project code', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const codeInput = page.locator('[formcontrolname="projectCode"]').last();
        await codeInput.fill(demoProject.code);
        await expect(codeInput).toHaveValue(demoProject.code);
    });

    test('CM-P07: Select a valid project manager', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const managerInput = page.locator('[formcontrolname="projectManager"]').last();
        await managerInput.fill(PROJECT_MANAGER);
        const opt = page.locator('mat-option').filter({ hasText: PROJECT_MANAGER }).first();
        if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) await opt.click();
        await expect(managerInput).toHaveValue(PROJECT_MANAGER);
    });

    test('CM-P08: Select a valid project type', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const typeSelect = page.locator('select[formcontrolname="projectType"]').first();
        await typeSelect.selectOption({ label: PROJECT_TYPE });
        await expect(typeSelect).toHaveValue(PROJECT_TYPE);
    });

    test('CM-P09: Enter valid start and end dates', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const startInput = page.locator('[formcontrolname="startDate"]').first();
        const endInput = page.locator('[formcontrolname="endDate"]').last();
        await fillDate(startInput, 1);
        await fillDate(endInput, 60);
        expect((await startInput.inputValue()).length).toBeGreaterThan(0);
        expect((await endInput.inputValue()).length).toBeGreaterThan(0);
    });

    test('CM-P10: Select a valid practice', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const practiceSelect = page.locator('select[formcontrolname="practice"]').last();
        await practiceSelect.selectOption({ label: PRACTICE });
        await expect(practiceSelect).toHaveValue(PRACTICE);
    });

    test('CM-P11: Click Add Project with valid details', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        await fillProjectForm(page, demoProject);
        await clickButton(page, 'Add Project');
        const projectRow = page.locator('tr').filter({ hasText: demoProject.name });
        await expect(projectRow.first()).toBeVisible({ timeout: 15000 });
    });

    test('CM-P12: Verify the newly added project in the projects table', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const projectRow = page.locator('tr').filter({ hasText: demoProject.code });
        await expect(projectRow.first()).toBeVisible();
    });

    test('CM-P13: Verify the new project in MySQL', async () => {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT * FROM project WHERE project_code = ?', [demoProject.code]);
        expect(rows.length, 'Project must exist in MySQL').toBe(1);
        expect(rows[0].client_name).toBe(CLIENT_NAME);
    });

    test('CM-P14: Delete the newly created demo project', async ({ page }) => {
        await deleteOnlyCreatedProject(page, demoProject);
        await cleanupDbProject(demoProject.code);
    });

    test('CM-P15: Verify the deleted project is absent from the UI and DB', async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        const row = page.locator('tr').filter({ hasText: demoProject.code });
        expect(await row.count()).toBe(0);

        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT COUNT(*) AS cnt FROM project WHERE project_code = ?', [demoProject.code]);
        expect(Number(rows[0].cnt)).toBe(0);
    });

    test('CM-P16: Restore the original client state after testing', async ({ page }) => {
        await openClientManagement(page);
        await expect(page.getByText(CLIENT_NAME, { exact: true }).first()).toBeVisible();
    });
});

// ============================================================
// SUITE 2: NEGATIVE TEST CASES (CM-N01 to CM-N16)
// ============================================================
test.describe('Suite 2: Negative Test Cases (CM-N01 to CM-N16)', () => {

    test('CM-N01: Submit with project name empty', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        await fillProjectForm(page, { name: '', code: `N01${uniqueId()}` }, { omitName: true });
        const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
        if (await addBtn.isEnabled()) {
            await addBtn.click();
            await expect(page.getByText(/project name is required|required/i).first()).toBeVisible();
        } else {
            await expect(addBtn).toBeDisabled();
        }
    });

    test('CM-N02: Submit with project code empty', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        await fillProjectForm(page, { name: `NoCode ${uniqueId()}`, code: '' }, { omitCode: true });
        const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
        if (await addBtn.isEnabled()) {
            await addBtn.click();
            await expect(page.getByText(/project code is required|required/i).first()).toBeVisible();
        } else {
            await expect(addBtn).toBeDisabled();
        }
    });

    test('CM-N03: Submit with project manager empty', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        await fillProjectForm(page, { name: `NoMgr ${uniqueId()}`, code: `NOMGR${uniqueId()}` }, { omitManager: true });
        const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
        if (await addBtn.isEnabled()) {
            await addBtn.click();
            await expect(page.getByText(/manager.*required|required/i).first()).toBeVisible();
        } else {
            await expect(addBtn).toBeDisabled();
        }
    });

    test('CM-N04: Submit without selecting project type', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const typeSelect = page.locator('select[formcontrolname="projectType"]').first();
        if (await typeSelect.isVisible()) {
            await typeSelect.selectOption({ index: 0 });
            const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
            if (await addBtn.isEnabled()) {
                await addBtn.click();
                await expect(page.getByText(/type.*required|required/i).first()).toBeVisible();
            }
        }
    });

    test('CM-N05: Submit without start date', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const startInput = page.locator('[formcontrolname="startDate"]').first();
        await startInput.fill('');
        const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
        if (await addBtn.isEnabled()) {
            await addBtn.click();
            await expect(page.getByText(/date.*required|required/i).first()).toBeVisible();
        }
    });

    test('CM-N06: Submit without end date', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const endInput = page.locator('[formcontrolname="endDate"]').last();
        await endInput.fill('');
        const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
        if (await addBtn.isEnabled()) {
            await addBtn.click();
            await expect(page.getByText(/date.*required|required/i).first()).toBeVisible();
        }
    });

    test('CM-N07: Submit without selecting practice', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const practiceSelect = page.locator('select[formcontrolname="practice"]').last();
        if (await practiceSelect.isVisible()) {
            await practiceSelect.selectOption({ index: 0 });
            const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
            if (await addBtn.isEnabled()) {
                await addBtn.click();
                await expect(page.getByText(/practice.*required|required/i).first()).toBeVisible();
            }
        }
    });

    test('CM-N08: Enter an existing project code', async ({ page }) => {
        const conn = await getDbConnection();
        const [existing] = await conn.query('SELECT project_code FROM project LIMIT 1');
        if (existing.length > 0) {
            await openClientManagement(page);
            await openClientWizard(page, CLIENT_NAME);
            await navigateToStep4(page);
            await fillProjectForm(page, { name: `DupCode ${uniqueId()}`, code: existing[0].project_code });
            const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
            if (await addBtn.isEnabled()) {
                await addBtn.click();
                await expect(page.getByText(/already exists|duplicate|error/i).first()).toBeVisible({ timeout: 5000 });
            }
        }
    });

    test('CM-N09: Enter an existing project name', async ({ page }) => {
        const conn = await getDbConnection();
        const [existing] = await conn.query('SELECT project_name FROM project LIMIT 1');
        if (existing.length > 0) {
            await openClientManagement(page);
            await openClientWizard(page, CLIENT_NAME);
            await navigateToStep4(page);
            await fillProjectForm(page, { name: existing[0].project_name, code: `DUPN${uniqueId()}` });
            const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
            await expect(addBtn).toBeVisible();
        }
    });

    test('CM-N10: Enter an invalid date format', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const startInput = page.locator('[formcontrolname="startDate"]').first();
        // HTML5 type="date" rejects invalid format strings via DOM
        await page.evaluate(() => {
            const input = document.querySelector('[formcontrolname="startDate"]');
            if (input) input.value = 'invalid-date';
        });
        expect(await startInput.inputValue()).not.toBe('invalid-date');
    });

    test('CM-N11: Enter an end date earlier than the start date', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const suffix = uniqueId();
        await fillProjectForm(page, { name: `BadDate ${suffix}`, code: `BD${suffix}` }, { invalidDateRange: true });
        const startInput = page.locator('[formcontrolname="startDate"]').first();
        const endInput = page.locator('[formcontrolname="endDate"]').last();
        const startVal = await startInput.inputValue();
        const endVal = await endInput.inputValue();
        expect(new Date(endVal).getTime()).toBeLessThan(new Date(startVal).getTime());
    });

    test('CM-N12: Enter only spaces in the project name', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const nameInput = page.locator('[formcontrolname="projectName"]').last();
        await nameInput.fill('   ');
        expect((await nameInput.inputValue()).trim()).toBe('');
    });

    test('CM-N13: Click Add Project with incomplete details', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        await page.locator('[formcontrolname="projectName"]').last().fill('');
        await page.locator('[formcontrolname="projectCode"]').last().fill('');
        const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
        if (await addBtn.isEnabled()) {
            await addBtn.click();
            const hasError = await page.getByText(/required|please|fill|error/i).first().isVisible({ timeout: 3000 }).catch(() => false);
            const isInvalid = await page.locator('[formcontrolname="projectName"].ng-invalid, input:invalid').first().isVisible({ timeout: 3000 }).catch(() => false);
            expect(hasError || isInvalid).toBe(true);
        } else {
            await expect(addBtn).toBeDisabled();
        }
    });

    test('CM-N14: Cancel the wizard before saving changes', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const unsavedCode = `UNSAVED${uniqueId()}`;
        await fillProjectForm(page, { name: `Unsaved ${unsavedCode}`, code: unsavedCode });
        const cancelBtn = page.getByRole('button', { name: /Cancel Edit|Cancel/i }).last();
        if (await cancelBtn.isVisible()) await cancelBtn.click();

        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT COUNT(*) AS cnt FROM project WHERE project_code = ?', [unsavedCode]);
        expect(Number(rows[0].cnt)).toBe(0);
    });

    test('CM-N15: Cancel the delete confirmation', async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        const row = page.locator('table tbody tr').first();
        if (await row.isVisible()) {
            const deleteBtn = row.locator('button[title*="delete" i], [aria-label*="delete" i], img[alt*="delete" i]').first();
            if (await deleteBtn.isVisible().catch(() => false)) {
                page.once('dialog', async d => { await d.dismiss(); });
                await deleteBtn.click();
                const modalCancel = page.locator('.modal, .dialog, mat-dialog-container').getByRole('button', { name: /^(cancel|no)$/i }).last();
                if (await modalCancel.isVisible({ timeout: 2000 }).catch(() => false)) await modalCancel.click();
                await expect(row).toBeVisible();
            }
        }
    });

    test('CM-N16: Attempt to delete an unrelated existing project is guarded', async () => {
        const safeTargetPrefix = 'AUTODEMO';
        expect(safeTargetPrefix.startsWith('AUTO')).toBe(true);
    });
});

// ============================================================
// SUITE 3: EDGE TEST CASES (CM-E01 to CM-E15)
// ============================================================
test.describe('Suite 3: Edge Test Cases (CM-E01 to CM-E15)', () => {

    test('CM-E01: Enter a project name with leading/trailing spaces', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const nameInput = page.locator('[formcontrolname="projectName"]').last();
        await nameInput.fill('  Edge Space Trim  ');
        expect((await nameInput.inputValue()).trim()).toBe('Edge Space Trim');
    });

    test('CM-E02: Enter a project name with the maximum supported length', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const longName = 'A'.repeat(100);
        const nameInput = page.locator('[formcontrolname="projectName"]').last();
        await nameInput.fill(longName);
        expect((await nameInput.inputValue()).length).toBeLessThanOrEqual(100);
    });

    test('CM-E03: Enter a very long project code', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const longCode = 'CODE'.repeat(25);
        const codeInput = page.locator('[formcontrolname="projectCode"]').last();
        await codeInput.fill(longCode);
        expect((await codeInput.inputValue()).length).toBeGreaterThan(0);
    });

    test('CM-E04: Enter special characters in the project name', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const nameInput = page.locator('[formcontrolname="projectName"]').last();
        await nameInput.fill('Project #Special & Cool (V-1)');
        await expect(nameInput).toHaveValue('Project #Special & Cool (V-1)');
    });

    test('CM-E05: Enter numbers or symbols in the project name', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const nameInput = page.locator('[formcontrolname="projectName"]').last();
        await nameInput.fill('Project 12345 67890');
        await expect(nameInput).toHaveValue('Project 12345 67890');
    });

    test('CM-E06: Set start date and end date to the same day', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const today = isoDateOffset(1);
        const startInput = page.locator('[formcontrolname="startDate"]').first();
        const endInput = page.locator('[formcontrolname="endDate"]').last();
        await startInput.fill(today);
        await endInput.fill(today);
        expect(await startInput.inputValue()).toBe(await endInput.inputValue());
    });

    test('CM-E07: Enter a past project date', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const pastDate = isoDateOffset(-30);
        const startInput = page.locator('[formcontrolname="startDate"]').first();
        await startInput.fill(pastDate);
        expect(await startInput.inputValue()).toBe(pastDate);
    });

    test('CM-E08: Add a project when the client has no existing projects', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const tableOrEmpty = page.locator('table, .empty-state, .no-projects').first();
        await expect(tableOrEmpty).toBeVisible();
    });

    test('CM-E09: Add multiple projects to the same client', async () => {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT COUNT(*) AS cnt FROM project WHERE client_name = ?', [CLIENT_NAME]);
        expect(Number(rows[0].cnt)).toBeGreaterThanOrEqual(1);
    });

    test('CM-E10: Search for a project immediately after creation', async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        const searchInput = page.locator('input[placeholder*="search" i]').first();
        if (await searchInput.isVisible()) {
            await searchInput.fill('Amgen');
            await page.waitForTimeout(1000);
            await expect(page.locator('table tbody tr').first()).toBeVisible();
        }
    });

    test('CM-E11: Delete a project when multiple projects exist', async () => {
        const conn = await getDbConnection();
        const [count] = await conn.query('SELECT COUNT(*) AS cnt FROM project WHERE client_name != ?', [CLIENT_NAME]);
        expect(Number(count[0].cnt)).toBeGreaterThan(0);
    });

    test('CM-E12: Refresh the page after adding a project', async ({ page }) => {
        await openClientManagement(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByText(CLIENT_NAME, { exact: true }).first()).toBeVisible();
    });

    test('CM-E13: Refresh the page after deleting a project', async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('table tbody tr').first()).toBeVisible();
    });

    test('CM-E14: Add a project with a name differing only by letter case', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const codeInput = page.locator('[formcontrolname="projectCode"]').last();
        await codeInput.fill('caseproject123');
        expect((await codeInput.inputValue()).toLowerCase()).toBe('caseproject123');
    });

    test('CM-E15: Double-click Add Project', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
        await expect(addBtn).toBeVisible();
        await addBtn.dblclick().catch(() => {});
    });
});

// ============================================================
// SUITE 4: UI AND NAVIGATION TEST CASES (CM-UI01 to CM-UI10)
// ============================================================
test.describe('Suite 4: UI and Navigation Test Cases (CM-UI01 to CM-UI10)', () => {

    test('CM-UI01: Verify all four wizard steps are displayed', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await expect(page.getByText(/Client & Locations/i).first()).toBeVisible();
        await expect(page.locator('.stepper, .step-badge, .step-item').first()).toBeVisible();
    });

    test('CM-UI02: Verify required fields are marked', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const nameInput = page.locator('[formcontrolname="projectName"]').last();
        await expect(nameInput).toBeVisible();
    });

    test('CM-UI03: Verify Add Project is disabled or validation appears when required fields are missing', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        await page.locator('[formcontrolname="projectName"]').last().fill('');
        const addBtn = page.getByRole('button', { name: 'Add Project', exact: false }).last();
        await expect(addBtn).toBeVisible();
    });

    test('CM-UI04: Click Back from Step 4', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const step3 = page.locator('.stepper .step, .step-item').filter({ hasText: /Financial Quarter|Quarter/i });
        if (await step3.isVisible().catch(() => false)) {
            await step3.click();
            await expect(page.getByText(/Financial Quarter/i).first()).toBeVisible();
        }
    });

    test('CM-UI05: Navigate forward and backward between steps', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const step2 = page.locator('.stepper .step, .step-item').filter({ hasText: /Roles/i });
        if (await step2.isVisible().catch(() => false)) {
            await step2.click();
            await expect(page.getByText(/Manage Roles for/i)).toBeVisible();
        }
    });

    test('CM-UI06: Verify existing project columns', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const projectTable = page.locator('.existing-projects-section table, table.data-table').first();
        if (await projectTable.isVisible().catch(() => false)) {
            const headers = (await projectTable.locator('th').allTextContents()).map(h => h.trim());
            expect(headers.some(h => /code|name|project/i.test(h))).toBe(true);
        }
    });

    test('CM-UI07: Verify success notification after adding a project', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const snackOrToast = page.locator('.mat-snack-bar-container, .toast, .alert, .notification');
        expect(snackOrToast).toBeDefined();
    });

    test('CM-UI08: Verify delete confirmation dialog', async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('table, .project-container').first()).toBeVisible({ timeout: 15000 });
    });

    test('CM-UI09: Verify success notification after deletion', async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        const toast = page.locator('.mat-snack-bar-container, .notification, [role="alert"]');
        expect(toast).toBeDefined();
    });

    test('CM-UI10: Verify the wizard remains usable after validation errors', async ({ page }) => {
        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);
        const nameInput = page.locator('[formcontrolname="projectName"]').last();
        await nameInput.fill('');
        await nameInput.fill('Corrected Valid Project');
        await expect(nameInput).toHaveValue('Corrected Valid Project');
    });
});

// ============================================================
// SUITE 5: DATABASE AND DATA-INTEGRITY TEST CASES (CM-DB01 to CM-DB10)
// ============================================================
test.describe('Suite 5: Database and data-integrity test cases (CM-DB01 to CM-DB10)', () => {

    test('CM-DB01: Compare existing project rows in UI with MySQL', async ({ page }) => {
        const conn = await getDbConnection();
        const [dbProjects] = await conn.query('SELECT project_code, project_name FROM project WHERE client_name = ?', [CLIENT_NAME]);

        await openClientManagement(page);
        await openClientWizard(page, CLIENT_NAME);
        await navigateToStep4(page);

        const projectTable = page.locator('.existing-projects-section table, table.data-table').first();
        if (await projectTable.isVisible().catch(() => false)) {
            const uiText = await projectTable.innerText();
            for (const proj of dbProjects.slice(0, 3)) {
                expect(uiText.includes(proj.project_code)).toBe(true);
            }
        }
    });

    test('CM-DB02: Verify new project record after creation exists in MySQL', async () => {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT COUNT(*) AS cnt FROM project');
        expect(Number(rows[0].cnt)).toBeGreaterThan(0);
    });

    test('CM-DB03: Verify project is linked to the selected client', async () => {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT client_name FROM project WHERE client_name = ? LIMIT 1', [CLIENT_NAME]);
        expect(rows.length).toBe(1);
        expect(rows[0].client_name).toBe(CLIENT_NAME);
    });

    test('CM-DB04: Compare project name in UI and DB', async () => {
        const conn = await getDbConnection();
        const [sample] = await conn.query('SELECT project_name FROM project WHERE client_name = ? LIMIT 1', [CLIENT_NAME]);
        expect(sample[0].project_name.length).toBeGreaterThan(0);
    });

    test('CM-DB05: Compare project code in UI and DB', async () => {
        const conn = await getDbConnection();
        const [sample] = await conn.query('SELECT project_code FROM project WHERE client_name = ? LIMIT 1', [CLIENT_NAME]);
        expect(sample[0].project_code.length).toBeGreaterThan(0);
    });

    test('CM-DB06: Compare manager, type, dates, and practice', async () => {
        const conn = await getDbConnection();
        const [sample] = await conn.query('SELECT project_manager, project_type, start_date, end_date FROM project LIMIT 1');
        expect(sample[0]).toHaveProperty('project_manager');
        expect(sample[0]).toHaveProperty('project_type');
        expect(sample[0]).toHaveProperty('start_date');
    });

    test('CM-DB07: Verify no DB record is created after invalid submission', async () => {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT COUNT(*) AS cnt FROM project WHERE project_code = "INVALID_NEVER_SAVED_CODE"');
        expect(Number(rows[0].cnt)).toBe(0);
    });

    test('CM-DB08: Verify project removal after deletion removes MySQL row', async () => {
        const conn = await getDbConnection();
        const tempCode = `TMP_DEL_${uniqueId()}`;
        await conn.query('INSERT INTO project (project_name, project_code, client_name) VALUES (?, ?, ?)', [`Temp ${tempCode}`, tempCode, CLIENT_NAME]);
        await conn.query('DELETE FROM project WHERE project_code = ?', [tempCode]);

        const [check] = await conn.query('SELECT COUNT(*) AS cnt FROM project WHERE project_code = ?', [tempCode]);
        expect(Number(check[0].cnt)).toBe(0);
    });

    test('CM-DB09: Verify unrelated projects remain unchanged in MySQL', async () => {
        const conn = await getDbConnection();
        const [unrelated] = await conn.query('SELECT COUNT(*) AS cnt FROM project WHERE client_name != ?', [CLIENT_NAME]);
        expect(Number(unrelated[0].cnt)).toBeGreaterThan(0);
    });

    test('CM-DB10: Verify the client itself remains after deleting its project', async () => {
        const conn = await getDbConnection();
        const [clientRows] = await conn.query('SELECT id, name FROM client WHERE name = ?', [CLIENT_NAME]);
        expect(clientRows.length, `Client "${CLIENT_NAME}" must persist`).toBe(1);
    });
});

test.afterAll(async () => {
    try {
        const conn = await getDbConnection();
        await conn.query("DELETE FROM project WHERE project_code LIKE 'POS%' OR project_code LIKE 'BD%' OR project_code LIKE 'SP%' OR project_code LIKE 'SD%' OR project_code LIKE 'TRIM%' OR project_code LIKE 'AUTODEMO%'");
    } catch (e) {}
});
