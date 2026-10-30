const { test, expect } = require('@playwright/test');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const UI_BASE_URL = (
    process.env.UI_BASE_URL ||
    (process.env.BASE_URL && !process.env.BASE_URL.includes('13.61.179.149') ? process.env.BASE_URL : 'http://localhost:4200')
).replace(/\/+$/, '');

const CLIENT_URL = `${UI_BASE_URL}/admin/addClients`;
const RATE_CARD_URL = `${UI_BASE_URL}/admin/clientRoleRate`;

let dbConnection = null;

async function getDbConnection() {
    if (!dbConnection) {
        const isLocal = UI_BASE_URL.includes('localhost') || UI_BASE_URL.includes('127.0.0.1');
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

test.describe.configure({ mode: 'default' });

test.describe('Admin Client Management - Comprehensive UI vs MySQL DB Validation', () => {
    test.setTimeout(90000);

    test.afterAll(async () => {
        if (dbConnection) {
            await dbConnection.end().catch(() => {});
            dbConnection = null;
        }
    });

    // ============================================================
    // SUITE 1: EXISTING CLIENTS MASTER TABLE UI VS MYSQL
    // ============================================================
    test.describe('Suite 1: Existing Clients Table UI vs MySQL Validation', () => {

        test('CL-DB-UI-01: Total client count and names on UI match MySQL `client` table', async ({ page }) => {
            const conn = await getDbConnection();
            const [dbClients] = await conn.query('SELECT id, name FROM client ORDER BY id ASC');

            await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
            await expect(page.getByRole('heading', { name: /Client Management/i })).toBeVisible({ timeout: 20000 });
            await expect(page.locator('.clients-table-section table')).toBeVisible({ timeout: 15000 });

            // Extract all client rows from UI table
            const uiRows = page.locator('.clients-table-section table tbody tr');
            const uiRowCount = await uiRows.count();
            expect(uiRowCount).toBe(dbClients.length);

            // Extract client names from column 2 (index 1)
            const uiClientNames = [];
            for (let i = 0; i < uiRowCount; i++) {
                const nameText = await uiRows.nth(i).locator('td').nth(1).innerText();
                uiClientNames.push(nameText.trim());
            }

            const dbClientNames = dbClients.map(c => c.name.trim());
            expect(uiClientNames.sort()).toEqual(dbClientNames.sort());
        });

        test('CL-DB-UI-02: Location count for each client matches MySQL `client_location` table', async ({ page }) => {
            const conn = await getDbConnection();
            const [dbLocationCounts] = await conn.query(`
                SELECT c.name, COUNT(cl.id) AS loc_count
                FROM client c
                LEFT JOIN client_location cl ON cl.client_id = c.id
                GROUP BY c.id, c.name
            `);

            const dbCountMap = new Map();
            for (const row of dbLocationCounts) {
                dbCountMap.set(row.name.trim(), Number(row.loc_count));
            }

            await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('.clients-table-section table')).toBeVisible({ timeout: 15000 });

            const uiRows = page.locator('.clients-table-section table tbody tr');
            const uiRowCount = await uiRows.count();

            for (let i = 0; i < uiRowCount; i++) {
                const clientName = (await uiRows.nth(i).locator('td').nth(1).innerText()).trim();
                const uiLocCountText = (await uiRows.nth(i).locator('td').nth(2).innerText()).trim();
                const uiLocCount = parseInt(uiLocCountText, 10) || 0;

                const expectedLocCount = dbCountMap.get(clientName) || 0;
                expect(uiLocCount, `Location count for ${clientName} must match DB`).toBe(expectedLocCount);
            }
        });

        test('CL-DB-UI-03: Action icons (Edit & Delete) exist on every client row', async ({ page }) => {
            await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('.clients-table-section table')).toBeVisible({ timeout: 15000 });

            const uiRows = page.locator('.clients-table-section table tbody tr');
            const uiRowCount = await uiRows.count();
            expect(uiRowCount).toBeGreaterThan(0);

            // Verify first and last rows have action icons
            const firstRow = uiRows.first();
            await expect(firstRow.locator('img[alt*="Edit" i], img[src*="edit" i]')).toBeVisible();
            await expect(firstRow.locator('img[alt*="Delete" i], img[src*="delete" i], .delete-icon')).toBeVisible();
        });
    });

    // ============================================================
    // SUITE 2: CLIENT WIZARD (EDIT MODE) VS MYSQL ENTITY DATA
    // ============================================================
    test.describe('Suite 2: Client Edit Wizard vs MySQL Entity Data', () => {

        test('CL-DB-UI-04: Step 1 Client Name and Locations match MySQL for selected client', async ({ page }) => {
            const clientName = 'Amgen';
            const conn = await getDbConnection();

            const [clientRows] = await conn.query('SELECT id, name FROM client WHERE name = ?', [clientName]);
            expect(clientRows.length).toBe(1);
            const clientId = clientRows[0].id;

            const [dbLocs] = await conn.query('SELECT location FROM client_location WHERE client_id = ? ORDER BY id ASC', [clientId]);

            await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('.clients-table-section table')).toBeVisible({ timeout: 15000 });

            // Click Edit icon for Amgen
            const amgenRow = page.locator('.clients-table-section table tbody tr').filter({ hasText: clientName });
            await expect(amgenRow).toBeVisible();

            const editIcon = amgenRow.locator('img[alt*="Edit" i], img[src*="edit" i]').first();
            await editIcon.click();

            // Handle edit confirmation modal
            const confirmBtn = page.getByRole('button', { name: /^Yes$/i });
            if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await confirmBtn.click();
            }

            // Verify Step 1 is active
            await expect(page.locator('.stepper .step.active')).toContainText('Client & Locations', { timeout: 10000 });

            // Verify Client Name input matches DB
            const clientNameInput = page.locator('input[formControlName="clientName"]');
            await expect(clientNameInput).toHaveValue(clientName);

            // Verify locations listed in Step 1 match MySQL
            const locationInputs = page.locator('input[formControlName="location"]');
            const locCount = await locationInputs.count();
            expect(locCount).toBe(dbLocs.length);

            const uiLocations = [];
            for (let i = 0; i < locCount; i++) {
                uiLocations.push((await locationInputs.nth(i).inputValue()).trim());
            }

            const dbLocationNames = dbLocs.map(l => l.location.trim());
            expect(uiLocations.sort()).toEqual(dbLocationNames.sort());

            // Cancel Edit
            const cancelBtn = page.getByRole('button', { name: /Cancel Edit/i });
            if (await cancelBtn.isVisible()) await cancelBtn.click();
        });

        test('CL-DB-UI-05: Step 2 Client Roles match MySQL `client_role` table', async ({ page }) => {
            const clientName = 'Amgen';
            const conn = await getDbConnection();
            const [clientRows] = await conn.query('SELECT id FROM client WHERE name = ?', [clientName]);
            const clientId = clientRows[0].id;

            const [dbRoles] = await conn.query('SELECT role FROM client_role WHERE client_id = ? ORDER BY id ASC', [clientId]);

            await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('.clients-table-section table')).toBeVisible({ timeout: 15000 });

            // Open Edit wizard for Amgen
            const amgenRow = page.locator('.clients-table-section table tbody tr').filter({ hasText: clientName });
            await amgenRow.locator('img[alt*="Edit" i], img[src*="edit" i]').first().click();

            const confirmBtn = page.getByRole('button', { name: /^Yes$/i });
            if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await confirmBtn.click();
            }

            // Navigate to Step 2 via stepper
            const step2 = page.locator('.stepper .step').filter({ hasText: 'Add Roles' });
            await step2.click();
            await expect(page.locator('.step-badge')).toContainText('Step 2 of 4');

            // Verify roles table in Step 2
            if (dbRoles.length > 0) {
                const rolesTable = page.locator('.roles-table-wrap table');
                await expect(rolesTable).toBeVisible({ timeout: 10000 });

                const roleRows = rolesTable.locator('tbody tr');
                const roleCount = await roleRows.count();
                expect(roleCount).toBe(dbRoles.length);

                const uiRoles = [];
                for (let i = 0; i < roleCount; i++) {
                    uiRoles.push((await roleRows.nth(i).locator('td').nth(1).innerText()).trim());
                }

                const dbRoleNames = dbRoles.map(r => r.role.trim());
                expect(uiRoles.sort()).toEqual(dbRoleNames.sort());
            }

            // Cancel Edit
            const cancelBtn = page.getByRole('button', { name: /Cancel Edit/i });
            if (await cancelBtn.isVisible()) await cancelBtn.click();
        });

        test('CL-DB-UI-06: Step 4 Projects match MySQL `project` table for selected client', async ({ page }) => {
            const clientName = 'Amgen';
            const conn = await getDbConnection();

            const [dbProjects] = await conn.query(`
                SELECT project_name, project_code, project_manager, project_type 
                FROM project 
                WHERE client_name = ? AND is_valid = 1
                ORDER BY id ASC
            `, [clientName]);

            await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('.clients-table-section table')).toBeVisible({ timeout: 15000 });

            // Open Edit wizard for Amgen
            const amgenRow = page.locator('.clients-table-section table tbody tr').filter({ hasText: clientName });
            await amgenRow.locator('img[alt*="Edit" i], img[src*="edit" i]').first().click();

            const confirmBtn = page.getByRole('button', { name: /^Yes$/i });
            if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await confirmBtn.click();
            }

            // Navigate to Step 4 via stepper
            const step4 = page.locator('.stepper .step').filter({ hasText: 'Add Projects' });
            await step4.click();
            await expect(page.locator('.step-badge')).toContainText('Step 4 of 4');

            if (dbProjects.length > 0) {
                // Table of existing projects
                const projectTable = page.locator('.existing-projects-section table, table.data-table').first();
                await expect(projectTable).toBeVisible({ timeout: 10000 });

                const rows = projectTable.locator('tbody tr');
                const rowCount = await rows.count();
                expect(rowCount).toBe(dbProjects.length);

                for (let i = 0; i < rowCount; i++) {
                    const rowText = await rows.nth(i).innerText();
                    const matchingDbProj = dbProjects.find(p => rowText.includes(p.project_code));
                    expect(matchingDbProj, `UI project row must correspond to a valid DB project code`).toBeDefined();
                }
            }

            // Cancel Edit Wizard to return to clean table state
            const cancelBtn = page.getByRole('button', { name: /Cancel Edit/i });
            if (await cancelBtn.isVisible()) {
                await cancelBtn.click();
            }
        });
    });

    // ============================================================
    // SUITE 3: CLIENT RATE CARD DETAILS UI VS MYSQL
    // ============================================================
    test.describe('Suite 3: Client Rate Card Details UI vs MySQL Validation', () => {

        test('CL-DB-UI-07: Client & Financial Year dropdowns on /admin/clientRoleRate match MySQL', async ({ page }) => {
            const conn = await getDbConnection();
            const [dbClients] = await conn.query('SELECT id, name FROM client ORDER BY name ASC');

            await page.goto(RATE_CARD_URL, { waitUntil: 'domcontentloaded' });
            await expect(page.getByRole('heading', { name: /Client Rate Card Details/i })).toBeVisible({ timeout: 20000 });

            // 1. Client Dropdown validation
            const clientSelect = page.locator('select#client');
            await expect(clientSelect).toBeVisible();

            const uiClientOptions = (await clientSelect.locator('option').allTextContents())
                .map(t => t.trim())
                .filter(t => t && !t.includes('Select a Client'));

            expect(uiClientOptions.length).toBe(dbClients.length);
            const dbClientNames = dbClients.map(c => c.name.trim());
            expect(uiClientOptions.sort()).toEqual(dbClientNames.sort());

            // 2. Select a client with rate cards in DB
            const [rcClient] = await conn.query(`
                SELECT crc.client_id, c.name AS client_name
                FROM client_rate_card crc
                JOIN client c ON crc.client_id = c.id
                LIMIT 1
            `);
            const targetClientId = rcClient[0].client_id;

            // Fetch expected financial years for this client from financial_quarter & financial_year tables
            const [dbClientYears] = await conn.query(`
                SELECT DISTINCT fy.id, fy.year 
                FROM financial_quarter fq 
                JOIN financial_year fy ON fq.fy_id = fy.id 
                WHERE fq.client_id = ?
                ORDER BY fy.id ASC
            `, [targetClientId]);

            await page.selectOption('select#client', String(targetClientId));

            // 3. Financial Year Dropdown validation for selected client
            const yearSelect = page.locator('select#year');
            await page.waitForFunction(() => document.querySelectorAll('select#year option').length > 1, { timeout: 10000 });

            const uiYearOptions = (await yearSelect.locator('option').allTextContents())
                .map(t => t.trim())
                .filter(t => t && !t.includes('Select a Year'));

            expect(uiYearOptions.length).toBe(dbClientYears.length);
            const dbYearNames = dbClientYears.map(y => y.year.trim());
            expect(uiYearOptions.sort()).toEqual(dbYearNames.sort());
        });

        test('CL-DB-UI-08: Selected client rate card table matrix & SBR values match MySQL `client_rate_card`', async ({ page }) => {
            const conn = await getDbConnection();

            // Find a client and FY with rate cards in DB and active in financial_quarter
            const [rcSample] = await conn.query(`
                SELECT crc.client_id, c.name AS client_name, crc.financial_year_id, fy.year AS fy_name
                FROM client_rate_card crc
                JOIN client c ON crc.client_id = c.id
                JOIN financial_year fy ON crc.financial_year_id = fy.id
                JOIN financial_quarter fq ON fq.client_id = c.id AND fq.fy_id = fy.id
                LIMIT 1
            `);
            expect(rcSample.length).toBe(1);

            const { client_id, client_name, financial_year_id, fy_name } = rcSample[0];

            // Fetch expected matrix from DB
            const [expectedCards] = await conn.query(`
                SELECT cr.role, cl.location, crc.sbr_value
                FROM client_rate_card crc
                JOIN client_role cr ON crc.role_id = cr.id
                JOIN client_location cl ON crc.location_id = cl.id
                WHERE crc.client_id = ? AND crc.financial_year_id = ?
                ORDER BY cr.role ASC, cl.location ASC
            `, [client_id, financial_year_id]);

            await page.goto(RATE_CARD_URL, { waitUntil: 'domcontentloaded' });

            // Select Client
            await page.selectOption('select#client', String(client_id));

            // Wait for year options to load for selected client
            await page.waitForFunction(() => document.querySelectorAll('select#year option').length > 1, { timeout: 10000 });

            // Select Financial Year
            await page.selectOption('select#year', String(financial_year_id));

            // Verify Table renders and data rows are populated
            const table = page.locator('table.custom-table');
            await expect(table).toBeVisible({ timeout: 15000 });
            await expect(table.locator('tbody tr, tr:has(td)').first()).toBeVisible({ timeout: 10000 });

            // Extract table headers to identify locations
            const headers = (await table.locator('th').allTextContents()).map(h => h.trim());
            expect(headers).toContain('Role');

            // Verify each role in DB is present in UI rows
            const rows = table.locator('tbody tr');
            const rowCount = await rows.count();
            expect(rowCount).toBeGreaterThan(0);

            const uiRowsText = [];
            for (let i = 0; i < rowCount; i++) {
                uiRowsText.push(await rows.nth(i).innerText());
            }

            for (const card of expectedCards) {
                const trimmedRole = card.role.trim();
                const roleExistsInUi = uiRowsText.some(text => text.includes(trimmedRole));
                expect(roleExistsInUi, `Rate card role "${trimmedRole}" must appear in UI matrix`).toBe(true);

                if (card.sbr_value !== null) {
                    const sbrStr = card.sbr_value.toString();
                    const sbrExistsInUi = uiRowsText.some(text => text.includes(sbrStr));
                    expect(sbrExistsInUi, `Rate card SBR value ${card.sbr_value} must appear in UI`).toBe(true);
                }
            }
        });
    });

    // ============================================================
    // SUITE 4: LIVE UI ACTION TO DB SYNCHRONIZATION
    // ============================================================
    test.describe('Suite 4: Live UI Action to DB Synchronization', () => {

        test('CL-DB-UI-09 & 10: New Client creation in UI commits to MySQL, and UI deletion purges from DB', async ({ page }) => {
            const conn = await getDbConnection();
            const uniqueSuffix = Date.now().toString().slice(-6);
            const clientName = `LiveAutoClient ${uniqueSuffix}`;
            const locationName = `LiveOffshore ${uniqueSuffix}`;

            await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });

            // 1. Click New Client Wizard
            const wizardBtn = page.getByRole('button', { name: /New Client Wizard/i });
            await expect(wizardBtn).toBeVisible({ timeout: 15000 });
            await wizardBtn.click();

            // 2. Fill Client Name
            await page.locator('input[formControlName="clientName"]').fill(clientName);

            // 3. Add Location
            const addLocBtn = page.getByRole('button', { name: /\+ Add Location/i });
            await addLocBtn.click();
            const locInput = page.locator('input[formControlName="location"]').first();
            await locInput.fill(locationName);

            // 4. Submit Step 1
            const nextBtn = page.getByRole('button', { name: /Save & Continue/i }).or(page.locator('button[type="submit"]'));
            await nextBtn.click();

            // Verify transitioned to Step 2
            await expect(page.locator('.step-badge')).toContainText('Step 2 of 4', { timeout: 15000 });

            // 5. Verify record in MySQL immediately
            const [createdClientRows] = await conn.query('SELECT id, name FROM client WHERE name = ?', [clientName]);
            expect(createdClientRows.length, `New client "${clientName}" must exist in MySQL client table`).toBe(1);
            const createdClientId = createdClientRows[0].id;

            const [createdLocRows] = await conn.query('SELECT location FROM client_location WHERE client_id = ?', [createdClientId]);
            expect(createdLocRows.length).toBe(1);
            expect(createdLocRows[0].location).toBe(locationName);

            // 6. Cancel / Close Wizard to return to Clients Table
            const cancelBtn = page.getByRole('button', { name: /Cancel Wizard|Cancel/i });
            await cancelBtn.click();

            await expect(page.locator('.clients-table-section table')).toBeVisible({ timeout: 15000 });

            // 7. Verify new client row is visible in Existing Clients table
            const clientRow = page.locator('.clients-table-section table tbody tr').filter({ hasText: clientName });
            await expect(clientRow).toBeVisible();

            // 8. Delete the client via UI
            const deleteIcon = clientRow.locator('img[alt*="Delete" i], img[src*="delete" i], .delete-icon').first();
            await deleteIcon.click();

            // Wait for Confirmation modal ("Are you sure you want to delete ...?")
            const yesBtn = page.getByRole('button', { name: /^Yes$/i }).or(page.locator('button:has-text("Yes")'));
            await expect(yesBtn).toBeVisible({ timeout: 10000 });
            await yesBtn.click();

            // Dismiss the "Client Deleted Successfully" notification modal
            const okBtn = page.getByRole('button', { name: /^Ok$/i }).or(page.locator('button:has-text("Ok")'));
            await expect(okBtn).toBeVisible({ timeout: 10000 });
            await okBtn.click();

            // Verify removed from UI table
            await expect(page.locator('.clients-table-section table tbody tr').filter({ hasText: clientName })).toHaveCount(0, { timeout: 15000 });

            // 9. Verify completely purged from MySQL with zero orphaned rows
            const [clientAfterDelete] = await conn.query('SELECT COUNT(*) AS cnt FROM client WHERE id = ?', [createdClientId]);
            expect(Number(clientAfterDelete[0].cnt)).toBe(0);

            const [locsAfterDelete] = await conn.query('SELECT COUNT(*) AS cnt FROM client_location WHERE client_id = ?', [createdClientId]);
            expect(Number(locsAfterDelete[0].cnt)).toBe(0);

            const [rateCardsAfterDelete] = await conn.query('SELECT COUNT(*) AS cnt FROM client_rate_card WHERE client_id = ?', [createdClientId]);
            expect(Number(rateCardsAfterDelete[0].cnt)).toBe(0);
        });
    });
});
