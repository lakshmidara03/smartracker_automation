/**
 * Manage Projects: UI-to-DB Parity & Lifecycle Validation Suite
 * 
 * Compares UI components, table rows, KPI summary metrics, and modal dialogs 
 * directly against MySQL database tables:
 * - `project`
 * - `project_role`
 * - `project_practice`
 * - `project_sow`
 * - `employee_allocation`
 * 
 * Catalog:
 * - Suite 1: UI vs DB Parity Validation (UIDB-01 to UIDB-05)
 * - Suite 2: UI Project Creation, Verification & Cascade Deletion (UIDB-06 to UIDB-08)
 * - Suite 3: Negative Form Validations & Database Integrity (UIDB-09 to UIDB-11)
 */

const { test, expect } = require('@playwright/test');
const mysql = require('mysql2/promise');

// ============================================================
// CONFIGURATION
// ============================================================
const BASE_URL = (process.env.UI_BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
const PROJECTS_URL = `${BASE_URL}/admin/project`;

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

async function cascadeDeleteDbProject(projectCode) {
    try {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT id FROM project WHERE project_code = ?', [projectCode]);
        for (const row of rows) {
            await conn.query('DELETE FROM employee_allocation WHERE project_id = ?', [row.id]).catch(() => {});
            await conn.query('DELETE FROM project_sow WHERE project_id = ?', [row.id]).catch(() => {});
            await conn.query('DELETE FROM project_role WHERE project_id = ?', [row.id]).catch(() => {});
            await conn.query('DELETE FROM project_practice WHERE project_id = ?', [row.id]).catch(() => {});
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

// ============================================================
// SUITE 1: UI VS DB PARITY VALIDATION
// ============================================================
test.describe('Suite 1: UI vs Database Parity Validation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible({ timeout: 30000 });
        await expect(page.locator('table.projects-table tbody tr.data-row').first()).toBeVisible({ timeout: 20000 });
    });

    test('UIDB-01: Verify UI KPI Cards Match DB Aggregate Counts', async ({ page }) => {
        const conn = await getDbConnection();
        const [kpiCounts] = await conn.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN LOWER(project_type) = 'production' THEN 1 ELSE 0 END) as prod,
                SUM(CASE WHEN LOWER(project_type) = 'internal' THEN 1 ELSE 0 END) as internal,
                SUM(CASE WHEN MONTH(end_date) = MONTH(CURRENT_DATE()) AND YEAR(end_date) = YEAR(CURRENT_DATE()) THEN 1 ELSE 0 END) as ending_month
            FROM project
        `);

        const expectedTotal = String(kpiCounts[0].total || 0);
        const expectedProd = String(kpiCounts[0].prod || 0);
        const expectedInternal = String(kpiCounts[0].internal || 0);

        const kpiCards = page.locator('.kpi-card');
        await expect(kpiCards.nth(0).locator('.kpi-value')).toHaveText(expectedTotal);
        await expect(kpiCards.nth(1).locator('.kpi-value')).toHaveText(expectedProd);
        await expect(kpiCards.nth(2).locator('.kpi-value')).toHaveText(expectedInternal);
    });

    test('UIDB-02: Verify Total Projects Count Summary Matches `project` Table Row Count', async ({ page }) => {
        const conn = await getDbConnection();
        const [countRow] = await conn.query('SELECT COUNT(*) as total FROM project');
        const dbTotal = countRow[0].total;

        const summary = page.locator('.results-summary');
        await expect(summary).toContainText(`${dbTotal} projects`);
    });

    test('UIDB-03: Verify First Page Projects Table Columns Map Directly to DB Fields', async ({ page }) => {
        const conn = await getDbConnection();
        // UI default sorts by id desc or project code
        const [dbProjects] = await conn.query(`
            SELECT p.id, p.project_code, p.project_name, p.client_name, p.project_manager, p.project_type, pp.practice
            FROM project p
            LEFT JOIN project_practice pp ON p.id = pp.project_id
            ORDER BY p.id DESC
            LIMIT 10
        `);

        // Read first row on UI
        const firstRow = page.locator('table.projects-table tbody tr.data-row').first();
        const cells = await firstRow.locator('td').allTextContents();

        const uiId = cells[0].trim();
        const uiCode = cells[1].trim();
        const uiName = cells[2].trim();
        const uiClient = cells[3].trim();
        const uiManager = cells[4].trim();

        // Verify that the UI row exists in the DB
        const [match] = await conn.query('SELECT * FROM project WHERE id = ?', [uiId]);
        expect(match.length).toBe(1);
        expect(match[0].project_code).toBe(uiCode);
        expect(match[0].project_name).toBe(uiName);
        expect(match[0].client_name).toBe(uiClient);
        expect(match[0].project_manager).toBe(uiManager);
    });

    test('UIDB-04: Verify Practice Abbreviation in UI Matches `project_practice` Table', async ({ page }) => {
        const conn = await getDbConnection();
        const [rows] = await conn.query(`
            SELECT p.id, p.project_name, pp.practice 
            FROM project p 
            INNER JOIN project_practice pp ON p.id = pp.project_id 
            WHERE pp.practice = 'Digital Transformation' 
            LIMIT 1
        `);

        test.skip(rows.length === 0, 'No project found with Digital Transformation practice.');

        const projectName = rows[0].project_name;
        const searchInput = page.locator('input[placeholder*="Search projects" i]').first();
        await searchInput.fill(projectName);
        await page.waitForTimeout(500);

        const row = page.locator('table.projects-table tbody tr.data-row').filter({ hasText: projectName });
        await expect(row.first()).toBeVisible();

        // Digital Transformation is abbreviated as "DT" in the UI table
        await expect(row.locator('.col-practice')).toContainText('DT');
    });

    test('UIDB-05: Verify Project Roles Modal Matches `project_role` Table Records', async ({ page }) => {
        const conn = await getDbConnection();
        // Find a project that has configured roles
        const [projectsWithRoles] = await conn.query(`
            SELECT pr.project_id, p.project_name, count(*) as role_count 
            FROM project_role pr 
            JOIN project p ON pr.project_id = p.id 
            GROUP BY pr.project_id, p.project_name 
            HAVING role_count >= 1 
            LIMIT 1
        `);

        test.skip(projectsWithRoles.length === 0, 'No projects with roles found in DB.');

        const projectId = projectsWithRoles[0].project_id;
        const projectName = projectsWithRoles[0].project_name;

        const [dbRoles] = await conn.query('SELECT project_role, client_role, bill_rate FROM project_role WHERE project_id = ?', [projectId]);

        // Search project on UI
        const searchInput = page.locator('input[placeholder*="Search projects" i]').first();
        await searchInput.fill(projectName);
        await page.waitForTimeout(500);

        const row = page.locator('table.projects-table tbody tr.data-row').filter({ hasText: projectName }).first();
        await expect(row).toBeVisible();

        // Click roles button
        const rolesBtn = row.locator('button.btn-icon-team, button[title*="roles" i]').first();
        await rolesBtn.click();

        const rolesModal = page.locator('.roles-modal, [role="dialog"]').first();
        await expect(rolesModal).toBeVisible({ timeout: 5000 });

        // Assert that every DB role is visible in the UI modal
        for (const role of dbRoles) {
            await expect(rolesModal).toContainText(role.project_role);
        }

        // Close modal
        const closeBtn = rolesModal.locator('.modal-close-btn, button:has-text("Close"), button:has-text("Cancel")').first();
        if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click();
        }
    });
});

// ============================================================
// SUITE 2: UI PROJECT CREATION, VERIFICATION & CASCADE DELETION
// ============================================================
test.describe('Suite 2: UI Project Creation & Cascade Deletion against Database', () => {
    test.describe.configure({ mode: 'serial' });
    const runId = Date.now().toString().slice(-6);
    const demoProject = {
        name: `UIDB_Demo_${runId}`,
        code: `UDB${runId.slice(-5)}`,
        client: 'Google',
        manager: 'Sridhar Pokuri',
        practice: 'Digital Transformation',
        type: 'Production',
        startDate: '2026-11-01',
        endDate: '2026-12-01'
    };

    let createdDbId = null;

    test.afterAll(async () => {
        await cascadeDeleteDbProject(demoProject.code);
        if (dbConnection) {
            await dbConnection.end().catch(() => {});
            dbConnection = null;
        }
    });

    test('UIDB-06: Add New Project via UI Modal and Verify Persistence in `project` Table', async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('table.projects-table tbody tr.data-row').first()).toBeVisible({ timeout: 20000 });

        // Open Add project modal
        await page.getByRole('button', { name: /add project/i }).first().click();
        const modal = page.locator('.project-modal, [role="dialog"]').first();
        await expect(modal).toBeVisible();

        // Fill form
        const clientSelect = page.locator('select[formcontrolname="clientName"]').first();
        await clientSelect.locator('option').nth(1).waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
        await clientSelect.selectOption({ label: demoProject.client }).catch(async () => {
            await clientSelect.selectOption(demoProject.client);
        });

        await page.locator('input[formcontrolname="projectName"]').fill(demoProject.name);
        await page.locator('input[formcontrolname="projectCode"]').fill(demoProject.code);

        const pmInput = page.locator('input[formcontrolname="projectManager"]').first();
        await pmInput.fill(demoProject.manager);
        const pmOption = page.locator('mat-option').filter({ hasText: demoProject.manager }).first();
        if (await pmOption.isVisible({ timeout: 2000 }).catch(() => false)) {
            await pmOption.click();
        }

        const typeSelect = page.locator('select[formcontrolname="projectType"]').first();
        await typeSelect.selectOption({ label: demoProject.type }).catch(async () => {
            await typeSelect.selectOption(demoProject.type);
        });

        const practiceSelect = page.locator('select[formcontrolname="practice"]').first();
        await practiceSelect.selectOption({ label: demoProject.practice }).catch(async () => {
            await practiceSelect.selectOption(demoProject.practice);
        });

        await page.locator('input[formcontrolname="startDate"]').fill(demoProject.startDate);
        await page.locator('input[formcontrolname="endDate"]').fill(demoProject.endDate);

        // Save
        await page.getByRole('button', { name: /save project/i }).first().click();

        // Modal should close
        await expect(modal).toBeHidden({ timeout: 15000 });

        // Verify in MySQL `project` table
        const conn = await getDbConnection();
        const [dbRows] = await conn.query('SELECT * FROM project WHERE project_code = ?', [demoProject.code]);
        expect(dbRows.length).toBe(1);
        expect(dbRows[0].project_name).toBe(demoProject.name);
        expect(dbRows[0].client_name).toBe(demoProject.client);
        expect(dbRows[0].project_manager).toBe(demoProject.manager);
        expect(dbRows[0].project_type).toBe(demoProject.type);
        createdDbId = dbRows[0].id;

        // Verify in `project_practice` table
        const [pracRows] = await conn.query('SELECT * FROM project_practice WHERE project_id = ?', [createdDbId]);
        expect(pracRows.length).toBe(1);
        expect(pracRows[0].practice).toBe(demoProject.practice);
    });

    test('UIDB-07: Verify Newly Created Project Displays in UI Table with Correct Data', async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });

        const searchInput = page.locator('input[placeholder*="Search projects" i]').first();
        await searchInput.fill(demoProject.name);
        await page.waitForTimeout(500);

        const row = page.locator('table.projects-table tbody tr.data-row').filter({ hasText: demoProject.name });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText(demoProject.code);
        await expect(row).toContainText(demoProject.client);
        await expect(row).toContainText(demoProject.manager);
        await expect(row).toContainText(demoProject.type);
        await expect(row.locator('.col-practice')).toContainText('DT');
    });

    test('UIDB-08: Delete Project via UI and Verify Complete Cascade Deletion in DB', async ({ page }) => {
        expect(createdDbId).toBeDefined();

        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        const searchInput = page.locator('input[placeholder*="Search projects" i]').first();
        await searchInput.fill(demoProject.name);
        await page.waitForTimeout(500);

        const row = page.locator('table.projects-table tbody tr.data-row').filter({ hasText: demoProject.name });
        await expect(row).toHaveCount(1);

        const deleteBtn = row.locator('button.btn-icon-delete, button[title*="delete" i]').first();
        page.once('dialog', async dialog => {
            await dialog.accept();
        });
        await deleteBtn.click();

        // Expect row to disappear from UI
        await expect(page.locator('table.projects-table tbody tr.data-row').filter({ hasText: demoProject.name })).toHaveCount(0, { timeout: 15000 });

        // Verify cascade deletion across all tables in MySQL
        const conn = await getDbConnection();
        const [pRows] = await conn.query('SELECT * FROM project WHERE id = ?', [createdDbId]);
        const [ppRows] = await conn.query('SELECT * FROM project_practice WHERE project_id = ?', [createdDbId]);
        const [prRows] = await conn.query('SELECT * FROM project_role WHERE project_id = ?', [createdDbId]);
        const [psRows] = await conn.query('SELECT * FROM project_sow WHERE project_id = ?', [createdDbId]);
        const [eaRows] = await conn.query('SELECT * FROM employee_allocation WHERE project_id = ?', [createdDbId]);

        expect(pRows.length).toBe(0);
        expect(ppRows.length).toBe(0);
        expect(prRows.length).toBe(0);
        expect(psRows.length).toBe(0);
        expect(eaRows.length).toBe(0);

        createdDbId = null;
    });
});

// ============================================================
// SUITE 3: NEGATIVE FORM VALIDATION & DB INTEGRITY
// ============================================================
test.describe('Suite 3: Negative Form Validations & Database Integrity', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible({ timeout: 30000 });
    });

    test('UIDB-09: Required Form Fields Prevent Creation (No Records Inserted in DB)', async ({ page }) => {
        const conn = await getDbConnection();
        const [beforeCount] = await conn.query('SELECT COUNT(*) as count FROM project');

        await page.getByRole('button', { name: /add project/i }).first().click();
        const modal = page.locator('.project-modal, [role="dialog"]').first();
        await expect(modal).toBeVisible();

        // Submit blank form
        await page.getByRole('button', { name: /save project/i }).first().click();

        // Validation errors shown and modal remains open
        await expect(modal).toBeVisible();
        await expect(page.locator('.field-error, .message.error').first()).toBeVisible();

        // Close modal
        await page.locator('.modal-close-btn, .btn-cancel').first().click();

        // Verify DB count has not changed
        const [afterCount] = await conn.query('SELECT COUNT(*) as count FROM project');
        expect(afterCount[0].count).toBe(beforeCount[0].count);
    });

    test('UIDB-10: Whitespace Project Name Rejected (No Records Inserted in DB)', async ({ page }) => {
        const conn = await getDbConnection();
        const [beforeCount] = await conn.query('SELECT COUNT(*) as count FROM project');

        await page.getByRole('button', { name: /add project/i }).first().click();
        const modal = page.locator('.project-modal, [role="dialog"]').first();
        await expect(modal).toBeVisible();

        await page.locator('input[formcontrolname="projectName"]').fill('     ');
        await page.getByRole('button', { name: /save project/i }).first().click();

        await expect(modal).toBeVisible();
        await page.locator('.modal-close-btn, .btn-cancel').first().click();

        const [afterCount] = await conn.query('SELECT COUNT(*) as count FROM project');
        expect(afterCount[0].count).toBe(beforeCount[0].count);
    });

    test('UIDB-11: Invalid Date Range Rejected (No Records Inserted in DB)', async ({ page }) => {
        const conn = await getDbConnection();
        const [beforeCount] = await conn.query('SELECT COUNT(*) as count FROM project');

        await page.getByRole('button', { name: /add project/i }).first().click();
        const modal = page.locator('.project-modal, [role="dialog"]').first();
        await expect(modal).toBeVisible();

        await page.locator('input[formcontrolname="projectName"]').fill('Invalid Date Test');
        await page.locator('input[formcontrolname="projectCode"]').fill('INVDATE99');
        await page.locator('input[formcontrolname="startDate"]').fill('2026-12-15');
        await page.locator('input[formcontrolname="endDate"]').fill('2026-11-01');

        await page.getByRole('button', { name: /save project/i }).first().click();

        await expect(modal).toBeVisible();
        await expect(page.locator('.message.error, .field-error').first()).toBeVisible();

        await page.locator('.modal-close-btn, .btn-cancel').first().click();

        const [afterCount] = await conn.query('SELECT COUNT(*) as count FROM project');
        expect(afterCount[0].count).toBe(beforeCount[0].count);
    });
});
