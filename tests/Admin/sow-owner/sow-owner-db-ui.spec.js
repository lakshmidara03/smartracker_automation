const { test, expect } = require('@playwright/test');
const mysql = require('mysql2/promise');
require('dotenv').config();

const BASE_URL = (process.env.BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
const CLIENT_URL = `${BASE_URL}/admin/sow-owner/client`;

const DB_CONFIG = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

function demoName(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function connectDB() {
    for (const key of ['host', 'user', 'password', 'database']) {
        expect(
            DB_CONFIG[key],
            `Missing required database environment variable: DB_${key.toUpperCase()}`
        ).toBeTruthy();
    }

    return mysql.createConnection(DB_CONFIG);
}

async function getOwnerByName(db, name) {
    const [rows] = await db.execute(
        `SELECT
            id,
            client_sow_owner,
            client_id,
            created_by,
            created_date,
            updated_by,
            updated_date
         FROM client_sow_owner
         WHERE client_sow_owner = ?`,
        [name]
    );

    return rows;
}

async function getOwnerById(db, id) {
    const [rows] = await db.execute(
        `SELECT
            id,
            client_sow_owner,
            client_id,
            created_by,
            created_date,
            updated_by,
            updated_date
         FROM client_sow_owner
         WHERE id = ?`,
        [id]
    );

    return rows;
}

async function getClientById(db, clientId) {
    const [rows] = await db.execute(
        `SELECT id, name
         FROM client
         WHERE id = ?`,
        [clientId]
    );

    return rows;
}

async function openClientPage(page) {
    await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });

    await expect(
        page.getByText('SOW Owner Management', { exact: true })
    ).toBeVisible();

    await expect(
        page.getByText('Client SOW Owners', { exact: true })
    ).toBeVisible();

    await expect(page.locator('table')).toBeVisible();
}

function clientDropdown(page) {
    return page.locator('select').first();
}

function ownerInput(page) {
    return page.getByPlaceholder('Enter Client SoW Owner name', {
        exact: true
    });
}

function addButton(page) {
    return page.getByRole('button', {
        name: /Add Client SOW Owner/i
    });
}

function updateButton(page) {
    return page.getByRole('button', {
        name: /Update Client SOW Owner/i
    });
}

async function selectClient(page) {
    const dropdown = clientDropdown(page);

    await expect(dropdown).toBeVisible();

    const options = await dropdown.locator('option').evaluateAll(elements =>
        elements.map(option => ({
            value: option.value,
            text: option.textContent.trim()
        }))
    );

    const selectedClient = options.find(option =>
        option.value.trim() !== '' &&
        !/^select a client$/i.test(option.text)
    );

    expect(
        selectedClient,
        `No selectable client found. Options: ${JSON.stringify(options)}`
    ).toBeTruthy();

    await dropdown.selectOption(selectedClient.value);
    await expect(dropdown).toHaveValue(selectedClient.value);

    return {
        id: Number(selectedClient.value),
        name: selectedClient.text
    };
}

