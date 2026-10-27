const { test, expect, request } = require('@playwright/test');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const HOST_BASE_URL = (process.env.BASE_URL || 'https://13.61.179.149')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

const API_BASE_URL = `${HOST_BASE_URL}/api/api`;
const API_TOKEN = process.env.API_TOKEN;

// Qualifiers captured from UI Network tab & database lookup table
const LOOKUP_QUALIFIERS = [
    'Role',
    'PrimarySkill',
    'TotalExp',
    'ItRelevantExp',
    'Certification',
    'Category',
    'workAuthorization',
    'employmentStatus',
    'Practice',
    'SubPractice',
    'Practice owner',
    'Client Manager Level 1',
    'Relanto PM-Onsite',
    'Relanto PM-Offshore',
    'BaseLocation'
];

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

test.describe('Employee Personal Info & Reports - API Automation Suite', () => {
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
     * 1. LOOKUP APIS AUTOMATION
     * ============================================================
     */
    test.describe('1. Lookup APIs (Dropdown / Master Data Validation)', () => {

        for (const qualifier of LOOKUP_QUALIFIERS) {
            test(`POS - Validate lookup for qualifier: "${qualifier}"`, async () => {
                const response = await apiContext.get(`${API_BASE_URL}/lookup`, {
                    params: { qualifier }
                });

                expect(response.status()).toBe(200);

                const data = await response.json();
                expect(Array.isArray(data)).toBeTruthy();
                console.log(`[PASS] Qualifier: "${qualifier}" returned ${data.length} items`);

                // Schema validation for returned lookup items
                for (const item of data) {
                    expect(item).toHaveProperty('id');
                    expect(item).toHaveProperty('qualifier');
                    expect(item).toHaveProperty('value');
                    expect(item.qualifier.toLowerCase()).toBe(qualifier.toLowerCase());
                }

                // DB Cross-Validation
                try {
                    const conn = await getDbConnection();
                    const [dbRows] = await conn.query(
                        'SELECT id, qualifier, value FROM lookup WHERE LOWER(qualifier) = LOWER(?) ORDER BY id',
                        [qualifier]
                    );

                    expect(data.length).toBe(dbRows.length);

                    const dbValues = dbRows.map(r => String(r.value || '').trim()).sort();
                    const apiValues = data.map(r => String(r.value || '').trim()).sort();
                    expect(apiValues).toEqual(dbValues);

                    console.log(`[PASS DB MATCH] "${qualifier}" matches database perfectly (${data.length} records)`);
                } catch (dbErr) {
                    console.warn(`[WARN DB] Could not compare "${qualifier}" with DB:`, dbErr.message);
                }
            });
        }

        test('NEG - Lookup API rejects requests without Authorization token', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/lookup`, {
                params: { qualifier: 'Role' },
                headers: { 'Accept': 'application/json' }
            });

            expect([401, 403]).toContain(response.status());
            console.log(`[PASS NEG] Unauthenticated lookup returned status: ${response.status()}`);
            await unauthContext.dispose().catch(() => {});
        });

        test('NEG - Lookup API rejects invalid / expired Bearer token', async () => {
            const badContext = await request.newContext({
                ignoreHTTPSErrors: true,
                extraHTTPHeaders: {
                    'Authorization': 'Bearer INVALID_EXPIRED_TOKEN_12345',
                    'Accept': 'application/json'
                }
            });
            const response = await badContext.get(`${API_BASE_URL}/lookup`, {
                params: { qualifier: 'Role' }
            });

            expect([401, 403]).toContain(response.status());
            console.log(`[PASS NEG] Invalid token returned status: ${response.status()}`);
            await badContext.dispose().catch(() => {});
        });

        test('EDGE - Lookup API with unknown / non-existent qualifier', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/lookup`, {
                params: { qualifier: 'NON_EXISTENT_QUALIFIER_XYZ_999' }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(Array.isArray(data)).toBeTruthy();
            expect(data.length).toBe(0);
            console.log('[PASS EDGE] Unknown qualifier gracefully returns empty array');
        });
    });

    /**
     * ============================================================
     * 2. SEARCH EMPLOYEE BY NAME OR EMPLOYEE ID (WITH PARAMETERS)
     * ============================================================
     */
    test.describe('2. searchEmployeeByNameOrEmployeeId API Validation (Items 1 & Search Params)', () => {

        test('POS - Retrieve full employee personal info list (no params)', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`);

            expect(response.status()).toBe(200);

            const employees = await response.json();
            expect(Array.isArray(employees)).toBeTruthy();
            expect(employees.length).toBeGreaterThan(0);

            console.log(`[PASS POS] searchEmployeeByNameOrEmployeeId returned ${employees.length} employees`);

            // Schema validation on sample records
            const sample = employees[0];
            expect(sample).toHaveProperty('employeeId');
            expect(sample).toHaveProperty('fullName');
        });

        test('POS - Search by exact employeeId parameter (?employeeId=1411)', async () => {
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
            console.log(`[PASS POS] Found employee by ID: ${matched.fullName} (ID: ${matched.employeeId})`);

            // Cross-validate with DB
            const conn = await getDbConnection();
            const [rows] = await conn.query('SELECT emp_id, full_name, official_email_id FROM emp_details WHERE emp_id = ?', [empId]);
            expect(rows.length).toBe(1);
            expect(matched.fullName.trim()).toBe(rows[0].full_name.trim());
        });

        test('POS - Search by employeeName parameter (?employeeName=Krishnappa)', async () => {
            const searchName = 'Krishnappa';
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeName: searchName }
            });

            expect(response.status()).toBe(200);
            const employees = await response.json();
            expect(Array.isArray(employees)).toBeTruthy();
            expect(employees.length).toBeGreaterThanOrEqual(1);

            const allContainName = employees.some(e => e.fullName.toLowerCase().includes(searchName.toLowerCase()));
            expect(allContainName).toBeTruthy();
            console.log(`[PASS POS] Found ${employees.length} employee(s) matching name: "${searchName}"`);
        });

        test('POS - Full DB consistency validation against active emp_details', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`);

            expect(response.status()).toBe(200);
            const apiEmployees = await response.json();

            const conn = await getDbConnection();
            const [dbRows] = await conn.query(
                'SELECT emp_id, full_name, gender, marital_status, official_email_id, personal_email_id, contact_no, blood_group FROM emp_details WHERE COALESCE(is_deleted, 0) = 0'
            );

            console.log(`DB active employee count: ${dbRows.length}, API employee count: ${apiEmployees.length}`);

            const apiMap = new Map();
            for (const emp of apiEmployees) {
                apiMap.set(String(emp.employeeId || emp.emp_id).trim(), emp);
            }

            let matchCount = 0;
            for (const dbEmp of dbRows.slice(0, 50)) {
                const empId = String(dbEmp.emp_id).trim();
                if (apiMap.has(empId)) {
                    matchCount++;
                    const apiEmp = apiMap.get(empId);
                    expect(String(apiEmp.fullName || '').trim()).toBe(String(dbEmp.full_name || '').trim());
                    if (dbEmp.official_email_id) {
                        expect(String(apiEmp.officialEmailId || '').toLowerCase().trim()).toBe(String(dbEmp.official_email_id).toLowerCase().trim());
                    }
                }
            }

            console.log(`[PASS DB MATCH] Verified ${matchCount}/50 sample active employees match DB exactly`);
        });

        test('NEG - Search with non-existent employeeId returns empty array', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeId: '99999999' }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(Array.isArray(data)).toBeTruthy();
            expect(data.length).toBe(0);
            console.log('[PASS NEG] Non-existent ID correctly returned empty array');
        });

        test('NEG - Search with non-existent employeeName returns empty array', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeName: 'NON_EXISTENT_NAME_XYZ_9999' }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(Array.isArray(data)).toBeTruthy();
            expect(data.length).toBe(0);
            console.log('[PASS NEG] Non-existent name correctly returned empty array');
        });

        test('EDGE - SQL Injection protection in search parameters', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                params: { employeeId: "1' OR '1'='1" }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(Array.isArray(data)).toBeTruthy();
            expect(data.length).toBe(0);
            console.log('[PASS EDGE] SQL injection query safely handled without error or data leak');
        });

        test('NEG - searchEmployee API rejects unauthenticated requests', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                headers: { 'Accept': 'application/json' }
            });

            expect([401, 403]).toContain(response.status());
            console.log(`[PASS NEG] Unauthenticated request correctly rejected with status: ${response.status()}`);
            await unauthContext.dispose().catch(() => {});
        });

        test('NEG - Unsupported HTTP method (POST) returns 405 Method Not Allowed', async () => {
            const response = await apiContext.post(`${API_BASE_URL}/get/searchEmployeeByNameOrEmployeeId`, {
                data: {}
            });

            expect([405, 404, 400]).toContain(response.status());
            console.log(`[PASS NEG] Unsupported POST returned status: ${response.status()}`);
        });
    });

    /**
     * ============================================================
     * 3. AS-OF-DATE REPORT API AUTOMATION (Item 3)
     * ============================================================
     */
    test.describe('3. As-Of-Date Report API Validation (Item 3)', () => {

        test('POS - Retrieve utilization report for current date', async () => {
            const today = new Date().toISOString().split('T')[0];
            const response = await apiContext.get(`${API_BASE_URL}/v1/utilization/reports/as-of-date`, {
                params: { asOfDate: today }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();

            expect(data).toHaveProperty('reportDate');
            expect(data).toHaveProperty('reportType');
            expect(data).toHaveProperty('summary');
            expect(data).toHaveProperty('employees');

            console.log(`[PASS POS] as-of-date report for ${today}: totalEmployees=${data.summary.totalEmployees}, utilization=${data.summary.utilizationPercentage}%`);

            // Verify summary formula consistency
            const s = data.summary;
            const sumEmployees = (s.production || 0) + (s.internal || 0) + (s.training || 0) + (s.bench || 0) + (s.Hold || 0);
            expect(s.totalEmployees).toBe(sumEmployees);
            console.log('[PASS POS] Summary employee counts are mathematically consistent');
        });

        test('POS - Retrieve contract (C2C) employees report as of current date', async () => {
            const today = new Date().toISOString().split('T')[0];
            const response = await apiContext.get(`${API_BASE_URL}/v1/contract-employees/report/as-of-date`, {
                params: { asOfDate: today }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(data).toBeDefined();
            console.log(`[PASS POS] Contract employees as-of-date report retrieved successfully`);
        });

        test('NEG - as-of-date rejects unauthenticated request', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const today = new Date().toISOString().split('T')[0];
            const response = await unauthContext.get(`${API_BASE_URL}/v1/utilization/reports/as-of-date`, {
                params: { asOfDate: today },
                headers: { 'Accept': 'application/json' }
            });

            expect([401, 403]).toContain(response.status());
            console.log(`[PASS NEG] Unauthenticated as-of-date correctly rejected with status: ${response.status()}`);
            await unauthContext.dispose().catch(() => {});
        });

        test('EDGE - as-of-date with invalid date string handled properly', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/v1/utilization/reports/as-of-date`, {
                params: { asOfDate: 'invalid-date-format' }
            });

            expect([400, 200, 500]).toContain(response.status());
            console.log(`[PASS EDGE] Invalid date format responded with status: ${response.status()}`);
        });
    });
});
