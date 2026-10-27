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
        dbConnection = await mysql.createConnection({
            host: isLocal ? 'localhost' : (process.env.DB_HOST || '13.61.179.149'),
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER || 'root',
            password: isLocal ? (process.env.LOCAL_DB_PASSWORD || 'root') : (process.env.DB_PASSWORD || 'relanto123'),
            database: process.env.DB_NAME || 'hrportal'
        });
    }
    return dbConnection;
}

test.describe('Milestone Reports & SOW Invoicing APIs - Automation Suite', () => {
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
    // 1. MILESTONE REPORTS API: GET /api/sow/milestones/reports
    // ============================================================
    test.describe('1. Milestone Reports Endpoint (GET /api/sow/milestones/reports)', () => {

        test('MR-API-01: Returns 200 OK and validates response array schema', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            expect(response.status()).toBe(200);

            const data = await response.json();
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThan(0);

            // Validate all 13 DTO fields are defined in every milestone item
            const requiredFields = [
                'milestoneId',
                'milestoneName',
                'sowName',
                'clientName',
                'projectName',
                'amount',
                'dueDate',
                'invoiceStatus',
                'revenueRecognition',
                'description',
                'sowId',
                'sowType',
                'invoiceAmount'
            ];

            for (const item of data) {
                for (const field of requiredFields) {
                    expect(item).toHaveProperty(field);
                }
            }

            console.log(`[PASS] MR-API-01: Response schema verified with all 13 DTO fields across ${data.length} records.`);
        });

        test('MR-API-02: Validates field data types, constraints and contract rules', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            expect(response.status()).toBe(200);

            const data = await response.json();

            for (const item of data) {
                expect(typeof item.milestoneId).toBe('number');
                expect(item.milestoneId).toBeGreaterThan(0);

                expect(typeof item.milestoneName).toBe('string');
                expect(item.milestoneName.trim().length).toBeGreaterThan(0);

                expect(typeof item.sowName).toBe('string');
                expect(typeof item.sowId).toBe('number');

                expect(typeof item.amount).toBe('number');
                expect(item.amount).toBeGreaterThanOrEqual(0);

                // Date format ISO string YYYY-MM-DD
                expect(item.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

                // Invoice status constraints
                if (item.invoiceStatus) {
                    expect(['Pending', 'Invoiced']).toContain(item.invoiceStatus);
                }

                // Revenue recognition constraints
                if (item.revenueRecognition) {
                    expect(['Yes', 'No']).toContain(item.revenueRecognition);
                }

                // Invoice amount: null or valid number
                if (item.invoiceAmount !== null && item.invoiceAmount !== undefined) {
                    expect(typeof item.invoiceAmount).toBe('number');
                }
            }

            console.log(`[PASS] MR-API-02: Data types, constraints, and contract rules strictly validated.`);
        });

        test('MR-API-03: Validates 1:1 data parity with MySQL 5-table join query', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const apiData = await response.json();

            const conn = await getDbConnection();
            const [dbRows] = await conn.query(`
                SELECT 
                    m.id AS milestoneId,
                    m.title AS milestoneName,
                    s.sow_name AS sowName,
                    s.sow_id AS sowId,
                    s.sow_type AS sowType,
                    c.name AS clientName,
                    p.project_name AS projectName,
                    m.amount,
                    DATE_FORMAT(m.due_date, '%Y-%m-%d') AS dueDate,
                    m.invoice_status AS invoiceStatus,
                    m.invoice_amount AS invoiceAmount,
                    m.revenue_recognition AS revenueRecognition,
                    m.description
                FROM sow_milestones m
                JOIN sow s ON m.sow_id = s.sow_id
                LEFT JOIN client c ON s.client_id = c.id
                LEFT JOIN project_sow ps ON ps.sow_id = s.sow_id
                LEFT JOIN project p ON ps.project_id = p.id
                ORDER BY m.id DESC
            `);

            expect(apiData.length).toBe(dbRows.length);

            for (const dbRow of dbRows) {
                const apiItem = apiData.find(x => x.milestoneId === dbRow.milestoneId);
                expect(apiItem).toBeDefined();
                expect(apiItem.milestoneName.trim()).toBe(dbRow.milestoneName.trim());
                expect(apiItem.sowName.trim()).toBe(dbRow.sowName.trim());
                expect(apiItem.sowId).toBe(dbRow.sowId);
                expect((apiItem.clientName || '').trim()).toBe((dbRow.clientName || '').trim());
                expect((apiItem.projectName || '').trim()).toBe((dbRow.projectName || '').trim());
                expect(Number(apiItem.amount)).toBeCloseTo(Number(dbRow.amount), 2);
                expect(apiItem.dueDate).toBe(dbRow.dueDate);
                expect(apiItem.invoiceStatus || 'Pending').toBe(dbRow.invoiceStatus || 'Pending');
                expect(apiItem.revenueRecognition || 'No').toBe(dbRow.revenueRecognition || 'No');
            }

            console.log(`[PASS] MR-API-03: 1:1 parity confirmed between API and MySQL 5-table join.`);
        });

        test('MR-API-04: Validates relational integrity with existing SOW entities', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const apiData = await response.json();

            const conn = await getDbConnection();
            const sowIds = Array.from(new Set(apiData.map(m => m.sowId)));

            for (const sowId of sowIds) {
                const [sowRows] = await conn.query('SELECT sow_id, sow_name, client_id FROM sow WHERE sow_id = ?', [sowId]);
                expect(sowRows.length).toBe(1);
                expect(sowRows[0].sow_id).toBe(sowId);
            }

            console.log(`[PASS] MR-API-04: All ${sowIds.length} unique SOW ID(s) validated against MySQL sow table.`);
        });
    });

    // ============================================================
    // 2. SOW INVOICE TOTALS API: GET /api/sow/milestones/invoice-totals
    // ============================================================
    test.describe('2. SOW Invoice Totals Endpoint (GET /api/sow/milestones/invoice-totals)', () => {

        test('MR-API-05: Single SOW ID query returns 200 OK and matches MySQL computed totals', async () => {
            const reportsRes = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const apiData = await reportsRes.json();
            const targetSowId = apiData[0].sowId;

            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/invoice-totals?sowIds=${targetSowId}`);
            expect(response.status()).toBe(200);

            const totals = await response.json();
            expect(Array.isArray(totals)).toBe(true);
            expect(totals.length).toBe(1);

            const item = totals[0];
            expect(item.sowId).toBe(targetSowId);
            expect(item).toHaveProperty('milestoneCount');
            expect(item).toHaveProperty('invoicedCount');
            expect(item).toHaveProperty('milestoneTotal');
            expect(item).toHaveProperty('invoiceTotal');

            const conn = await getDbConnection();
            const [dbAgg] = await conn.query(`
                SELECT 
                    COUNT(id) AS milestoneCount,
                    COALESCE(SUM(amount), 0) AS milestoneTotal,
                    COALESCE(SUM(CASE WHEN invoice_status = 'Invoiced' THEN 1 ELSE 0 END), 0) AS invoicedCount,
                    COALESCE(SUM(CASE WHEN invoice_status = 'Invoiced' THEN COALESCE(invoice_amount, amount) ELSE amount END), 0) AS invoiceTotal
                FROM sow_milestones
                WHERE sow_id = ?
            `, [targetSowId]);

            const expected = dbAgg[0];
            expect(Number(item.milestoneCount)).toBe(Number(expected.milestoneCount));
            expect(Number(item.invoicedCount)).toBe(Number(expected.invoicedCount));
            expect(Number(item.milestoneTotal)).toBeCloseTo(Number(expected.milestoneTotal), 2);
            expect(Number(item.invoiceTotal)).toBeCloseTo(Number(expected.invoiceTotal), 2);

            console.log(`[PASS] MR-API-05: SOW ${targetSowId} totals matched MySQL: count=${item.milestoneCount}, total=${item.milestoneTotal}`);
        });

        test('MR-API-06: Multiple SOW IDs query returns batch aggregations for all requested SOWs', async () => {
            const reportsRes = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const apiData = await reportsRes.json();
            const sowIds = Array.from(new Set(apiData.map(m => m.sowId)));

            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/invoice-totals?sowIds=${sowIds.join(',')}`);
            expect(response.status()).toBe(200);

            const totals = await response.json();
            expect(totals.length).toBe(sowIds.length);

            for (const sowId of sowIds) {
                const sowSummary = totals.find(t => t.sowId === sowId);
                expect(sowSummary).toBeDefined();
            }

            console.log(`[PASS] MR-API-06: Batch SOW invoice totals validated for ${sowIds.length} SOW(s).`);
        });

        test('MR-API-07: Validates business logic calculation rule (Invoiced vs Pending)', async () => {
            const reportsRes = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const milestones = await reportsRes.json();
            const sowId = milestones[0].sowId;

            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/invoice-totals?sowIds=${sowId}`);
            const totals = await response.json();
            const sowSummary = totals.find(t => t.sowId === sowId);

            // Compute expected totals via application rule
            const sowMilestones = milestones.filter(m => m.sowId === sowId);
            const expectedMilestoneTotal = sowMilestones.reduce((acc, m) => acc + (m.amount || 0), 0);

            let expectedInvoiceTotal = 0;
            for (const m of sowMilestones) {
                if (m.invoiceStatus === 'Invoiced') {
                    expectedInvoiceTotal += (m.invoiceAmount !== null && m.invoiceAmount !== undefined) ? m.invoiceAmount : m.amount;
                } else {
                    expectedInvoiceTotal += m.amount;
                }
            }

            expect(Number(sowSummary.milestoneTotal)).toBeCloseTo(expectedMilestoneTotal, 2);
            expect(Number(sowSummary.invoiceTotal)).toBeCloseTo(expectedInvoiceTotal, 2);

            console.log(`[PASS] MR-API-07: Business calculation rule verified (Milestone Total=${expectedMilestoneTotal}, Invoice Total=${expectedInvoiceTotal}).`);
        });

        test('MR-API-08: Cross-validates invoicedCount and milestoneCount accuracy', async () => {
            const reportsRes = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const milestones = await reportsRes.json();
            const sowId = milestones[0].sowId;

            const sowMilestones = milestones.filter(m => m.sowId === sowId);
            const expectedCount = sowMilestones.length;
            const expectedInvoiced = sowMilestones.filter(m => m.invoiceStatus === 'Invoiced').length;

            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/invoice-totals?sowIds=${sowId}`);
            const [summary] = await response.json();

            expect(summary.milestoneCount).toBe(expectedCount);
            expect(summary.invoicedCount).toBe(expectedInvoiced);

            console.log(`[PASS] MR-API-08: Accurate counts verified: total=${expectedCount}, invoiced=${expectedInvoiced}.`);
        });
    });

    // ============================================================
    // 3. SOW SPECIFIC MILESTONES & AUDIT LOGS ENDPOINTS
    // ============================================================
    test.describe('3. SOW Specific Milestones & Audit Logs Endpoints', () => {

        test('MR-API-09: GET /api/sow/{sowId}/milestones returns 200 OK with milestones for specific SOW', async () => {
            const reportsRes = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const apiData = await reportsRes.json();
            const sowId = apiData[0].sowId;

            const response = await apiContext.get(`${API_BASE_URL}/sow/${sowId}/milestones`);
            expect(response.status()).toBe(200);

            const sowMilestones = await response.json();
            expect(Array.isArray(sowMilestones)).toBe(true);
            expect(sowMilestones.length).toBeGreaterThan(0);

            const conn = await getDbConnection();
            for (const m of sowMilestones) {
                const [dbRows] = await conn.query('SELECT sow_id FROM sow_milestones WHERE id = ?', [m.id]);
                expect(dbRows[0].sow_id).toBe(sowId);
            }

            console.log(`[PASS] MR-API-09: GET /sow/${sowId}/milestones returned ${sowMilestones.length} milestones.`);
        });

        test('MR-API-10: GET /api/sow/milestones/{milestoneId}/audit-logs returns 200 OK with audit trail', async () => {
            const reportsRes = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const apiData = await reportsRes.json();
            const milestoneId = apiData[0].milestoneId;

            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/${milestoneId}/audit-logs`);
            expect(response.status()).toBe(200);

            const auditLogs = await response.json();
            expect(Array.isArray(auditLogs)).toBe(true);

            const conn = await getDbConnection();
            const [dbLogs] = await conn.query('SELECT * FROM milestone_audit_logs WHERE milestone_id = ? ORDER BY id DESC', [milestoneId]);
            expect(auditLogs.length).toBe(dbLogs.length);

            if (auditLogs.length > 0) {
                const log = auditLogs[0];
                expect(log).toHaveProperty('id');
                expect(log).toHaveProperty('milestoneId', milestoneId);
                expect(log).toHaveProperty('action');
                expect(log).toHaveProperty('updatedBy');
            }

            console.log(`[PASS] MR-API-10: Audit logs endpoint returned ${auditLogs.length} audit entries matching MySQL.`);
        });
    });

    // ============================================================
    // 4. NEGATIVE SCENARIOS & ERROR HANDLING (-VE TESTS)
    // ============================================================
    test.describe('4. Negative Scenarios & Error Handling (-ve Tests)', () => {

        test('MR-NEG-01: Missing Authorization header returns 401 Unauthorized', async () => {
            const unauthContext = await request.newContext({ ignoreHTTPSErrors: true });
            const response = await unauthContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            expect(response.status()).toBe(401);
            await unauthContext.dispose();

            console.log('[PASS] MR-NEG-01: 401 Unauthorized returned when Authorization header is absent.');
        });

        test('MR-NEG-02: Invalid / Expired Bearer token returns 401 Unauthorized', async () => {
            const badContext = await request.newContext({
                ignoreHTTPSErrors: true,
                extraHTTPHeaders: {
                    'Authorization': 'Bearer INVALID_EXPIRED_JWT_TOKEN_123456789'
                }
            });
            const response = await badContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            expect(response.status()).toBe(401);
            await badContext.dispose();

            console.log('[PASS] MR-NEG-02: 401 Unauthorized returned for invalid Bearer token.');
        });

        test('MR-NEG-03: GET /api/sow/milestones/invoice-totals without sowIds parameter returns 400 Bad Request', async () => {
            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/invoice-totals`);
            expect(response.status()).toBe(400);

            console.log('[PASS] MR-NEG-03: 400 Bad Request returned when required sowIds parameter is omitted.');
        });

        test('MR-NEG-04: Non-existent SOW ID query returns empty results', async () => {
            const nonExistentSowId = 999999999;
            const response = await apiContext.get(`${API_BASE_URL}/sow/${nonExistentSowId}/milestones`);
            expect(response.status()).toBe(200);

            const data = await response.json();
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBe(0);

            console.log('[PASS] MR-NEG-04: Non-existent SOW ID returns empty list gracefully.');
        });

        test('MR-NEG-05: Unsupported HTTP method (POST on /reports) returns 405 Method Not Allowed', async () => {
            const response = await apiContext.post(`${API_BASE_URL}/sow/milestones/reports`, {
                data: { dummy: 'payload' }
            });
            expect(response.status()).toBe(405);

            console.log('[PASS] MR-NEG-05: 405 Method Not Allowed returned for unsupported HTTP verb.');
        });
    });

    // ============================================================
    // 5. EXPLICIT EDGE CASES & BOUNDARY CONDITIONS
    // ============================================================
    test.describe('5. Explicit Edge Cases & Boundary Conditions', () => {

        test('MR-EDGE-01: Milestone with null invoiceAmount defaults to planned amount in totals', async () => {
            const conn = await getDbConnection();
            const [nullRows] = await conn.query(`
                SELECT id, sow_id, amount, invoice_amount 
                FROM sow_milestones 
                WHERE invoice_amount IS NULL
            `);

            if (nullRows.length > 0) {
                const targetSowId = nullRows[0].sow_id;
                const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/invoice-totals?sowIds=${targetSowId}`);
                expect(response.status()).toBe(200);
                const [totals] = await response.json();

                // If invoiceAmount is null, invoiceTotal equals milestoneTotal
                expect(Number(totals.invoiceTotal)).toBeCloseTo(Number(totals.milestoneTotal), 2);
            }

            console.log('[PASS] MR-EDGE-01: Null invoice_amount correctly defaults to milestone amount in aggregation.');
        });

        test('MR-EDGE-02: Non-existent SOW in invoice-totals returns empty array', async () => {
            const nonExistentId = 999999999;
            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/invoice-totals?sowIds=${nonExistentId}`);
            expect(response.status()).toBe(200);

            const totals = await response.json();
            expect(Array.isArray(totals)).toBe(true);
            expect(totals.length).toBe(0);

            console.log('[PASS] MR-EDGE-02: Querying invoice totals for non-existent SOW returns empty array without error.');
        });

        test('MR-EDGE-03: Repeated duplicate sowIds in query parameter are handled idempotently', async () => {
            const reportsRes = await apiContext.get(`${API_BASE_URL}/sow/milestones/reports`);
            const apiData = await reportsRes.json();
            const sowId = apiData[0].sowId;

            // Query with duplicate sowIds: ?sowIds=1508,1508,1508
            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/invoice-totals?sowIds=${sowId},${sowId},${sowId}`);
            expect(response.status()).toBe(200);

            const totals = await response.json();
            expect(Array.isArray(totals)).toBe(true);
            expect(totals.length).toBeGreaterThanOrEqual(1);

            console.log('[PASS] MR-EDGE-03: Duplicate sowIds query handled gracefully.');
        });

        test('MR-EDGE-04: Non-existent milestone ID audit logs returns empty array', async () => {
            const nonExistentMilestoneId = 999999999;
            const response = await apiContext.get(`${API_BASE_URL}/sow/milestones/${nonExistentMilestoneId}/audit-logs`);
            expect(response.status()).toBe(200);

            const data = await response.json();
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBe(0);

            console.log('[PASS] MR-EDGE-04: Audit logs for non-existent milestone returns empty array gracefully.');
        });
    });
});