async function findTableRow(page, name) {
    const row = page.locator('tbody tr').filter({
        hasText: name
    });

    await expect(
        row,
        `Expected exactly one row for owner: ${name}`
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

test.describe('Admin - Client SOW Owner UI and DB Validation', () => {

    // ==================================================
    // TEST 1: PAGE AND EXISTING DATA VALIDATION
    // ==================================================

    test('SOW-DBUI-P001: Verify existing UI owner records against database', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const [dbRows] = await db.execute(
                `SELECT
                    o.id,
                    o.client_sow_owner,
                    o.client_id,
                    c.name AS client_name
                 FROM client_sow_owner o
                 LEFT JOIN client c ON c.id = o.client_id
                 ORDER BY c.name ASC, o.client_sow_owner ASC`
            );

            const uiRows = page.locator('tbody tr');
            const uiCount = await uiRows.count();

            expect(
                uiCount,
                'UI row count must match the database row count'
            ).toBe(dbRows.length);

            for (let i = 0; i < dbRows.length; i++) {
                const row = uiRows.nth(i);
                const cells = row.locator('td');

                await expect(cells.nth(0)).toHaveText(String(i + 1));
                await expect(cells.nth(1)).toHaveText(dbRows[i].client_name);
                await expect(cells.nth(2)).toHaveText(dbRows[i].client_sow_owner);
            }
        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 2: CREATE AND VERIFY IN DATABASE
    // ==================================================

    test('SOW-DBUI-P002: Create demo owner and verify database insertion', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const name = demoName('AUTO_DEMO_CLIENT');
            const client = await selectClient(page);

            const beforeRows = await getOwnerByName(db, name);
            expect(beforeRows.length).toBe(0);

            await ownerInput(page).fill(name);
            await addButton(page).click();

            const uiRow = await findTableRow(page, name);

            await expect(uiRow).toContainText(client.name);

            const dbRows = await getOwnerByName(db, name);

            expect(
                dbRows.length,
                'Exactly one record must be inserted'
            ).toBe(1);

            expect(dbRows[0].client_sow_owner).toBe(name);
            expect(Number(dbRows[0].client_id)).toBe(client.id);

            const clientRows = await getClientById(db, client.id);

            expect(clientRows.length).toBe(1);
            expect(clientRows[0].name).toBe(client.name);

            expect(dbRows[0].created_date).not.toBeNull();
        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 3: MULTIPLE OWNERS FOR SAME CLIENT
    // ==================================================

    test('SOW-DBUI-P003: Create two owners for the same client', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const client = await selectClient(page);

            const name1 = demoName('AUTO_MULTI_OWNER_1');
            const name2 = demoName('AUTO_MULTI_OWNER_2');

            await ownerInput(page).fill(name1);
            await addButton(page).click();

            await findTableRow(page, name1);

            await selectClient(page);
            await ownerInput(page).fill(name2);
            await addButton(page).click();

            await findTableRow(page, name2);

            const rows1 = await getOwnerByName(db, name1);
            const rows2 = await getOwnerByName(db, name2);

            expect(rows1.length).toBe(1);
            expect(rows2.length).toBe(1);

            expect(Number(rows1[0].client_id)).toBe(client.id);
            expect(Number(rows2[0].client_id)).toBe(client.id);
        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 4: UPDATE AND VERIFY IN DATABASE
    // ==================================================

    test('SOW-DBUI-P004: Update demo owner and verify database changes', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const originalName = demoName('AUTO_UPDATE_OWNER');
            const updatedName = demoName('AUTO_UPDATE_OWNER_UPD');

            await selectClient(page);

            await ownerInput(page).fill(originalName);
            await addButton(page).click();

            await findTableRow(page, originalName);

            const originalRows = await getOwnerByName(db, originalName);

            expect(originalRows.length).toBe(1);

            const ownerId = originalRows[0].id;
            const originalClientId = originalRows[0].client_id;

            const row = await findTableRow(page, originalName);

            await row.getByRole('button', {
                name: /^Edit$/i
            }).click();

            await expect(ownerInput(page)).toHaveValue(originalName);

            await ownerInput(page).fill(updatedName);
            await updateButton(page).click();

            await findTableRow(page, updatedName);

            const updatedRows = await getOwnerById(db, ownerId);

            expect(updatedRows.length).toBe(1);
            expect(updatedRows[0].client_sow_owner).toBe(updatedName);
            expect(Number(updatedRows[0].client_id)).toBe(Number(originalClientId));

            const oldRows = await getOwnerByName(db, originalName);
            expect(oldRows.length).toBe(0);

            await expect(
                page.locator('tbody tr').filter({ hasText: originalName })
            ).toHaveCount(0);

            expect(updatedRows[0].updated_date).not.toBeNull();
        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 5: CANCEL EDIT AND VERIFY DB UNCHANGED
    // ==================================================

    test('SOW-DBUI-P005: Cancel edit and verify database remains unchanged', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const originalName = demoName('AUTO_CANCEL_OWNER');
            const changedName = `${originalName}_UNSAVED`;

            await selectClient(page);

            await ownerInput(page).fill(originalName);
            await addButton(page).click();

            const row = await findTableRow(page, originalName);

            const originalRows = await getOwnerByName(db, originalName);
            expect(originalRows.length).toBe(1);

            const ownerId = originalRows[0].id;

            await row.getByRole('button', {
                name: /^Edit$/i
            }).click();

            await ownerInput(page).fill(changedName);

            await page.getByRole('button', {
                name: /^Cancel$/i
            }).click();

            await findTableRow(page, originalName);

            const dbRows = await getOwnerById(db, ownerId);

            expect(dbRows.length).toBe(1);
            expect(dbRows[0].client_sow_owner).toBe(originalName);

            const changedRows = await getOwnerByName(db, changedName);
            expect(changedRows.length).toBe(0);
        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 6: EMPTY OWNER NAME
    // ==================================================

    test('SOW-DBUI-N001: Empty owner name must not insert a database record', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const client = await selectClient(page);
            const beforeRows = await db.execute(
                'SELECT COUNT(*) AS total FROM client_sow_owner'
            );

            await ownerInput(page).fill('');
            await addButton(page).click();

            await expect(
                page.getByText(/owner.*required|required.*owner/i).first()
            ).toBeVisible();

            const [afterRows] = await db.execute(
                'SELECT COUNT(*) AS total FROM client_sow_owner'
            );

            expect(afterRows[0].total).toBe(beforeRows[0][0].total);

            const clientRows = await getClientById(db, client.id);
            expect(clientRows.length).toBe(1);
        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 7: CLIENT IS REQUIRED
    // ==================================================

    test('SOW-DBUI-N002: Missing client must not insert a database record', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const name = demoName('AUTO_NO_CLIENT');

            const [beforeRows] = await db.execute(
                'SELECT COUNT(*) AS total FROM client_sow_owner'
            );

            await ownerInput(page).fill(name);
            await clientDropdown(page).selectOption({ index: 0 });
            await addButton(page).click();

            await expect(
                page.getByText(/client is required|required.*client/i).first()
            ).toBeVisible();

            const [afterRows] = await db.execute(
                'SELECT COUNT(*) AS total FROM client_sow_owner'
            );

            expect(afterRows[0].total).toBe(beforeRows[0].total);

            const insertedRows = await getOwnerByName(db, name);
            expect(insertedRows.length).toBe(0);
        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 8: WHITESPACE OWNER NAME
    // ==================================================

    test('SOW-DBUI-N003: Whitespace-only name must not be inserted', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            await selectClient(page);

            const [beforeRows] = await db.execute(
                'SELECT COUNT(*) AS total FROM client_sow_owner'
            );

            await ownerInput(page).fill('     ');
            await addButton(page).click();

            const errorMsg = page.getByText(/owner.*required|required.*owner|valid.*owner/i).first();
            await expect(errorMsg).toBeVisible();

            const [afterRows] = await db.execute(
                'SELECT COUNT(*) AS total FROM client_sow_owner'
            );

            expect(afterRows[0].total).toBe(beforeRows[0].total);
        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 9: DELETE DEMO RECORD
    // ==================================================

    test('SOW-DBUI-E001: Create and delete only a demo owner, then verify database', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const name = demoName('AUTO_DEMO_DELETE');

            await selectClient(page);

            await ownerInput(page).fill(name);
            await addButton(page).click();

            let row = await findTableRow(page, name);

            const insertedRows = await getOwnerByName(db, name);
            expect(insertedRows.length).toBe(1);

            const ownerId = insertedRows[0].id;

            // Cancel deletion first and verify that the row remains.
            await cancelDeleteModal(page, row);

            await findTableRow(page, name);

            // Confirm deletion of this test-created record.
            row = await findTableRow(page, name);
            await confirmDeleteModal(page, row);

            await expect(
                page.locator('tbody tr').filter({ hasText: name })
            ).toHaveCount(0);

            const deletedRows = await getOwnerById(db, ownerId);

            expect(
                deletedRows.length,
                'Deleted demo record must not exist in the database'
            ).toBe(0);

            await page.reload();

            await expect(
                page.locator('tbody tr').filter({ hasText: name })
            ).toHaveCount(0);

        } finally {
            await db.end();
        }
    });

    // ==================================================
    // TEST 10: VERIFY CLIENT RELATIONSHIP
    // ==================================================

    test('SOW-DBUI-E002: Verify owner client relationship using database join', async ({ page }) => {
        const db = await connectDB();

        try {
            await openClientPage(page);

            const name = demoName('AUTO_CLIENT_RELATION');
            const selectedClient = await selectClient(page);

            await ownerInput(page).fill(name);
            await addButton(page).click();

            await findTableRow(page, name);

            const [rows] = await db.execute(
                `SELECT
                    o.id,
                    o.client_sow_owner,
                    o.client_id,
                    c.name AS client_name
                 FROM client_sow_owner o
                 INNER JOIN client c ON c.id = o.client_id
                 WHERE o.client_sow_owner = ?`,
                [name]
            );

            expect(rows.length).toBe(1);
            expect(rows[0].client_sow_owner).toBe(name);
            expect(Number(rows[0].client_id)).toBe(selectedClient.id);
            expect(rows[0].client_name).toBe(selectedClient.name);

        } finally {
            await db.end();
        }
    });
});