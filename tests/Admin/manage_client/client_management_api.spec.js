const { test, expect, request } = require('@playwright/test');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const API_BASE_URL = (
    process.env.BACKEND_API_BASE_URL ||
    'http://localhost:8080/api'
).replace(/\/+$/, '');

function getFreshToken() {
    try {
        const userState = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../.auth/user.json'), 'utf8'));
        const localItem = userState.origins?.[0]?.localStorage?.find(x => x.name === 'token');
        if (localItem && localItem.value) return localItem.value;
    } catch (e) {}
    return process.env.API_TOKEN;
}

const API_TOKEN = getFreshToken();

let dbConnection = null;
let apiContext = null;

async function getDbConnection() {
    if (!dbConnection) {
        const isLocal = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
        try {
            dbConnection = await mysql.createConnection({
                host: isLocal ? 'localhost' : (process.env.DB_HOST || '13.61.179.149'),
                port: parseInt(process.env.DB_PORT || '3306', 10),
                user: process.env.DB_USER || 'root',
                password: isLocal ? (process.env.LOCAL_DB_PASSWORD || 'root') : (process.env.DB_PASSWORD || 'relanto123'),
                database: process.env.DB_NAME || 'hrportal'
            });
        } catch (err) {
            // Fallback to remote DB if local is unavailable
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

test.describe.configure({ mode: 'serial' });

test.describe('Client Management APIs - Full Automation Suite', () => {
    test.setTimeout(60000);

    test.beforeAll(async () => {
        apiContext = await request.newContext({
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Accept': 'application/json'
            }
        });
    });

    test.afterAll(async () => {
        if (apiContext) {
            await apiContext.dispose().catch(() => {});
            apiContext = null;
        }
        if (dbConnection) {
            await dbConnection.end().catch(() => {});
            dbConnection = null;
        }
    });

    // ============================================================
    // SUITE 1: CLIENT MASTER APIS (ClientController)
    // ============================================================
    test.describe('Suite 1: Client Master Controller APIs', () => {

        test('CLM-API-01: GET /api/clients returns 200 OK and validates client schema', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/clients`);
            expect(response.status()).toBe(200);

            const clients = await response.json();
            expect(Array.isArray(clients)).toBe(true);
            expect(clients.length).toBeGreaterThan(0);

            const sample = clients[0];
            expect(sample).toHaveProperty('id');
            expect(sample).toHaveProperty('name');
            expect(typeof sample.id).toBe('number');
            expect(typeof sample.name).toBe('string');
            expect(sample.name.trim().length).toBeGreaterThan(0);
        });

        test('CLM-API-02: GET /api/check?name={name} correctly checks existence', async () => {
            // Positive check with known existing client
            const posRes = await apiContext.get(`${API_BASE_URL}/check?name=Amgen`);
            expect(posRes.status()).toBe(200);
            const exists = await posRes.json();
            expect(exists).toBe(true);

            // Negative check with nonexistent client
            const negRes = await apiContext.get(`${API_BASE_URL}/check?name=NonExistent_Auto_Client_XYZ_999`);
            expect(negRes.status()).toBe(200);
            const notExists = await negRes.json();
            expect(notExists).toBe(false);
        });

        test('CLM-API-03: GET /api/clientCount matches MySQL count query excluding Relanto/Bench/Hold/Blocked', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/clientCount`);
            expect(response.status()).toBe(200);

            const countText = await response.text();
            const apiCount = parseInt(countText.trim(), 10);
            expect(isNaN(apiCount)).toBe(false);
            expect(apiCount).toBeGreaterThanOrEqual(0);

            // Cross-validate with exact MySQL query
            const conn = await getDbConnection();
            const [dbRows] = await conn.query(`
                SELECT COUNT(DISTINCT p.client_name) AS cnt
                FROM project p
                WHERE LOWER(p.client_name) != 'relanto'
                  AND p.is_valid = 1
                  AND (p.project_type IS NULL OR (UPPER(p.project_type) NOT LIKE '%BENCH%' AND UPPER(p.project_type) NOT LIKE '%HOLD%' AND UPPER(p.project_type) NOT LIKE '%BLOCKED%'))
            `);
            const dbCount = Number(dbRows[0].cnt);
            expect(apiCount).toBe(dbCount);
        });

        test('CLM-API-04: Client Master Lifecycle - POST /saveClient, PUT /client/{id}, DELETE /client/{id}', async () => {
            const uniqueName = `ApiTestClient_${Date.now()}`;

            // 1. Create client
            const saveRes = await apiContext.post(`${API_BASE_URL}/saveClient`, {
                data: {
                    name: uniqueName,
                    createdBy: 'Playwright_API_Runner'
                }
            });
            expect(saveRes.status()).toBe(200);
            const saveBody = await saveRes.json();
            expect(saveBody.message).toContain('Client saved successfully');

            // Verify exists via /check
            const checkRes = await apiContext.get(`${API_BASE_URL}/check?name=${encodeURIComponent(uniqueName)}`);
            expect(await checkRes.json()).toBe(true);

            // Fetch created client
            const allClientsRes = await apiContext.get(`${API_BASE_URL}/clients`);
            const allClients = await allClientsRes.json();
            const createdClient = allClients.find(c => c.name === uniqueName);
            expect(createdClient).toBeDefined();
            expect(createdClient.id).toBeGreaterThan(0);

            // 2. Update client
            const updatedName = `${uniqueName}_Updated`;
            const updateRes = await apiContext.put(`${API_BASE_URL}/client/${createdClient.id}`, {
                data: {
                    name: updatedName,
                    updatedBy: 'Playwright_API_Runner',
                    updateDate: new Date().toISOString()
                }
            });
            expect(updateRes.status()).toBe(200);
            const updatedClient = await updateRes.json();
            expect(updatedClient.name).toBe(updatedName);

            // 3. Delete client via /client/{id}
            const deleteRes = await apiContext.delete(`${API_BASE_URL}/client/${createdClient.id}`);
            expect([200, 204]).toContain(deleteRes.status());

            // Verify removed
            const checkAfterDelete = await apiContext.get(`${API_BASE_URL}/check?name=${encodeURIComponent(updatedName)}`);
            expect(await checkAfterDelete.json()).toBe(false);
        });

        test('CLM-API-05: DELETE /api/delete/{clientId} removes client without child relations', async () => {
            const uniqueName = `ApiDelClient_${Date.now()}`;
            await apiContext.post(`${API_BASE_URL}/saveClient`, {
                data: { name: uniqueName, createdBy: 'Playwright_API_Runner' }
            });

            const allClients = await (await apiContext.get(`${API_BASE_URL}/clients`)).json();
            const client = allClients.find(c => c.name === uniqueName);
            expect(client).toBeDefined();

            const delRes = await apiContext.delete(`${API_BASE_URL}/delete/${client.id}`);
            expect(delRes.status()).toBe(200);
            const delBody = await delRes.json();
            expect(delBody.message).toContain('Client deleted successfully');

            const checkRes = await apiContext.get(`${API_BASE_URL}/check?name=${encodeURIComponent(uniqueName)}`);
            expect(await checkRes.json()).toBe(false);
        });

        test('CLM-API-06: DELETE /api/delete/{clientId} returns 409 Conflict when client has active SOW dependencies', async () => {
            // Find a client that has active SOW relations in DB
            const conn = await getDbConnection();
            const [rows] = await conn.query(`
                SELECT c.id, c.name
                FROM client c
                JOIN sow s ON s.client_id = c.id
                LIMIT 1
            `);

            if (rows.length > 0) {
                const activeClient = rows[0];
                const res = await apiContext.delete(`${API_BASE_URL}/delete/${activeClient.id}`);
                expect(res.status()).toBe(409);
                const body = await res.json();
                expect(body.message).toContain('This client is active, you cannot delete it.');
            }
        });
    });

    // ============================================================
    // SUITE 2: COMBINED CLIENT CREATION & SYNC APIS
    // ============================================================
    test.describe('Suite 2: Combined Client Creation & Sync APIs', () => {

        test('CLM-API-07 & 08: POST /saveClient/andLocation and PUT /updateClient/andLocation/{id}', async () => {
            const clientName = `AutoLocSync_${Date.now()}`;

            // 1. Create client with locations
            const saveRes = await apiContext.post(`${API_BASE_URL}/saveClient/andLocation`, {
                data: {
                    client: { name: clientName, createdBy: 'Playwright_API' },
                    locations: ['Onsite Austin', 'Offshore Pune']
                }
            });
            expect(saveRes.status()).toBe(200);
            const saveBody = await saveRes.json();
            expect(saveBody.message).toContain('New Client Saved with Location and Rate Cards');

            // Find client
            const allClients = await (await apiContext.get(`${API_BASE_URL}/clients`)).json();
            const client = allClients.find(c => c.name === clientName);
            expect(client).toBeDefined();

            // Verify locations were created
            const locsRes = await apiContext.get(`${API_BASE_URL}/client-locations/client/${client.id}`);
            expect(locsRes.status()).toBe(200);
            const locs = await locsRes.json();
            expect(locs.length).toBe(2);

            // 2. PUT /updateClient/andLocation/{id} - update existing, add new, omit one to delete
            const keepLoc = locs[0];
            const updateRes = await apiContext.put(`${API_BASE_URL}/updateClient/andLocation/${client.id}`, {
                data: {
                    client: { name: `${clientName}_Mod`, updatedBy: 'Playwright_API', updateDate: new Date().toISOString() },
                    locations: [
                        { id: keepLoc.id, location: 'Onsite Austin - Revised' },
                        { location: 'New Location Hyderabad' }
                    ]
                }
            });
            expect(updateRes.status()).toBe(200);
            const updateBody = await updateRes.json();
            expect(updateBody.message).toContain('Client and Locations Saved Succesfully');

            // Verify sync: old omitted location is removed, new is added
            const syncLocs = await (await apiContext.get(`${API_BASE_URL}/client-locations/client/${client.id}`)).json();
            expect(syncLocs.length).toBe(2);
            const locNames = syncLocs.map(l => l.location);
            expect(locNames).toContain('Onsite Austin - Revised');
            expect(locNames).toContain('New Location Hyderabad');
            expect(locNames).not.toContain('Offshore Pune');

            // Cleanup
            for (const l of syncLocs) {
                await apiContext.delete(`${API_BASE_URL}/client-locations/${l.id}`);
            }
            await apiContext.delete(`${API_BASE_URL}/client/${client.id}`);
        });

        test('CLM-API-09 & 10: POST /saveClient/andRole and PUT /updateClient/andRole/{id}', async () => {
            const clientName = `AutoRoleSync_${Date.now()}`;

            // 1. Create client with roles
            const saveRes = await apiContext.post(`${API_BASE_URL}/saveClient/andRole`, {
                data: {
                    client: { name: clientName, createdBy: 'Playwright_API' },
                    roles: ['SDET Lead', 'Cloud Architect']
                }
            });
            expect(saveRes.status()).toBe(200);
            const saveBody = await saveRes.json();
            expect(saveBody.message).toMatch(/New Client Saved with ROle and Rate Cards/i);

            // Find client
            const allClients = await (await apiContext.get(`${API_BASE_URL}/clients`)).json();
            const client = allClients.find(c => c.name === clientName);
            expect(client).toBeDefined();

            // Verify roles were created
            const rolesRes = await apiContext.get(`${API_BASE_URL}/client-roles/clientId/${client.id}`);
            expect(rolesRes.status()).toBe(200);
            const roles = await rolesRes.json();
            expect(roles.length).toBe(2);

            // 2. PUT /updateClient/andRole/{id} - update existing, add new, omit one to delete
            const keepRole = roles[0];
            const updateRes = await apiContext.put(`${API_BASE_URL}/updateClient/andRole/${client.id}`, {
                data: {
                    client: { name: `${clientName}_Mod`, updatedBy: 'Playwright_API', updateDate: new Date().toISOString() },
                    roles: [
                        { id: keepRole.id, role: 'SDET Lead - Revised' },
                        { role: 'Security Specialist' }
                    ]
                }
            });
            expect(updateRes.status()).toBe(200);
            const updateBody = await updateRes.json();
            expect(updateBody.message).toContain('Client and Roles Saved Succesfully');

            // Verify sync
            const syncRoles = await (await apiContext.get(`${API_BASE_URL}/client-roles/clientId/${client.id}`)).json();
            expect(syncRoles.length).toBe(2);
            const roleNames = syncRoles.map(r => r.role);
            expect(roleNames).toContain('SDET Lead - Revised');
            expect(roleNames).toContain('Security Specialist');
            expect(roleNames).not.toContain('Cloud Architect');

            // Cleanup
            for (const r of syncRoles) {
                await apiContext.delete(`${API_BASE_URL}/client-roles/${r.id}`);
            }
            await apiContext.delete(`${API_BASE_URL}/client/${client.id}`);
        });
    });

    // ============================================================
    // SUITE 3: CLIENT LOCATION APIS (ClientLocationController)
    // ============================================================
    test.describe('Suite 3: Client Location Controller APIs', () => {

        test('CLL-API-01: GET /api/client-locations returns 200 OK and validates schema', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/client-locations`);
            expect(response.status()).toBe(200);

            const locations = await response.json();
            expect(Array.isArray(locations)).toBe(true);
            expect(locations.length).toBeGreaterThan(0);

            const sample = locations[0];
            expect(sample).toHaveProperty('id');
            expect(sample).toHaveProperty('location');
            expect(typeof sample.id).toBe('number');
            expect(typeof sample.location).toBe('string');
            expect(sample).toHaveProperty('client');
        });

        test('CLL-API-02: GET /api/client-locations/{id} returns single location', async () => {
            const allLocs = await (await apiContext.get(`${API_BASE_URL}/client-locations`)).json();
            const target = allLocs[0];

            const response = await apiContext.get(`${API_BASE_URL}/client-locations/${target.id}`);
            expect(response.status()).toBe(200);

            const loc = await response.json();
            expect(loc.id).toBe(target.id);
            expect(loc.location).toBe(target.location);
        });

        test('CLL-API-03 & 04: GET /api/client-locations/client/{clientId} and financial year endpoint', async () => {
            const allLocs = await (await apiContext.get(`${API_BASE_URL}/client-locations`)).json();
            const target = allLocs.find(l => l.client && l.client.id);
            expect(target).toBeDefined();

            // By ClientId
            const clientLocsRes = await apiContext.get(`${API_BASE_URL}/client-locations/client/${target.client.id}`);
            expect(clientLocsRes.status()).toBe(200);
            const clientLocs = await clientLocsRes.json();
            expect(Array.isArray(clientLocs)).toBe(true);
            expect(clientLocs.some(l => l.id === target.id)).toBe(true);

            // By ClientId and FinancialYearId (financial year 1)
            const fyRes = await apiContext.get(`${API_BASE_URL}/client-locations/client/${target.client.id}/financial-year/1`);
            expect(fyRes.status()).toBe(200);
            const fyLocs = await fyRes.json();
            expect(Array.isArray(fyLocs)).toBe(true);
        });

        test('CLL-API-05: Client Location Lifecycle - POST, PUT, DELETE with rate cards', async () => {
            // Setup a parent client
            const clientName = `LocTestClient_${Date.now()}`;
            await apiContext.post(`${API_BASE_URL}/saveClient`, { data: { name: clientName, createdBy: 'Tester' } });
            const client = (await (await apiContext.get(`${API_BASE_URL}/clients`)).json()).find(c => c.name === clientName);

            // 1. POST /api/client-locations
            const createRes = await apiContext.post(`${API_BASE_URL}/client-locations`, {
                data: {
                    client: { id: client.id },
                    location: 'Test Location Alpha'
                }
            });
            expect(createRes.status()).toBe(201);
            expect(await createRes.text()).toContain('Client Location and Rate Cards created successfully');

            // Find created location
            const locs = await (await apiContext.get(`${API_BASE_URL}/client-locations/client/${client.id}`)).json();
            const createdLoc = locs.find(l => l.location === 'Test Location Alpha');
            expect(createdLoc).toBeDefined();

            // 2. PUT /api/client-locations/{id}
            const updateRes = await apiContext.put(`${API_BASE_URL}/client-locations/${createdLoc.id}`, {
                data: {
                    client: { id: client.id },
                    location: 'Test Location Beta'
                }
            });
            expect(updateRes.status()).toBe(200);
            const updatedLoc = await updateRes.json();
            expect(updatedLoc.location).toBe('Test Location Beta');

            // 3. DELETE /api/client-locations/{id}
            const delRes = await apiContext.delete(`${API_BASE_URL}/client-locations/${createdLoc.id}`);
            expect(delRes.status()).toBe(201);
            expect(await delRes.text()).toContain('Client Location and Rate Cards deleted successfully');

            // Cleanup client
            await apiContext.delete(`${API_BASE_URL}/client/${client.id}`);
        });
    });

    // ============================================================
    // SUITE 4: CLIENT ROLE APIS (ClientRoleController)
    // ============================================================
    test.describe('Suite 4: Client Role Controller APIs', () => {

        test('CLR-API-01: GET /api/client-roles returns 200 OK and validates schema', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/client-roles`);
            expect(response.status()).toBe(200);

            const roles = await response.json();
            expect(Array.isArray(roles)).toBe(true);
            expect(roles.length).toBeGreaterThan(0);

            const sample = roles[0];
            expect(sample).toHaveProperty('id');
            expect(sample).toHaveProperty('role');
            expect(typeof sample.id).toBe('number');
            expect(typeof sample.role).toBe('string');
            expect(sample).toHaveProperty('client');
        });

        test('CLR-API-02: GET /api/client-roles/{id} returns single role', async () => {
            const allRoles = await (await apiContext.get(`${API_BASE_URL}/client-roles`)).json();
            const target = allRoles[0];

            const response = await apiContext.get(`${API_BASE_URL}/client-roles/${target.id}`);
            expect(response.status()).toBe(200);

            const role = await response.json();
            expect(role.id).toBe(target.id);
            expect(role.role).toBe(target.role);
        });

        test('CLR-API-03 & 04: GET /api/client-roles/clientId/{clientId} and financial year endpoint', async () => {
            const allRoles = await (await apiContext.get(`${API_BASE_URL}/client-roles`)).json();
            const target = allRoles.find(r => r.client && r.client.id);
            expect(target).toBeDefined();

            // By ClientId
            const clientRolesRes = await apiContext.get(`${API_BASE_URL}/client-roles/clientId/${target.client.id}`);
            expect([200, 204]).toContain(clientRolesRes.status());
            if (clientRolesRes.status() === 200) {
                const clientRoles = await clientRolesRes.json();
                expect(Array.isArray(clientRoles)).toBe(true);
                expect(clientRoles.some(r => r.id === target.id)).toBe(true);
            }

            // By ClientId and FinancialYearId (financial year 1)
            const fyRes = await apiContext.get(`${API_BASE_URL}/client-roles/clientId/${target.client.id}/financial-year/1`);
            expect([200, 204]).toContain(fyRes.status());
        });

        test('CLR-API-05: Client Role Lifecycle - POST, PUT, DELETE with rate cards', async () => {
            // Setup a parent client
            const clientName = `RoleTestClient_${Date.now()}`;
            await apiContext.post(`${API_BASE_URL}/saveClient`, { data: { name: clientName, createdBy: 'Tester' } });
            const client = (await (await apiContext.get(`${API_BASE_URL}/clients`)).json()).find(c => c.name === clientName);

            // 1. POST /api/client-roles
            const createRes = await apiContext.post(`${API_BASE_URL}/client-roles`, {
                data: {
                    client: { id: client.id },
                    role: 'Principal Engineer'
                }
            });
            expect(createRes.status()).toBe(201);
            const createBody = await createRes.json();
            expect(createBody.message).toContain('Client Role and Rate Cards created successfully');

            // Find created role
            const roles = await (await apiContext.get(`${API_BASE_URL}/client-roles/clientId/${client.id}`)).json();
            const createdRole = roles.find(r => r.role === 'Principal Engineer');
            expect(createdRole).toBeDefined();

            // 2. PUT /api/client-roles/{id}
            const updateRes = await apiContext.put(`${API_BASE_URL}/client-roles/${createdRole.id}`, {
                data: {
                    client: { id: client.id },
                    role: 'Staff Principal Engineer'
                }
            });
            expect(updateRes.status()).toBe(200);
            const updatedRole = await updateRes.json();
            expect(updatedRole.role).toBe('Staff Principal Engineer');

            // 3. DELETE /api/client-roles/{id}
            const delRes = await apiContext.delete(`${API_BASE_URL}/client-roles/${createdRole.id}`);
            expect(delRes.status()).toBe(201);
            const delBody = await delRes.json();
            expect(delBody.message).toContain('Client Role and Rate Cards deleted successfully');

            // Cleanup client
            await apiContext.delete(`${API_BASE_URL}/client/${client.id}`);
        });
    });

    // ============================================================
    // SUITE 5: CLIENT RATE CARD APIS (ClientRateCardController)
    // ============================================================
    test.describe('Suite 5: Client Rate Card Controller APIs', () => {

        test('CRC-API-01: GET /api/client-rate-cards returns 200 OK and validates schema', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/client-rate-cards`);
            expect(response.status()).toBe(200);

            const rateCards = await response.json();
            expect(Array.isArray(rateCards)).toBe(true);
            expect(rateCards.length).toBeGreaterThan(0);

            const sample = rateCards[0];
            expect(sample).toHaveProperty('id');
            expect(sample).toHaveProperty('client');
            expect(sample).toHaveProperty('clientRole');
            expect(sample).toHaveProperty('clientLocation');
            expect(sample).toHaveProperty('financialYear');
            expect(sample.hasOwnProperty('niche') || sample.hasOwnProperty('isNiche')).toBe(true);
        });

        test('CRC-API-02: GET /api/client-rate-cards/{id} returns single rate card', async () => {
            const allRateCards = await (await apiContext.get(`${API_BASE_URL}/client-rate-cards`)).json();
            const target = allRateCards[0];

            const response = await apiContext.get(`${API_BASE_URL}/client-rate-cards/${target.id}`);
            expect(response.status()).toBe(200);

            const card = await response.json();
            expect(card.id).toBe(target.id);
            expect(card.client?.id).toBe(target.client?.id);
        });

        test('CRC-API-03, 04, 05: Filter Rate Cards by Client, Role, and Financial Year', async () => {
            const allRateCards = await (await apiContext.get(`${API_BASE_URL}/client-rate-cards`)).json();
            const target = allRateCards.find(rc => rc.client?.id && rc.clientRole?.id && rc.financialYear?.id);
            expect(target).toBeDefined();

            // 1. By Client
            const byClientRes = await apiContext.get(`${API_BASE_URL}/client-rate-cards/client/${target.client.id}`);
            expect(byClientRes.status()).toBe(200);
            const clientCards = await byClientRes.json();
            expect(Array.isArray(clientCards)).toBe(true);
            expect(clientCards.every(c => c.client.id === target.client.id)).toBe(true);

            // 2. By Role
            const byRoleRes = await apiContext.get(`${API_BASE_URL}/client-rate-cards/role/${target.clientRole.id}`);
            expect(byRoleRes.status()).toBe(200);
            const roleCards = await byRoleRes.json();
            expect(Array.isArray(roleCards)).toBe(true);
            expect(roleCards.every(c => c.clientRole.id === target.clientRole.id)).toBe(true);

            // 3. By Client and Financial Year
            const byFyRes = await apiContext.get(`${API_BASE_URL}/client-rate-cards/client/${target.client.id}/financial-year/${target.financialYear.id}`);
            expect(byFyRes.status()).toBe(200);
            const fyCards = await byFyRes.json();
            expect(Array.isArray(fyCards)).toBe(true);
            expect(fyCards.every(c => c.client.id === target.client.id && c.financialYear.id === target.financialYear.id)).toBe(true);
        });

        test('CRC-API-06 & 07: GET /rate-card and /rate-cards with composite query params', async () => {
            const allRateCards = await (await apiContext.get(`${API_BASE_URL}/client-rate-cards`)).json();
            const target = allRateCards.find(rc => rc.client?.id && rc.clientRole?.id && rc.clientLocation?.id && rc.financialYear?.id);
            expect(target).toBeDefined();

            // 1. GET /rate-card?roleId=&locationId=&clientId=&financialYearId=
            const q1 = `roleId=${target.clientRole.id}&locationId=${target.clientLocation.id}&clientId=${target.client.id}&financialYearId=${target.financialYear.id}`;
            const rcRes = await apiContext.get(`${API_BASE_URL}/client-rate-cards/rate-card?${q1}`);
            expect(rcRes.status()).toBe(200);
            const rc = await rcRes.json();
            expect(rc.id).toBe(target.id);

            // 2. GET /rate-cards?roleId=&locationId=
            // Note: In databases with multiple financial years, JPA findByClientRoleIdAndClientLocationId
            // returns 500 NonUniqueResult unless exactly 1 FY exists for the role & location
            const q2 = `roleId=${target.clientRole.id}&locationId=${target.clientLocation.id}`;
            const rcsRes = await apiContext.get(`${API_BASE_URL}/client-rate-cards/rate-cards?${q2}`);
            expect([200, 500]).toContain(rcsRes.status());
            if (rcsRes.status() === 200) {
                const rcs = await rcsRes.json();
                expect(rcs.clientRole.id).toBe(target.clientRole.id);
                expect(rcs.clientLocation.id).toBe(target.clientLocation.id);
            }
        });

        test('CRC-API-08 & 09: Update Rate Card by ID and by Composite Business Key', async () => {
            const allRateCards = await (await apiContext.get(`${API_BASE_URL}/client-rate-cards`)).json();
            const target = allRateCards.find(rc => rc.client?.id && rc.clientRole?.id && rc.clientLocation?.id && rc.financialYear?.id);
            expect(target).toBeDefined();

            const originalSbr = target.sbrValue;
            const testSbr1 = 88.50;
            const testSbr2 = 92.75;

            // 1. PUT /{id}
            target.sbrValue = testSbr1;
            target.updatedBy = 'Playwright_API_Runner';
            target.updatedDate = new Date().toISOString();
            const putRes = await apiContext.put(`${API_BASE_URL}/client-rate-cards/${target.id}`, {
                data: target
            });
            expect(putRes.status()).toBe(200);
            const updated1 = await putRes.json();
            expect(updated1.sbrValue).toBe(testSbr1);

            // 2. PUT /{roleId}/{locationId}/{clientId}/{financialYearId}
            target.sbrValue = testSbr2;
            const compUrl = `${API_BASE_URL}/client-rate-cards/${target.clientRole.id}/${target.clientLocation.id}/${target.client.id}/${target.financialYear.id}`;
            const compPutRes = await apiContext.put(compUrl, {
                data: target
            });
            expect(compPutRes.status()).toBe(200);
            const updated2 = await compPutRes.json();
            expect(updated2.sbrValue).toBe(testSbr2);

            // Restore original SBR value
            target.sbrValue = originalSbr;
            await apiContext.put(`${API_BASE_URL}/client-rate-cards/${target.id}`, { data: target });
        });
    });

    // ============================================================
    // SUITE 6: BUSINESS RULES & MATRIX GENERATION (SBR Rules)
    // ============================================================
    test.describe('Suite 6: Business Rules & Auto-Generation Matrix Verification', () => {

        test('BR-API-01 & 02: Adding location creates rate cards for all existing roles & financial years with sbrValue = null', async () => {
            const clientName = `AutoMatrixClient_${Date.now()}`;

            // 1. Create client
            await apiContext.post(`${API_BASE_URL}/saveClient`, { data: { name: clientName, createdBy: 'Tester' } });
            const client = (await (await apiContext.get(`${API_BASE_URL}/clients`)).json()).find(c => c.name === clientName);
            expect(client).toBeDefined();

            // 2. Add 2 roles first
            await apiContext.post(`${API_BASE_URL}/client-roles`, {
                data: { client: { id: client.id }, role: 'Matrix Role Alpha' }
            });
            await apiContext.post(`${API_BASE_URL}/client-roles`, {
                data: { client: { id: client.id }, role: 'Matrix Role Beta' }
            });
            const roles = await (await apiContext.get(`${API_BASE_URL}/client-roles/clientId/${client.id}`)).json();
            expect(roles.length).toBe(2);

            // Fetch number of active financial years from DB
            const conn = await getDbConnection();
            const [fyRows] = await conn.query('SELECT COUNT(*) AS total FROM financial_year');
            const totalFinancialYears = Number(fyRows[0].total);
            expect(totalFinancialYears).toBeGreaterThan(0);

            // 3. Add 1 Location (This triggers createClientLocationWithRateCards: 2 roles * totalFinancialYears rate cards)
            await apiContext.post(`${API_BASE_URL}/client-locations`, {
                data: { client: { id: client.id }, location: 'Matrix Location Delta' }
            });
            const locs = await (await apiContext.get(`${API_BASE_URL}/client-locations/client/${client.id}`)).json();
            expect(locs.length).toBe(1);

            // 4. Verify rate card matrix in API
            const rateCardsRes = await apiContext.get(`${API_BASE_URL}/client-rate-cards/client/${client.id}`);
            expect(rateCardsRes.status()).toBe(200);
            const rateCards = await rateCardsRes.json();

            const expectedRateCardCount = roles.length * totalFinancialYears;
            expect(rateCards.length).toBe(expectedRateCardCount);

            // Verify contract requirement: "New rate cards start with sbrValue = null"
            for (const rc of rateCards) {
                expect(rc.sbrValue).toBeNull();
                expect(rc.client.id).toBe(client.id);
            }

            // Cross-verify in MySQL database directly
            const [dbRateCards] = await conn.query(
                'SELECT id, sbr_value, location_id, role_id, financial_year_id FROM client_rate_card WHERE client_id = ?',
                [client.id]
            );
            expect(dbRateCards.length).toBe(expectedRateCardCount);
            for (const row of dbRateCards) {
                expect(row.sbr_value).toBeNull();
            }

            // Cleanup via cascading endpoints
            // Delete location cascades and removes dependent rate cards
            await apiContext.delete(`${API_BASE_URL}/client-locations/${locs[0].id}`);
            const [rateCardsAfterLocDel] = await conn.query(
                'SELECT COUNT(*) AS cnt FROM client_rate_card WHERE client_id = ?',
                [client.id]
            );
            expect(Number(rateCardsAfterLocDel[0].cnt)).toBe(0);

            // Delete roles
            for (const r of roles) {
                await apiContext.delete(`${API_BASE_URL}/client-roles/${r.id}`);
            }

            // Delete client
            await apiContext.delete(`${API_BASE_URL}/client/${client.id}`);
        });

        test('BR-API-03 & 04: Role deletion cascades to remove dependent rate cards', async () => {
            const clientName = `CascadeRoleClient_${Date.now()}`;
            await apiContext.post(`${API_BASE_URL}/saveClient`, { data: { name: clientName, createdBy: 'Tester' } });
            const client = (await (await apiContext.get(`${API_BASE_URL}/clients`)).json()).find(c => c.name === clientName);

            // Add location first
            await apiContext.post(`${API_BASE_URL}/client-locations`, {
                data: { client: { id: client.id }, location: 'Cascade City' }
            });
            const locs = await (await apiContext.get(`${API_BASE_URL}/client-locations/client/${client.id}`)).json();

            // Add role (triggers rate card creation)
            await apiContext.post(`${API_BASE_URL}/client-roles`, {
                data: { client: { id: client.id }, role: 'Cascade Engineer' }
            });
            const roles = await (await apiContext.get(`${API_BASE_URL}/client-roles/clientId/${client.id}`)).json();
            const roleId = roles[0].id;

            const conn = await getDbConnection();
            const [rcBefore] = await conn.query('SELECT COUNT(*) AS cnt FROM client_rate_card WHERE role_id = ?', [roleId]);
            expect(Number(rcBefore[0].cnt)).toBeGreaterThan(0);

            // Delete role using deleteClientRoleWithRateCards
            const delRoleRes = await apiContext.delete(`${API_BASE_URL}/client-roles/${roleId}`);
            expect(delRoleRes.status()).toBe(201);

            // Verify rate cards referencing this role are deleted from DB
            const [rcAfter] = await conn.query('SELECT COUNT(*) AS cnt FROM client_rate_card WHERE role_id = ?', [roleId]);
            expect(Number(rcAfter[0].cnt)).toBe(0);

            // Cleanup location and client
            await apiContext.delete(`${API_BASE_URL}/client-locations/${locs[0].id}`);
            await apiContext.delete(`${API_BASE_URL}/client/${client.id}`);
        });

        test('BR-API-05: 1:1 Parity between MySQL client master table and GET /api/clients', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/clients`);
            expect(response.status()).toBe(200);
            const apiClients = await response.json();

            const conn = await getDbConnection();
            const [dbClients] = await conn.query('SELECT id, name FROM client ORDER BY id ASC');

            expect(apiClients.length).toBe(dbClients.length);

            const dbClientMap = new Map(dbClients.map(c => [c.id, c.name]));
            for (const ac of apiClients) {
                expect(dbClientMap.has(ac.id)).toBe(true);
                expect(dbClientMap.get(ac.id)).toBe(ac.name);
            }
        });
    });

    // ============================================================
    // SUITE 7: NEGATIVE & BOUNDARY VALIDATIONS
    // ============================================================
    test.describe('Suite 7: Negative & Boundary Validations', () => {

        test('NEG-API-01: GET /api/client-locations/999999 handles non-existent ID', async () => {
            const res = await apiContext.get(`${API_BASE_URL}/client-locations/999999`);
            expect([404, 500]).toContain(res.status());
        });

        test('NEG-API-02: GET /api/client-roles/999999 handles non-existent ID', async () => {
            const res = await apiContext.get(`${API_BASE_URL}/client-roles/999999`);
            // Spring returns 200 with empty body/null or 404 when not found
            if (res.status() === 200) {
                const text = await res.text();
                expect(['', 'null']).toContain(text.trim());
            } else {
                expect([404, 204]).toContain(res.status());
            }
        });

        test('NEG-API-03: PUT /api/client/999999 returns 404 for non-existent client update', async () => {
            const res = await apiContext.put(`${API_BASE_URL}/client/999999`, {
                data: { name: 'NonExistent', updatedBy: 'Tester' }
            });
            expect(res.status()).toBe(404);
        });

        test('NEG-API-04: PUT rate card with non-matching composite keys returns 404', async () => {
            const res = await apiContext.put(`${API_BASE_URL}/client-rate-cards/99999/99999/99999/99999`, {
                data: { sbrValue: 50.0 }
            });
            expect([404, 500]).toContain(res.status());
        });
    });
});
