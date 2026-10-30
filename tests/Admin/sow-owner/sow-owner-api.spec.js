const { test, expect, request } = require('@playwright/test');
const mysql = require('mysql2/promise');
require('dotenv').config();

// =====================================================
// CONFIGURATION
// =====================================================

const fs = require('fs');
const path = require('path');

const BASE_URL = (
    process.env.BASE_URL || 'http://localhost:4200'
).replace(/\/$/, '');

const API_ROOT = (
    process.env.API_BASE_URL ||
    (BASE_URL.includes('localhost') ? 'http://localhost:8080/api' : `${BASE_URL}/api/api`)
).replace(/\/+$/, '');

const API_BASE = `${API_ROOT}/client-sowowner`;

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'hrportal'
};

// Confirm these against ClientSowOwnerController.java.
const EXPECTED = {
    create: 200,
    getAll: 200,
    getById: 200,
    getByClientId: 200,
    update: 200,
    delete: 200,
    missingClientOwners: 204
};

const DEMO_PREFIX = 'AUTO_API_SOW_OWNER';

// =====================================================
// HELPERS
// =====================================================

function uniqueName(prefix = DEMO_PREFIX) {
    return `${prefix}_${Date.now()}_${Math.random()
        .toString(36).slice(2, 8)}`;
}

async function createDbConnection() {
    for (const key of ['host', 'user', 'password', 'database']) {
        if (!DB_CONFIG[key]) {
            throw new Error(
                `Missing database configuration: DB_${key.toUpperCase()}`
            );
        }
    }

    return mysql.createConnection(DB_CONFIG);
}

function getToken() {
    if (process.env.API_TOKEN && process.env.API_TOKEN.trim().length > 10) {
        return process.env.API_TOKEN.trim();
    }

    try {
        const authPath = path.resolve(__dirname, '../../../.auth/user.json');
        if (fs.existsSync(authPath)) {
            const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
            const ls = authData.origins?.[0]?.localStorage || [];
            const tokenItem = ls.find(item => item.name.toLowerCase().includes('token'));
            if (tokenItem) {
                let tokenStr = tokenItem.value;
                if (tokenStr.startsWith('"') && tokenStr.endsWith('"')) {
                    tokenStr = tokenStr.slice(1, -1);
                }
                return tokenStr;
            }
        }
    } catch (e) {}

    return '';
}

async function createApiContext(token) {
    if (!token || token.trim().length < 10) {
        throw new Error(
            'API token is missing or invalid. Please ensure .auth/user.json or API_TOKEN is configured.'
        );
    }

    return request.newContext({
        baseURL: `${API_BASE}/`,
        extraHTTPHeaders: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        ignoreHTTPSErrors: true
    });
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
        'SELECT id, name FROM client WHERE id = ?',
        [clientId]
    );

    return rows;
}

async function getValidClientId(db) {
    const [rows] = await db.execute(
        'SELECT id FROM client ORDER BY id LIMIT 1'
    );

    expect(
        rows.length,
        'At least one client must exist in the database'
    ).toBeGreaterThan(0);

    return Number(rows[0].id);
}

async function responseJson(response, description) {
    const text = await response.text();

    expect(
        response.status(),
        `${description}. Actual response: ${text}`
    ).toBe(EXPECTED[description]);

    return text ? JSON.parse(text) : null;
}

// =====================================================
// TEST SUITE
// =====================================================

