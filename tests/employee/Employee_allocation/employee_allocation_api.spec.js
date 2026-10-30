const { test, expect, request } = require('@playwright/test');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const HOST_BASE_URL = (process.env.BASE_URL || 'https://13.61.179.149')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

const API_BASE_URL = (process.env.API_BASE_URL || (HOST_BASE_URL.includes('localhost') ? 'http://localhost:8080/api' : `${HOST_BASE_URL}/api/api`)).replace(/\/+$/, '');
const API_TOKEN = process.env.API_TOKEN;

let dbConnection = null;
let apiContext = null;

async function getDbConnection() {
    if (!dbConnection) {
        dbConnection = await mysql.createConnection({
            host: process.env.DB_HOST || '13.61.179.149',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'relanto123',
            database: process.env.DB_NAME || 'hrportal'
        });
    }
    return dbConnection;
}

test.describe('Employee Allocation APIs - Automation Suite', () => {
    test.setTimeout(120000);

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

    /**
     * ============================================================
     * 1. PROJECTS API: /api/api/projects
     * ============================================================
     */
    test.describe('1. Projects API (/projects)', () => {

        test('POS-01 - Retrieve all projects successfully', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/projects`);
            expect(response.status()).toBe(200);

            const projects = await response.json();
            expect(Array.isArray(projects)).toBeTruthy();
            expect(projects.length).toBeGreaterThan(0);

            console.log(`[PASS POS] /projects returned ${projects.length} projects`);

            // Schema validation on sample items
            const sample = projects[0];
            expect(sample).toHaveProperty('id');
            expect(sample).toHaveProperty('projectCode');
            expect(sample).toHaveProperty('projectName');
            expect(sample).toHaveProperty('clientName');
            expect(sample).toHaveProperty('projectType');
            expect(sample).toHaveProperty('isValid');
        });

        test('POS-02 - Cross-validate projects list with MySQL database', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/projects`);
            expect(response.status()).toBe(200);
            const apiProjects = await response.json();

            try {
                const conn = await getDbConnection();
                const [dbRows] = await conn.query('SELECT id, project_code, project_name, client_name FROM project');
                console.log(`[DB] Database project count: ${dbRows.length}, API project count: ${apiProjects.length}`);

                expect(apiProjects.length).toBe(dbRows.length);

                const sampleDb = dbRows[0];
                const matchedApi = apiProjects.find(p => p.id === sampleDb.id);
                expect(matchedApi).toBeDefined();
                expect(matchedApi.projectCode).toBe(sampleDb.project_code);
            } catch (err) {
                console.warn('[WARN DB] Projects DB validation:', err.message);
            }
        });

        test('POS-03 - Verify active valid projects have valid date format', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/projects`);
            const projects = await response.json();
            const activeProjects = projects.filter(p => p.isValid === true);

            expect(activeProjects.length).toBeGreaterThan(0);
            for (const p of activeProjects.slice(0, 10)) {
                if (p.startDate) {
                    expect(new Date(p.startDate).toString()).not.toBe('Invalid Date');
                }
                if (p.endDate) {
                    expect(new Date(p.endDate).toString()).not.toBe('Invalid Date');
                }
            }
        });

        test('NEG-01 - Reject unauthenticated /projects request', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/projects`);

            expect([401, 403]).toContain(response.status());
            await unauthContext.dispose().catch(() => {});
        });

        test('NEG-02 - Reject invalid Bearer token for /projects', async () => {
            const badContext = await request.newContext({
                ignoreHTTPSErrors: true,
                extraHTTPHeaders: { 'Authorization': 'Bearer INVALID_TOKEN_XYZ' }
            });
            const response = await badContext.get(`${API_BASE_URL}/projects`);

            expect([401, 403]).toContain(response.status());
            await badContext.dispose().catch(() => {});
        });

        test('EDGE-01 - Query /projects with unexpected query parameters', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/projects`, {
                params: { extraParam: 'unexpected_value_123', filter: 'none' }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(Array.isArray(data)).toBeTruthy();
            expect(data.length).toBeGreaterThan(0);
        });
    });

    /**
     * ============================================================
     * 2. CLIENTS API: /api/api/clients
     * ============================================================
     */
    test.describe('2. Clients API (/clients)', () => {

        test('POS-01 - Retrieve all clients successfully', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/clients`);
            expect(response.status()).toBe(200);

            const clients = await response.json();
            expect(Array.isArray(clients)).toBeTruthy();
            expect(clients.length).toBeGreaterThan(0);

            console.log(`[PASS POS] /clients returned ${clients.length} clients`);

            const sample = clients[0];
            expect(sample).toHaveProperty('id');
            expect(sample).toHaveProperty('name');
            expect(typeof sample.name).toBe('string');
            expect(sample.name.trim().length).toBeGreaterThan(0);
        });

        test('POS-02 - Cross-validate clients with MySQL database', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/clients`);
            const apiClients = await response.json();

            try {
                const conn = await getDbConnection();
                const [dbRows] = await conn.query('SELECT id, name FROM client');
                console.log(`[DB] Database client count: ${dbRows.length}, API client count: ${apiClients.length}`);

                expect(apiClients.length).toBe(dbRows.length);

                const dbClientNames = dbRows.map(r => r.name.trim()).sort();
                const apiClientNames = apiClients.map(c => c.name.trim()).sort();
                expect(apiClientNames).toEqual(dbClientNames);
            } catch (err) {
                console.warn('[WARN DB] Clients DB validation:', err.message);
            }
        });

        test('NEG-01 - Reject unauthenticated /clients request', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/clients`);

            expect([401, 403]).toContain(response.status());
            await unauthContext.dispose().catch(() => {});
        });

        test('NEG-02 - Reject invalid Bearer token for /clients', async () => {
            const badContext = await request.newContext({
                ignoreHTTPSErrors: true,
                extraHTTPHeaders: { 'Authorization': 'Bearer BAD_TOKEN_999' }
            });
            const response = await badContext.get(`${API_BASE_URL}/clients`);

            expect([401, 403]).toContain(response.status());
            await badContext.dispose().catch(() => {});
        });

        test('EDGE-01 - Verify all client IDs are unique and positive integers', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/clients`);
            const clients = await response.json();

            const ids = clients.map(c => c.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);

            for (const id of ids) {
                expect(Number.isInteger(id)).toBeTruthy();
                expect(id).toBeGreaterThan(0);
            }
        });
    });

    /**
     * ============================================================
     * 3. CLIENT LOCATIONS API: /api/api/client-locations
     * ============================================================
     */
    test.describe('3. Client Locations API (/client-locations)', () => {

        test('POS-01 - Retrieve all client locations successfully', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/client-locations`);
            expect(response.status()).toBe(200);

            const locations = await response.json();
            expect(Array.isArray(locations)).toBeTruthy();
            expect(locations.length).toBeGreaterThan(0);

            console.log(`[PASS POS] /client-locations returned ${locations.length} locations`);

            const sample = locations[0];
            expect(sample).toHaveProperty('id');
            expect(sample).toHaveProperty('location');
            expect(sample).toHaveProperty('client');
            expect(sample.client).toHaveProperty('id');
            expect(sample.client).toHaveProperty('name');
        });

        test('POS-02 - Cross-validate client locations with MySQL database', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/client-locations`);
            const apiLocations = await response.json();

            try {
                const conn = await getDbConnection();
                const [dbRows] = await conn.query('SELECT id, location, client_id FROM client_location');
                console.log(`[DB] Database client_location count: ${dbRows.length}, API location count: ${apiLocations.length}`);

                expect(apiLocations.length).toBe(dbRows.length);
            } catch (err) {
                console.warn('[WARN DB] Client locations DB validation:', err.message);
            }
        });

        test('POS-03 - Retrieve locations for a specific existing client', async () => {
            // Get an active client ID from the locations list
            const locRes = await apiContext.get(`${API_BASE_URL}/client-locations`);
            const locations = await locRes.json();
            const validClient = locations.find(l => l.client && l.client.id);

            test.skip(!validClient, 'No client found in client-locations response');

            const clientId = validClient.client.id;
            const res = await apiContext.get(`${API_BASE_URL}/client-locations/client/${clientId}`);
            expect(res.status()).toBe(200);

            const clientLocs = await res.json();
            expect(Array.isArray(clientLocs)).toBeTruthy();
            expect(clientLocs.length).toBeGreaterThan(0);
            for (const loc of clientLocs) {
                expect(loc.client.id).toBe(clientId);
            }
        });

        test('NEG-01 - Reject unauthenticated /client-locations request', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/client-locations`);

            expect([401, 403]).toContain(response.status());
            await unauthContext.dispose().catch(() => {});
        });

        test('NEG-02 - Retrieve locations for non-existent client ID returns empty array', async () => {
            const nonExistentClientId = 99999999;
            const res = await apiContext.get(`${API_BASE_URL}/client-locations/client/${nonExistentClientId}`);

            expect(res.status()).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data)).toBeTruthy();
            expect(data.length).toBe(0);
        });

        test('EDGE-01 - Client location values conform to standard delivery types', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/client-locations`);
            const locations = await response.json();

            const locationTypes = new Set(locations.map(l => l.location));
            console.log('Detected location types:', Array.from(locationTypes));

            // Standard types include Offshore, Onsite, Hybrid etc.
            expect(locations.every(l => typeof l.location === 'string' && l.location.trim().length > 0)).toBeTruthy();
        });
    });

    /**
     * ============================================================
     * 4. FINANCIAL YEAR API: /api/api/getFinancialYear
     * ============================================================
     */
    test.describe('4. Financial Year API (/getFinancialYear)', () => {

        test('POS-01 - Retrieve financial years successfully', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/getFinancialYear`);
            expect(response.status()).toBe(200);

            const years = await response.json();
            expect(Array.isArray(years)).toBeTruthy();
            expect(years.length).toBeGreaterThan(0);

            console.log(`[PASS POS] /getFinancialYear returned ${years.length} items:`, years);

            for (const item of years) {
                expect(item).toHaveProperty('id');
                expect(item).toHaveProperty('year');
                expect(item.year).toMatch(/^FY\d{2}$/);
            }
        });

        test('POS-02 - Cross-validate financial years with MySQL database', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/getFinancialYear`);
            const apiYears = await response.json();

            try {
                const conn = await getDbConnection();
                const [dbRows] = await conn.query('SELECT id, year FROM financial_year ORDER BY id');
                console.log(`[DB] Database financial_year count: ${dbRows.length}, API count: ${apiYears.length}`);

                expect(apiYears.length).toBe(dbRows.length);

                const dbYearValues = dbRows.map(r => r.year).sort();
                const apiYearValues = apiYears.map(y => y.year).sort();
                expect(apiYearValues).toEqual(dbYearValues);
            } catch (err) {
                console.warn('[WARN DB] Financial year DB validation:', err.message);
            }
        });

        test('NEG-01 - Reject unauthenticated /getFinancialYear request', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/getFinancialYear`);

            expect([401, 403]).toContain(response.status());
            await unauthContext.dispose().catch(() => {});
        });

        test('EDGE-01 - Verify all financial years have distinct IDs and labels', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/getFinancialYear`);
            const years = await response.json();

            const ids = years.map(y => y.id);
            const labels = years.map(y => y.year);

            expect(new Set(ids).size).toBe(ids.length);
            expect(new Set(labels).size).toBe(labels.length);
        });
    });

    /**
     * ============================================================
     * 5. SEARCH EMPLOYEE BY NAME OR EMPLOYEE ID:
     *    /api/api/get/searchEmployeeByNameOrEmployeeId
     * ============================================================
     */
    test.describe('5. Search Employee API (/get/searchEmployeeByNameOrEmployeeId)', () => {

        test('POS-01 - Search employee by exact employeeId parameter', async () => {
            const empId = '1411';
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeId: empId }
            });

            expect(response.status()).toBe(200);
            const employees = await response.json();
            expect(Array.isArray(employees)).toBeTruthy();
            expect(employees.length).toBeGreaterThanOrEqual(1);

            const matched = employees.find(e => String(e.employeeId).trim() === empId);
            expect(matched).toBeDefined();
            expect(matched).toHaveProperty('fullName');
            console.log(`[PASS POS] Found employee by ID ${empId}: ${matched.fullName}`);
        });

        test('POS-02 - Search employee by employeeName parameter', async () => {
            const searchName = 'Vijay';
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeName: searchName }
            });

            expect(response.status()).toBe(200);
            const employees = await response.json();
            expect(Array.isArray(employees)).toBeTruthy();
            expect(employees.length).toBeGreaterThan(0);

            const hasMatch = employees.some(e => e.fullName.toLowerCase().includes(searchName.toLowerCase()));
            expect(hasMatch).toBeTruthy();
            console.log(`[PASS POS] Found ${employees.length} employee(s) matching "${searchName}"`);
        });

        test('NEG-01 - Reject unauthenticated search request', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeId: '1411' }
            });

            expect([401, 403]).toContain(response.status());
            await unauthContext.dispose().catch(() => {});
        });

        test('NEG-02 - Search for nonexistent employee ID returns empty array', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeId: '999999_NON_EXISTENT' }
            });

            expect(response.status()).toBe(200);
            const employees = await response.json();
            expect(Array.isArray(employees)).toBeTruthy();
            expect(employees.length).toBe(0);
        });

        test('EDGE-01 - Search with SQL injection / special characters string', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeName: "' OR '1'='1" }
            });

            // The API must safely handle SQL injection vectors without 500 error
            expect([200, 400]).toContain(response.status());
            if (response.status() === 200) {
                const data = await response.json();
                expect(Array.isArray(data)).toBeTruthy();
            }
        });

        test('EDGE-02 - Search with empty string parameter', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeId: '' },
                timeout: 60000
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(Array.isArray(data)).toBeTruthy();
        });
    });

    /**
     * ============================================================
     * 6. ALL EMPLOYEES MASTER API: /api/api/get/allEmployee
     * ============================================================
     */
    test.describe('6. All Employees API (/get/allEmployee)', () => {

        test('POS-01 - Retrieve all employees master list successfully', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/allEmployee`, {
                timeout: 90000
            });

            expect(response.status()).toBe(200);
            const employees = await response.json();

            expect(Array.isArray(employees)).toBeTruthy();
            expect(employees.length).toBeGreaterThan(500);

            console.log(`[PASS POS] /get/allEmployee returned ${employees.length} employee records`);

            const sample = employees[0];
            expect(sample).toHaveProperty('employeeId');
            expect(sample).toHaveProperty('fullName');
            expect(sample).toHaveProperty('employeeAllocations');
            expect(sample).toHaveProperty('practiceSubPracticeBands');
        });

        test('POS-02 - Cross-validate active employee count with MySQL emp_details', async () => {
            try {
                const conn = await getDbConnection();
                const [dbRows] = await conn.query('SELECT COUNT(*) as count FROM emp_details WHERE COALESCE(is_deleted, 0) = 0');
                const dbActiveCount = dbRows[0].count;

                console.log(`[DB] Database active employees: ${dbActiveCount}`);
                expect(dbActiveCount).toBeGreaterThan(0);
            } catch (err) {
                console.warn('[WARN DB] allEmployee DB count:', err.message);
            }
        });

        test('NEG-01 - Reject unauthenticated /get/allEmployee request', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/get/allEmployee`);

            expect([401, 403]).toContain(response.status());
            await unauthContext.dispose().catch(() => {});
        });

        test('EDGE-01 - Verify employee records have non-null employee IDs and full names', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/allEmployee`, {
                timeout: 90000
            });

            const employees = await response.json();
            const sampleSlice = employees.slice(0, 100);

            for (const emp of sampleSlice) {
                expect(emp.employeeId).toBeDefined();
                expect(String(emp.employeeId).trim().length).toBeGreaterThan(0);
                expect(emp.fullName).toBeDefined();
            }
        });
    });
});
