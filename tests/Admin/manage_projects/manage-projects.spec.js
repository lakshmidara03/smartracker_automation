const { test, expect } = require('@playwright/test');
const mysql = require('mysql2/promise');

const BASE_URL = (process.env.UI_BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
const PROJECTS_URL = `${BASE_URL}/admin/project`;

// Use unique values for this test run
const RUN_ID = `${Date.now()}`;
const DEMO_PROJECT = {
    name: `UI_Demo_${RUN_ID}`,
    code: `UID${RUN_ID.slice(-5)}`,
    client: process.env.DEMO_CLIENT || 'Google',
    manager: process.env.DEMO_MANAGER || 'Sridhar Pokuri',
    practice: process.env.DEMO_PRACTICE || 'Digital Transformation',
    type: process.env.DEMO_PROJECT_TYPE || 'Production',
    startDate: '2026-11-01',
    endDate: '2026-12-01',
};

// Database helper for resilient cleanup
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
        } catch {
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

async function cleanupDbProject(projectCode) {
    try {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT id FROM project WHERE project_code = ?', [projectCode]);
        for (const row of rows) {
            await conn.query('DELETE FROM project_practice WHERE project_id = ?', [row.id]).catch(() => {});
            await conn.query('DELETE FROM project_role WHERE project_id = ?', [row.id]).catch(() => {});
            await conn.query('DELETE FROM project WHERE id = ?', [row.id]).catch(() => {});
        }
    } catch {
        // ignore
    }
}

test.use({
    ignoreHTTPSErrors: true,
    actionTimeout: 15000,
    trace: 'off',
});

test.describe('SmartTracker Admin - Manage Projects', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(PROJECTS_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        await expect(
            page.getByRole('heading', { name: 'Projects', exact: true })
        ).toBeVisible({ timeout: 30000 });

        // Ensure table rows are loaded from API before running tests
        await expect(
            page.locator('table.projects-table tbody tr.data-row').first()
        ).toBeVisible({ timeout: 20000 });
    });

    test.afterAll(async () => {
        await cleanupDbProject(DEMO_PROJECT.code);
        if (dbConnection) {
            await dbConnection.end().catch(() => {});
            dbConnection = null;
        }
    });

    // -------------------------------
    // Shared helpers
    // -------------------------------

    const searchBox = (page) =>
        page.locator('input[placeholder*="Search projects" i]').first();

    const resetFilters = async (page) => {
        const reset = page.locator('.reset-link, a:has-text("Reset filters")').first();
        if (await reset.count() && await reset.isVisible().catch(() => false)) {
            await reset.click();
        }

        const search = searchBox(page);
        if (await search.count() && await search.isVisible().catch(() => false)) {
            await search.fill('');
        }
        await page.waitForTimeout(400);
    };

    const projectRows = (page) =>
        page.locator('table.projects-table tbody tr.data-row');

    const visibleRows = async (page) => {
        const rows = projectRows(page);
        const count = await rows.count();
        const result = [];

        for (let i = 0; i < count; i++) {
            const row = rows.nth(i);
            if (await row.isVisible()) {
                result.push((await row.innerText()).trim());
            }
        }

        return result;
    };

    const selectFilter = async (page, label, option) => {
        const selects = page.locator('.filters-grid select');
        const labels = {
            client: /all clients/i,
            type: /all types/i,
            manager: /all managers/i,
            practice: /all practices/i,
        };

        const regex = labels[label.toLowerCase()];
        if (!regex) {
            throw new Error(`Unknown filter: ${label}`);
        }

        const count = await selects.count();
        for (let i = 0; i < count; i++) {
            const select = selects.nth(i);
            const text = await select.locator('option').allTextContents();

            if (text.some((item) => regex.test(item.trim()))) {
                await select.locator('option').nth(1).waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
                await select.selectOption({ label: option }).catch(async () => {
                    await select.selectOption(option);
                });
                await page.waitForTimeout(400);
                return;
            }
        }

        throw new Error(
            `Could not identify the "${label}" dropdown.`
        );
    };

    const openAddProjectModal = async (page) => {
        await page.getByRole('button', { name: /add project/i }).first().click();

        // Confirm the modal opened
        await expect(
            page.locator('input[formcontrolname="projectName"]')
        ).toBeVisible({ timeout: 10000 });
    };

    const fillProjectForm = async (page, project) => {
        // 1. Client select (wait for async options)
        const clientSelect = page.locator('select[formcontrolname="clientName"]').first();
        await expect(clientSelect).toBeVisible({ timeout: 10000 });
        await clientSelect.locator('option').nth(1).waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});

        const options = await clientSelect.locator('option').allTextContents();
        const targetClient = options.find(o => o.trim().toLowerCase() === (project.client || '').toLowerCase())
            || options.find(o => o.trim() && !o.toLowerCase().includes('select client'))
            || 'Google';
        project.client = targetClient.trim();

        await clientSelect.selectOption({ label: project.client }).catch(async () => {
            await clientSelect.selectOption(project.client);
        });

        // 2. Project Name
        await page.locator('input[formcontrolname="projectName"]').fill(project.name);

        // 3. Project Code
        await page.locator('input[formcontrolname="projectCode"]').fill(project.code);

        // 4. Project Manager
        const pmInput = page.locator('input[formcontrolname="projectManager"]').first();
        await pmInput.fill(project.manager);
        const pmOption = page.locator('mat-option').filter({ hasText: project.manager }).first();
        if (await pmOption.isVisible({ timeout: 2000 }).catch(() => false)) {
            await pmOption.click();
        }

        // 5. Project Type
        const typeControl = page.locator('select[formcontrolname="projectType"]').first();
        if (await typeControl.isVisible({ timeout: 2000 }).catch(() => false)) {
            await typeControl.selectOption({ label: project.type }).catch(async () => {
                await typeControl.selectOption(project.type);
            });
        }

        // 6. Practice
        const practiceControl = page.locator('select[formcontrolname="practice"]').first();
        if (await practiceControl.isVisible({ timeout: 2000 }).catch(() => false)) {
            await practiceControl.selectOption({ label: project.practice }).catch(async () => {
                await practiceControl.selectOption(project.practice);
            });
        }

        // 7. Dates
        const startInput = page.locator('input[formcontrolname="startDate"]').first();
        const endInput = page.locator('input[formcontrolname="endDate"]').first();
        await startInput.fill(project.startDate);
        await endInput.fill(project.endDate);
    };

    const saveProject = async (page) => {
        await page.getByRole('button', { name: /save project/i }).first().click();
    };

    const findProjectRow = (page, projectName) =>
        projectRows(page).filter({ hasText: projectName });

    const deleteProjectByName = async (page, projectName) => {
        await resetFilters(page);
        await searchBox(page).fill(projectName);
        await page.waitForTimeout(500);

        const row = findProjectRow(page, projectName);
        await expect(row.first()).toBeVisible({ timeout: 15000 });

        const deleteBtn = row.first().locator('button.btn-icon-delete, button[title*="delete" i]').first();
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });

        page.once('dialog', async (dialog) => {
            await dialog.accept();
        });
        await deleteBtn.click();

        await expect(findProjectRow(page, projectName)).toHaveCount(0, {
            timeout: 15000,
        });
    };

    // -------------------------------
    // A. Projects listing
    // -------------------------------

    test('MP-01 - Projects screen loads and displays project data', async ({
        page,
    }) => {
        await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
        await expect(searchBox(page)).toBeVisible();
        await expect(page.locator('.filter-select').first()).toBeVisible();
        await expect(projectRows(page).first()).toBeVisible();
    });

    test('MP-02 - Project table has expected column headings', async ({
        page,
    }) => {
        for (const heading of [
            /Code/i,
            /Project Name/i,
            /Client/i,
            /Project Manager/i,
            /Type/i,
            /Practice/i,
            /Timeline/i,
            /Actions/i,
        ]) {
            await expect(page.locator('thead th').filter({ hasText: heading }).first()).toBeVisible();
        }
    });

    // -------------------------------
    // B. Project name search
    // -------------------------------

    test('PF-01 - Search by an existing project name', async ({ page }) => {
        const rowsBefore = await visibleRows(page);
        test.skip(rowsBefore.length === 0, 'No visible project rows to search.');

        const firstRow = projectRows(page).first();
        const cells = await firstRow.locator('td').allTextContents();

        // Project name is the third table cell (index 2)
        const projectName = cells[2]?.trim();
        test.skip(!projectName, 'Project name cell could not be identified.');

        await searchBox(page).fill(projectName);
        await page.waitForTimeout(400);
        await expect(findProjectRow(page, projectName).first()).toBeVisible();
    });

    test('PF-02 - Search by partial project name', async ({ page }) => {
        const firstRow = projectRows(page).first();
        const cells = await firstRow.locator('td').allTextContents();
        const projectName = cells[2]?.trim();
        const query = projectName ? projectName.slice(0, 3) : 'Amg';

        await searchBox(page).fill(query);
        await page.waitForTimeout(400);
        await expect(page.locator('body')).toContainText(new RegExp(query, 'i'));
    });

    test('PF-03 - Search with a non-existing project name', async ({ page }) => {
        await searchBox(page).fill(`NoSuchProject_${RUN_ID}`);
        await page.waitForTimeout(400);
        await expect(projectRows(page)).toHaveCount(0);
    });

    test('PF-04 - Clear search and restore results', async ({ page }) => {
        const before = await projectRows(page).count();

        await searchBox(page).fill(`NoSuchProject_${RUN_ID}`);
        await page.waitForTimeout(400);
        await expect(projectRows(page)).toHaveCount(0);

        await searchBox(page).fill('');
        await page.waitForTimeout(400);
        await expect(projectRows(page)).toHaveCount(before);
    });

    test('PF-05 - Search ignores leading and trailing spaces', async ({
        page,
    }) => {
        const firstRow = projectRows(page).first();
        const cells = await firstRow.locator('td').allTextContents();
        const projectName = cells[2]?.trim();

        test.skip(!projectName, 'Cannot identify a project name.');

        await searchBox(page).fill(`  ${projectName}  `);
        await page.waitForTimeout(400);
        await expect(findProjectRow(page, projectName).first()).toBeVisible();
    });

    // -------------------------------
    // C. Dropdown filters
    // -------------------------------

    test('PF-06 - Client filter can be selected and reset', async ({ page }) => {
        await selectFilter(page, 'client', 'Google');

        const rows = await visibleRows(page);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row).toContain('Google');
        }

        await resetFilters(page);
    });

    test('PF-07 - Project type filter can be selected and reset', async ({
        page,
    }) => {
        await selectFilter(page, 'type', 'Production');

        const rows = await visibleRows(page);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row).toMatch(/Production/i);
        }

        await resetFilters(page);
    });

    test('PF-08 - Manager filter can be selected and reset', async ({
        page,
    }) => {
        await selectFilter(page, 'manager', DEMO_PROJECT.manager);

        const rows = await visibleRows(page);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row).toContain(DEMO_PROJECT.manager);
        }

        await resetFilters(page);
    });

    test('PF-09 - Practice filter can be selected and reset', async ({
        page,
    }) => {
        await selectFilter(page, 'practice', DEMO_PROJECT.practice);

        const rows = await visibleRows(page);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            // Table shows practice abbreviation (e.g. DT for Digital Transformation)
            expect(row).toMatch(/Digital Transformation|DT/i);
        }

        await resetFilters(page);
    });

    test('PF-10 - Combine project search and client filter', async ({
        page,
    }) => {
        await selectFilter(page, 'client', 'Google');
        await searchBox(page).fill('Finance');
        await page.waitForTimeout(400);

        const rows = await visibleRows(page);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row).toContain('Google');
            expect(row).toMatch(/Finance/i);
        }
    });

    test('PF-11 - Reset filters clears search and dropdown selections', async ({
        page,
    }) => {
        await selectFilter(page, 'client', 'Google');
        await searchBox(page).fill('Finance');

        await resetFilters(page);

        await expect(searchBox(page)).toHaveValue('');
    });

    test('PF-12 - Pagination controls are available when multiple pages exist', async ({
        page,
    }) => {
        const next = page.locator('button.page-arrow').last();

        if (!(await next.count()) || !(await next.isVisible().catch(() => false)) || await next.isDisabled()) {
            test.skip(true, 'No multi-page pagination or next button disabled.');
        }

        const before = await visibleRows(page);
        await next.click();
        await page.waitForTimeout(500);
        await expect(projectRows(page).first()).toBeVisible();
        const after = await visibleRows(page);

        expect(after.length).toBeGreaterThan(0);
        expect(after.join('\n')).not.toBe(before.join('\n'));
    });

    // -------------------------------
    // D. Add Project validation
    // -------------------------------

    test('MP-03 - Required fields prevent empty project submission', async ({
        page,
    }) => {
        await openAddProjectModal(page);
        await saveProject(page);

        const nameInput = page.locator('input[formcontrolname="projectName"]');
        await expect(nameInput).toBeVisible();
        await expect(nameInput).toHaveValue('');

        // Close modal
        await page.locator('.modal-close-btn, .btn-cancel').first().click();
    });

    test('MP-04 - Whitespace-only project name is rejected', async ({ page }) => {
        await openAddProjectModal(page);
        await page.locator('input[formcontrolname="projectName"]').fill('   ');
        await saveProject(page);

        await expect(page.locator('input[formcontrolname="projectName"]')).toBeVisible();

        // Close modal
        await page.locator('.modal-close-btn, .btn-cancel').first().click();
    });

    test('MP-05 - Invalid date range is rejected', async ({ page }) => {
        await openAddProjectModal(page);

        await fillProjectForm(page, {
            ...DEMO_PROJECT,
            name: `Invalid_Date_${RUN_ID}`,
            code: `INV${RUN_ID.slice(-5)}`,
            startDate: '2026-12-15',
            endDate: '2026-11-01',
        });

        await saveProject(page);

        // Verify the form remains open and displays validation error
        await expect(page.locator('input[formcontrolname="projectName"]')).toBeVisible();
        await expect(page.locator('.message.error, .field-error').first()).toBeVisible();

        // Close modal
        await page.locator('.modal-close-btn, .btn-cancel').first().click();
    });

    // -------------------------------
    // E. Create -> verify -> delete
    // -------------------------------

    test('MP-06 - Create demo project, verify it, then delete it', async ({
        page,
    }) => {
        let projectCreated = false;

        try {
            await openAddProjectModal(page);
            await fillProjectForm(page, DEMO_PROJECT);

            // Save the unique demo project
            await saveProject(page);

            // Wait for modal to close
            const modal = page.locator('.project-modal, [role="dialog"]');
            await expect(modal).toBeHidden({ timeout: 15000 });

            // Verify project appears in the table
            await resetFilters(page);
            await searchBox(page).fill(DEMO_PROJECT.name);
            await page.waitForTimeout(500);

            const row = findProjectRow(page, DEMO_PROJECT.name);
            await expect(row).toHaveCount(1, { timeout: 15000 });
            projectCreated = true;

            await expect(row).toContainText(DEMO_PROJECT.code);
            await expect(row).toContainText(DEMO_PROJECT.client);
            await expect(row).toContainText(DEMO_PROJECT.manager);
            await expect(row).toContainText(DEMO_PROJECT.type);

            // Delete the created demo project from the UI
            await deleteProjectByName(page, DEMO_PROJECT.name);
            projectCreated = false;

            // Confirm deletion
            await resetFilters(page);
            await searchBox(page).fill(DEMO_PROJECT.name);
            await page.waitForTimeout(500);
            await expect(findProjectRow(page, DEMO_PROJECT.name)).toHaveCount(0);
        } finally {
            if (projectCreated) {
                await deleteProjectByName(page, DEMO_PROJECT.name).catch(() => {});
            }
        }
    });
});