test.describe('Admin - SOW Owner Management API Automation', () => {

    let api;
    let db;

    test.beforeAll(async () => {
        db = await createDbConnection();
        api = await createApiContext(getToken());
    });

    test.afterAll(async () => {
        if (api) {
            await api.dispose();
        }

        if (db) {
            await db.end();
        }
    });

    // =================================================
    // 1. CREATE API - POSITIVE TESTS
    // =================================================

    test('SOW-API-P001: Create SOW owner with valid data and verify DB', async () => {
        const name = uniqueName();
        const clientId = await getValidClientId(db);

        const beforeRows = await getOwnerByName(db, name);
        expect(beforeRows.length).toBe(0);

        const nowIso = new Date().toISOString();
        const response = await api.post('save', {
            data: {
                clientSowOwner: name,
                client: {
                    id: clientId
                },
                createdBy: 'automation-test',
                createdDate: nowIso
            }
        });

        const body = await responseJson(response, 'create');

        expect(body).toBeTruthy();
        expect(body.id).toBeTruthy();
        expect(body.clientSowOwner).toBe(name);
        expect(Number(body.client.id)).toBe(clientId);

        const dbRows = await getOwnerById(db, body.id);

        expect(dbRows.length).toBe(1);
        expect(dbRows[0].client_sow_owner).toBe(name);
        expect(Number(dbRows[0].client_id)).toBe(clientId);
        expect(dbRows[0].created_date).not.toBeNull();

        const clientRows = await getClientById(db, clientId);
        expect(clientRows.length).toBe(1);
    });

    test('SOW-API-P002: Create multiple owners for the same client', async () => {
        const clientId = await getValidClientId(db);

        const name1 = uniqueName('AUTO_MULTI_1');
        const name2 = uniqueName('AUTO_MULTI_2');

        const res1 = await api.post('save', {
            data: {
                clientSowOwner: name1,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        const body1 = await responseJson(res1, 'create');

        const res2 = await api.post('save', {
            data: {
                clientSowOwner: name2,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        const body2 = await responseJson(res2, 'create');

        expect(body1.clientSowOwner).toBe(name1);
        expect(body2.clientSowOwner).toBe(name2);

        const rows1 = await getOwnerByName(db, name1);
        const rows2 = await getOwnerByName(db, name2);

        expect(rows1.length).toBe(1);
        expect(rows2.length).toBe(1);

        expect(Number(rows1[0].client_id)).toBe(clientId);
        expect(Number(rows2[0].client_id)).toBe(clientId);
    });

    // =================================================
    // 2. GET ALL API
    // =================================================

    test('SOW-API-P003: Get all SOW owners and verify DB records', async () => {
        const response = await api.get('getAll');

        expect(response.status()).toBe(EXPECTED.getAll);

        const apiRecords = await response.json();

        expect(Array.isArray(apiRecords)).toBe(true);

        const [dbRows] = await db.execute(
            `SELECT id, client_sow_owner, client_id
             FROM client_sow_owner
             ORDER BY id`
        );

        expect(apiRecords.length).toBe(dbRows.length);

        const dbMap = new Map(
            dbRows.map(row => [String(row.id), row])
        );

        for (const record of apiRecords) {
            const dbRecord = dbMap.get(String(record.id));

            expect(
                dbRecord,
                `API record ID ${record.id} must exist in DB`
            ).toBeTruthy();

            expect(record.clientSowOwner)
                .toBe(dbRecord.client_sow_owner);

            expect(Number(record.client.id))
                .toBe(Number(dbRecord.client_id));
        }
    });

    // =================================================
    // 3. GET BY ID API
    // =================================================

    test('SOW-API-P004: Get owner by valid ID', async () => {
        const name = uniqueName('AUTO_GET_ID');
        const clientId = await getValidClientId(db);

        const createResponse = await api.post('save', {
            data: {
                clientSowOwner: name,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        const created = await responseJson(createResponse, 'create');

        const response = await api.get(String(created.id));

        expect(response.status()).toBe(EXPECTED.getById);

        const body = await response.json();

        expect(body.id).toBe(created.id);
        expect(body.clientSowOwner).toBe(name);
        expect(Number(body.client.id)).toBe(clientId);

        const dbRows = await getOwnerById(db, created.id);

        expect(dbRows.length).toBe(1);
        expect(dbRows[0].client_sow_owner).toBe(body.clientSowOwner);
    });

    // =================================================
    // 4. GET BY CLIENT ID API
    // =================================================

    test('SOW-API-P005: Get owners by client ID', async () => {
        const clientId = await getValidClientId(db);

        const name = uniqueName('AUTO_CLIENT_LOOKUP');

        const createResponse = await api.post('save', {
            data: {
                clientSowOwner: name,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        await responseJson(createResponse, 'create');

        const response = await api.get(
            `getByClientId/${clientId}`
        );

        expect(response.status()).toBe(EXPECTED.getByClientId);

        const body = await response.json();

        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);

        for (const owner of body) {
            expect(Number(owner.client.id)).toBe(clientId);
        }

        const [dbRows] = await db.execute(
            `SELECT id, client_sow_owner, client_id
             FROM client_sow_owner
             WHERE client_id = ?`,
            [clientId]
        );

        expect(body.length).toBe(dbRows.length);

        const dbIds = new Set(dbRows.map(row => String(row.id)));

        for (const owner of body) {
            expect(dbIds.has(String(owner.id))).toBe(true);
        }
    });

    // =================================================
    // 5. UPDATE API
    // =================================================

    test('SOW-API-P006: Update owner name and verify DB', async () => {
        const originalName = uniqueName('AUTO_UPDATE');
        const updatedName = `${originalName}_UPDATED`;
        const clientId = await getValidClientId(db);

        const createResponse = await api.post('save', {
            data: {
                clientSowOwner: originalName,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        const created = await responseJson(createResponse, 'create');

        const updateResponse = await api.put(
            `update/${created.id}`,
            {
                data: {
                    clientSowOwner: updatedName,
                    client: { id: clientId },
                    updatedBy: 'automation-test'
                }
            }
        );

        const updated = await responseJson(updateResponse, 'update');

        expect(updated.clientSowOwner).toBe(updatedName);
        expect(updated.id).toBe(created.id);

        const dbRows = await getOwnerById(db, created.id);

        expect(dbRows.length).toBe(1);
        expect(dbRows[0].client_sow_owner).toBe(updatedName);
        expect(Number(dbRows[0].client_id)).toBe(clientId);

        const oldRows = await getOwnerByName(db, originalName);
        expect(oldRows.length).toBe(0);
    });

    // =================================================
    // 6. DELETE API - DEMO RECORD ONLY
    // =================================================

    test('SOW-API-P007: Delete demo owner and verify DB deletion', async () => {
        const name = uniqueName('AUTO_DELETE');
        const clientId = await getValidClientId(db);

        const createResponse = await api.post('save', {
            data: {
                clientSowOwner: name,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        const created = await responseJson(createResponse, 'create');

        const beforeDelete = await getOwnerById(db, created.id);

        expect(beforeDelete.length).toBe(1);

        const deleteResponse = await api.delete(
            `delete/${created.id}`
        );

        expect(
            deleteResponse.status(),
            `Unexpected DELETE response: ${await deleteResponse.text()}`
        ).toBe(EXPECTED.delete);

        const afterDelete = await getOwnerById(db, created.id);

        expect(
            afterDelete.length,
            'Demo owner must be deleted from the database'
        ).toBe(0);

        const getResponse = await api.get(String(created.id));

        // The backend returns HTTP 200 with an empty body when absent.
        expect(getResponse.status()).toBe(200);
        const getText = await getResponse.text();
        expect(getText ? JSON.parse(getText) : null).toBeNull();
    });

    // =================================================
    // 7. NEGATIVE API TESTS
    // =================================================

    test('SOW-API-N001: Get nonexistent owner ID', async () => {
        const nonexistentId = 999999999;

        const response = await api.get(String(nonexistentId));

        // Controller returns HTTP 200 with empty body when entity is not found.
        expect(response.status()).toBe(200);
        const text = await response.text();
        expect(text ? JSON.parse(text) : null).toBeNull();
    });

    test('SOW-API-N002: Get owners for client with no owners', async () => {
        const [rows] = await db.execute(
            `SELECT c.id
             FROM client c
             LEFT JOIN client_sow_owner o ON o.client_id = c.id
             WHERE o.id IS NULL
             ORDER BY c.id
             LIMIT 1`
        );

        expect(
            rows.length,
            'A client without SOW owners is required for this test'
        ).toBe(1);

        const clientId = rows[0].id;

        const response = await api.get(
            `getByClientId/${clientId}`
        );

        expect(response.status()).toBe(
            EXPECTED.missingClientOwners
        );
    });

    test('SOW-API-N003: Create with empty owner name', async () => {
        const clientId = await getValidClientId(db);

        const response = await api.post('save', {
            data: {
                clientSowOwner: '',
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        // The provided implementation notes do not establish a
        // validation response for empty names. This test deliberately
        // expects rejection; if the API accepts it, it exposes a defect.
        expect(response.status()).toBe(400);

        const [rows] = await db.execute(
            `SELECT id
             FROM client_sow_owner
             WHERE client_sow_owner = ''`
        );

        expect(rows.length).toBe(0);
    });

    test('SOW-API-N004: Create with missing client', async () => {
        const name = uniqueName('AUTO_MISSING_CLIENT');

        const response = await api.post('save', {
            data: {
                clientSowOwner: name,
                createdBy: 'automation-test'
            }
        });

        expect(response.status()).toBe(400);

        const rows = await getOwnerByName(db, name);
        expect(rows.length).toBe(0);
    });

    test('SOW-API-N005: Update nonexistent owner ID', async () => {
        const name = uniqueName('AUTO_NONEXISTENT_UPDATE');
        const clientId = await getValidClientId(db);

        const response = await api.put('update/999999999', {
            data: {
                clientSowOwner: name,
                client: { id: clientId },
                updatedBy: 'automation-test'
            }
        });

        // Verify actual controller behavior. Direct repository.save()
        // with an assigned ID may INSERT or UPDATE depending on JPA
        // entity ID strategy. This test must not assume an outcome.
        // Treat any response other than the contract's expected result
        // as a defect once the controller/service contract is confirmed.
        expect([400, 404]).toContain(response.status());

        const rows = await getOwnerByName(db, name);
        expect(rows.length).toBe(0);
    });

    test('SOW-API-N006: Delete nonexistent owner ID', async () => {
        const response = await api.delete('delete/999999999');

        // Verify against controller exception handling and DB behavior.
        expect([404, 400]).toContain(response.status());
    });

    // =================================================
    // 8. EDGE CASES
    // =================================================

    test('SOW-API-E001: Create owner with special characters', async () => {
        const name = `AUTO_OWNER_O'Neil_${Date.now()}`;
        const clientId = await getValidClientId(db);

        const response = await api.post('save', {
            data: {
                clientSowOwner: name,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        const body = await responseJson(response, 'create');

        expect(body.clientSowOwner).toBe(name);

        const rows = await getOwnerById(db, body.id);

        expect(rows.length).toBe(1);
        expect(rows[0].client_sow_owner).toBe(name);
    });

    test('SOW-API-E002: Create owner with Unicode characters', async () => {
        const name = `AUTO_OWNER_测试_${Date.now()}`;
        const clientId = await getValidClientId(db);

        const response = await api.post('save', {
            data: {
                clientSowOwner: name,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        const body = await responseJson(response, 'create');

        expect(body.clientSowOwner).toBe(name);

        const rows = await getOwnerById(db, body.id);

        expect(rows.length).toBe(1);
        expect(rows[0].client_sow_owner).toBe(name);
    });

    test('SOW-API-E003: Get all reflects a newly created demo record', async () => {
        const name = uniqueName('AUTO_GETALL');
        const clientId = await getValidClientId(db);

        const createResponse = await api.post('save', {
            data: {
                clientSowOwner: name,
                client: { id: clientId },
                createdBy: 'automation-test'
            }
        });

        const created = await responseJson(createResponse, 'create');

        const response = await api.get('getAll');

        expect(response.status()).toBe(EXPECTED.getAll);

        const records = await response.json();

        const matching = records.filter(
            record => String(record.id) === String(created.id)
        );

        expect(matching.length).toBe(1);
        expect(matching[0].clientSowOwner).toBe(name);
    });
});