/**
 * Admin Outrate Management: Comprehensive API Automation Test Suite
 * 
 * Validates Outrate Management Backend REST APIs in EmployeeBaseCostController.java:
 * 1. GET  /api/api/employee-base-costs/me
 * 2. GET  /api/api/employee-base-costs/view-logs
 * 3. POST /api/api/employee-base-costs/log-view
 * 4. Cross-API Integration & Security Reconciliation
 * 
 * Cross-validates against MySQL tables:
 * - emp_details (official_email_id, full_name, is_deleted)
 * - outrate_view_log (id, viewer_name, viewer_email, action, timestamp)
 */

const { test, expect, request } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Turn off trace recording to avoid Windows file-lock issues
test.use({ trace: 'off' });

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================
const BASE_URL = (process.env.BASE_URL || 'http://localhost:4200/').replace(/\/$/, '');
const API_BASE = (process.env.API_BASE_URL || (BASE_URL.includes('localhost') ? 'http://localhost:8080/api' : `${BASE_URL}/api/api`)).replace(/\/$/, '');

function getAuthToken() {
    if (process.env.API_TOKEN && process.env.API_TOKEN.trim().length > 10) {
        return process.env.API_TOKEN.trim();
    }
    const authPath = path.resolve(__dirname, '../../../.auth/user.json');
    if (!fs.existsSync(authPath)) {
        throw new Error(`Authentication file not found at ${authPath}`);
    }
    const data = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const origin = data.origins?.find(o => o.localStorage?.some(item => item.name === 'token'));
    const tokenItem = origin?.localStorage?.find(item => item.name === 'token');
    if (!tokenItem?.value) {
        throw new Error(`JWT Token missing in auth state ${authPath}`);
    }
    return tokenItem.value.trim();
}

// Decode JWT to extract authenticated principal email
function getJwtPrincipalEmail(token) {
    if (!token || !token.includes('.')) {
        throw new Error('Invalid JWT format provided for principal email extraction');
    }
    const payloadBase64 = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
    if (!decoded.sub) {
        throw new Error('JWT payload missing "sub" claim');
    }
    return decoded.sub;
}

// Database Connection Helper
let dbConnection = null;

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

// Playwright Authenticated API Context Helper
async function getApiContext() {
    const token = getAuthToken();
    return await request.newContext({
        baseURL: `${API_BASE}/`,
        extraHTTPHeaders: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        ignoreHTTPSErrors: true
    });
}

// Playwright Unauthenticated API Context Helper
async function getUnauthContext() {
    return await request.newContext({
        baseURL: `${API_BASE}/`,
        ignoreHTTPSErrors: true
    });
}

// ============================================================
// TEST SUITE: OUTRATE MANAGEMENT API AUTOMATION
// ============================================================
test.describe('Admin - Outrate Management API Automation', () => {
    // Run tests serially to preserve strict DB row count & ordering assertions
    test.describe.configure({ mode: 'default' });

    test.afterAll(async () => {
        if (dbConnection) {
            await dbConnection.end();
            dbConnection = null;
        }
    });

    // ============================================================
    // 1. GET OUTRATE VIEWER NAME: /api/api/employee-base-costs/me
    // ============================================================
    test.describe('1. API: Get Outrate Viewer Name (GET /me)', () => {

        // --- Positive Test Cases ---
        test('OUT-ME-P01: Send request with a valid Admin JWT -> HTTP 200', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/me');
            expect(res.status()).toBe(200);
        });

        test('OUT-ME-P02 & P03: Verify response contains fullName and is a string', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/me');
            expect(res.status()).toBe(200);

            const json = await res.json();
            expect(json).toHaveProperty('fullName');
            expect(typeof json.fullName).toBe('string');
            expect(json.fullName.trim().length).toBeGreaterThan(0);
        });

        test('OUT-ME-P04 & P05: Verify Admin has matching emp_details record via official_email_id', async () => {
            const token = getAuthToken();
            const principalEmail = getJwtPrincipalEmail(token);
            expect(principalEmail).toBeTruthy();

            const conn = await getDbConnection();
            const [empRows] = await conn.execute(
                'SELECT emp_id, full_name, official_email_id FROM emp_details WHERE LOWER(official_email_id) = ?',
                [principalEmail.toLowerCase()]
            );
            expect(empRows.length).toBe(1);
            expect(empRows[0].full_name).toBeTruthy();

            const api = await getApiContext();
            const res = await api.get('employee-base-costs/me');
            expect(res.status()).toBe(200);

            const json = await res.json();
            // Strict match against emp_details full_name (Zero bypass)
            expect(json.fullName).toBe(empRows[0].full_name);
        });

        test('OUT-ME-P06 & P07: Verify response is valid JSON and contains only expected properties', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/me');

            expect(res.status()).toBe(200);
            expect(res.headers()['content-type']).toContain('application/json');

            const body = await res.json();
            expect(body).toEqual({
                fullName: expect.any(String)
            });
        });

        test('OUT-ME-P08: Verify the returned name has no unexpected modification from DB', async () => {
            const token = getAuthToken();
            const principalEmail = getJwtPrincipalEmail(token);
            const conn = await getDbConnection();

            const [empRows] = await conn.execute(
                'SELECT full_name FROM emp_details WHERE LOWER(official_email_id) = ?',
                [principalEmail.toLowerCase()]
            );

            const api = await getApiContext();
            const res = await api.get('employee-base-costs/me');
            const json = await res.json();

            expect(json.fullName).toBe(empRows[0].full_name);
        });

        // --- Negative Test Cases ---
        test('OUT-ME-N01: Send request without an Authorization header -> HTTP 401', async () => {
            const unauth = await getUnauthContext();
            const res = await unauth.get('employee-base-costs/me');
            expect(res.status()).toBe(401);
            await unauth.dispose();
        });

        test('OUT-ME-N02: Send request with an empty Bearer token -> HTTP 401', async () => {
            const emptyCtx = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: { 'Authorization': 'Bearer ' },
                ignoreHTTPSErrors: true
            });
            const res = await emptyCtx.get('employee-base-costs/me');
            expect(res.status()).toBe(401);
            await emptyCtx.dispose();
        });

        test('OUT-ME-N03 & N04: Send request with malformed or tampered JWT -> HTTP 401', async () => {
            const tamperedCtx = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.invalidpayload.tamperedSig' },
                ignoreHTTPSErrors: true
            });
            const res = await tamperedCtx.get('employee-base-costs/me');
            expect(res.status()).toBe(401);
            await tamperedCtx.dispose();
        });

        test('OUT-ME-N05: Send request with an expired JWT -> HTTP 401', async () => {
            // Token with exp in the past (epoch 1000000000)
            const expiredPayload = Buffer.from(JSON.stringify({ sub: 'expired@relanto.ai', exp: 1000000000 })).toString('base64');
            const expiredToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${expiredPayload}.dummy_signature`;

            const expiredCtx = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: { 'Authorization': `Bearer ${expiredToken}` },
                ignoreHTTPSErrors: true
            });
            const res = await expiredCtx.get('employee-base-costs/me');
            expect(res.status()).toBe(401);
            await expiredCtx.dispose();
        });

        test('OUT-ME-N08: Send request with an unsupported HTTP method (POST) -> HTTP 405', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/me', { data: {} });
            expect(res.status()).toBe(405);
        });

        test('OUT-ME-N09: Call an incorrect endpoint path -> HTTP 404', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/me-nonexistent-endpoint');
            expect(res.status()).toBe(404);
        });

        test('OUT-ME-N10: Call API without the required /api prefix -> Does not route to Spring Boot REST endpoint', async () => {
            // Calling root domain path directly without /api/api/ hits static Angular SPA
            const directCtx = await request.newContext({
                baseURL: `${BASE_URL}/`,
                ignoreHTTPSErrors: true
            });
            const res = await directCtx.get('employee-base-costs/me');
            // Static Angular returns index.html (text/html) with 200 SPA fallback or 404
            const contentType = res.headers()['content-type'] || '';
            expect(contentType.includes('text/html') || res.status() === 404).toBeTruthy();
            await directCtx.dispose();
        });

        // --- Edge Test Cases ---
        test('OUT-ME-E04: Authenticated email case-insensitivity verification in DB lookup', async () => {
            const token = getAuthToken();
            const principalEmail = getJwtPrincipalEmail(token);
            const conn = await getDbConnection();

            const [lowerRows] = await conn.execute(
                'SELECT full_name FROM emp_details WHERE official_email_id = ?',
                [principalEmail.toLowerCase()]
            );
            const [upperRows] = await conn.execute(
                'SELECT full_name FROM emp_details WHERE official_email_id = ?',
                [principalEmail.toUpperCase()]
            );

            expect(lowerRows.length).toBe(upperRows.length);
            if (lowerRows.length > 0) {
                expect(lowerRows[0].full_name).toBe(upperRows[0].full_name);
            }
        });

        test('OUT-ME-E08: Send multiple requests using the same valid token -> Responses remain consistent', async () => {
            const api = await getApiContext();
            const res1 = await api.get('employee-base-costs/me');
            const res2 = await api.get('employee-base-costs/me');

            expect(res1.status()).toBe(200);
            expect(res2.status()).toBe(200);

            const json1 = await res1.json();
            const json2 = await res2.json();
            expect(json1.fullName).toBe(json2.fullName);
        });

        test('OUT-ME-E10: Send request with extremely long or malformed token -> Rejected with HTTP 400', async () => {
            const longToken = 'A'.repeat(8192);
            const longCtx = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: { 'Authorization': `Bearer ${longToken}` },
                ignoreHTTPSErrors: true
            });
            const res = await longCtx.get('employee-base-costs/me');
            expect(res.status()).toBe(400);
            await longCtx.dispose();
        });
    });

    // ============================================================
    // 2. GET OUTRATE VIEW LOGS: /api/api/employee-base-costs/view-logs
    // ============================================================
    test.describe('2. API: Get Outrate View Logs (GET /view-logs)', () => {

        // --- Positive Test Cases ---
        test('OUT-LOGS-P01, P02 & P03: Send request with valid Admin token -> HTTP 200 with JSON array of audit records', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs');

            expect(res.status()).toBe(200);
            expect(res.headers()['content-type']).toContain('application/json');

            const logs = await res.json();
            expect(Array.isArray(logs)).toBeTruthy();
            expect(logs.length).toBeGreaterThan(0);
        });

        test('OUT-LOGS-P04 to P08: Verify every record schema (id, viewerName, viewerEmail, action, timestamp)', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs');
            const logs = await res.json();

            for (const item of logs.slice(0, 30)) {
                expect(typeof item.id).toBe('number');
                expect(item.id).toBeGreaterThan(0);

                expect(typeof item.viewerName).toBe('string');
                expect(item.viewerName.trim().length).toBeGreaterThan(0);

                expect(typeof item.viewerEmail).toBe('string');
                expect(item.viewerEmail).toContain('@');

                expect(typeof item.action).toBe('string');
                expect(item.action.trim().length).toBeGreaterThan(0);

                expect(typeof item.timestamp).toBe('string');
                expect(isNaN(Date.parse(item.timestamp))).toBeFalsy();
            }
        });

        test('OUT-LOGS-P09: Verify newest record appears first (timestamps in descending order)', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs');
            const logs = await res.json();

            for (let i = 0; i < Math.min(logs.length - 1, 20); i++) {
                const currentEpoch = new Date(logs[i].timestamp).getTime();
                const nextEpoch = new Date(logs[i + 1].timestamp).getTime();
                expect(currentEpoch).toBeGreaterThanOrEqual(nextEpoch);
            }
        });

        test('OUT-LOGS-P10 & P11: Verify VIEWED_INDIVIDUAL and DOWNLOADED_ALL entries are present', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs');
            const logs = await res.json();

            const hasViewedIndividual = logs.some(l => l.action === 'VIEWED_INDIVIDUAL');
            const hasDownloadedAll = logs.some(l => l.action === 'DOWNLOADED_ALL');

            expect(hasViewedIndividual).toBeTruthy();
            expect(hasDownloadedAll).toBeTruthy();
        });

        test('OUT-LOGS-P13: Compare API record count against MySQL outrate_view_log table (Strict zero-bypass)', async () => {
            const conn = await getDbConnection();

            const [dbCount] = await conn.execute('SELECT COUNT(*) AS total FROM outrate_view_log');
            const totalInDb = dbCount[0].total;

            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs');
            const logs = await res.json();

            // Strict equality — zero bypass of record count discrepancies
            expect(logs.length).toBe(totalInDb);
        });

        test('OUT-LOGS-P14: Compare latest API entry with latest database row (Strict zero-bypass)', async () => {
            const conn = await getDbConnection();

            const [dbRows] = await conn.execute(
                'SELECT id, viewer_name, viewer_email, action, timestamp FROM outrate_view_log ORDER BY timestamp DESC LIMIT 1'
            );
            expect(dbRows.length).toBe(1);
            const dbLatest = dbRows[0];

            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs');
            const logs = await res.json();
            const apiLatest = logs[0];

            // Strict equality matching against latest row in outrate_view_log
            expect(apiLatest.id).toBe(dbLatest.id);
            expect(apiLatest.viewerName).toBe(dbLatest.viewer_name);
            expect(apiLatest.viewerEmail).toBe(dbLatest.viewer_email);
            expect(apiLatest.action).toBe(dbLatest.action);
        });

        // --- Negative Test Cases ---
        test('OUT-LOGS-N01: Request without a token -> HTTP 401', async () => {
            const unauth = await getUnauthContext();
            const res = await unauth.get('employee-base-costs/view-logs');
            expect(res.status()).toBe(401);
            await unauth.dispose();
        });

        test('OUT-LOGS-N02, N03 & N04: Request with invalid or tampered JWT -> HTTP 401', async () => {
            const tamperedCtx = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: { 'Authorization': 'Bearer invalid.tampered.token' },
                ignoreHTTPSErrors: true
            });
            const res = await tamperedCtx.get('employee-base-costs/view-logs');
            expect(res.status()).toBe(401);
            await tamperedCtx.dispose();
        });

        test('OUT-LOGS-N06: Request with an incorrect endpoint path -> HTTP 404', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs-invalid-path');
            expect(res.status()).toBe(404);
        });

        test('OUT-LOGS-N07: Use an unsupported HTTP method (POST to /view-logs) -> HTTP 405', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/view-logs', { data: {} });
            expect(res.status()).toBe(405);
        });

        // --- Edge Test Cases ---
        test('OUT-LOGS-E05: Timestamp contains fractional seconds and parses correctly', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs');
            const logs = await res.json();

            const firstWithTimestamp = logs.find(l => l.timestamp);
            expect(firstWithTimestamp).toBeTruthy();
            const parsedDate = new Date(firstWithTimestamp.timestamp);
            expect(isNaN(parsedDate.getTime())).toBeFalsy();
            expect(parsedDate.getFullYear()).toBeGreaterThanOrEqual(2023);
        });

        test('OUT-LOGS-E07: View logs retrieval completes within acceptable performance limit (< 5000ms)', async () => {
            const api = await getApiContext();
            const startTime = Date.now();
            const res = await api.get('employee-base-costs/view-logs');
            const duration = Date.now() - startTime;

            expect(res.status()).toBe(200);
            expect(duration).toBeLessThan(5000);
        });

        test('OUT-LOGS-E11: Verify numeric ID boundary and integrity', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/view-logs');
            const logs = await res.json();

            for (const item of logs.slice(0, 15)) {
                expect(Number.isInteger(item.id)).toBeTruthy();
                expect(item.id).toBeGreaterThan(0);
                expect(item.id).toBeLessThan(Number.MAX_SAFE_INTEGER);
            }
        });

        test('OUT-LOGS-E12: Repeat the request multiple times -> Responses remain valid and ordered', async () => {
            const api = await getApiContext();
            const res1 = await api.get('employee-base-costs/view-logs');
            const res2 = await api.get('employee-base-costs/view-logs');

            expect(res1.status()).toBe(200);
            expect(res2.status()).toBe(200);

            const list1 = await res1.json();
            const list2 = await res2.json();
            expect(list1.length).toBe(list2.length);
            expect(list1[0].id).toBe(list2[0].id);
        });
    });

    // ============================================================
    // 3. CREATE OUTRATE VIEW LOG: /api/api/employee-base-costs/log-view
    // ============================================================
    test.describe('3. API: Create Outrate View Log (POST /log-view)', () => {

        // --- Positive Test Cases ---
        test('OUT-POST-P01 to P08: Send valid request with action VIEWED_INDIVIDUAL -> Verify DB row insertion and principal email', async () => {
            const token = getAuthToken();
            const principalEmail = getJwtPrincipalEmail(token);
            const conn = await getDbConnection();

            const [beforeRows] = await conn.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const maxIdBefore = beforeRows[0].maxId || 0;

            const testViewerName = 'Dara Lakshmi Prasanna';
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: testViewerName,
                    action: 'VIEWED_INDIVIDUAL'
                }
            });

            expect(res.status()).toBe(200);
            const body = await res.json();
            expect(body).toEqual({ status: 'logged' });

            // Verify MySQL record
            const [afterRows] = await conn.execute(
                'SELECT id, viewer_name, viewer_email, action, timestamp FROM outrate_view_log WHERE id > ? ORDER BY id DESC LIMIT 1',
                [maxIdBefore]
            );

            expect(afterRows.length).toBe(1);
            const inserted = afterRows[0];
            expect(inserted.id).toBeGreaterThan(maxIdBefore);
            expect(inserted.viewer_name).toBe(testViewerName);
            expect(inserted.viewer_email.toLowerCase()).toBe(principalEmail.toLowerCase());
            expect(inserted.action).toBe('VIEWED_INDIVIDUAL');
            expect(inserted.timestamp).toBeTruthy();
        });

        test('OUT-POST-P02: Send valid request with action DOWNLOADED_ALL -> Verify DB row insertion', async () => {
            const token = getAuthToken();
            const principalEmail = getJwtPrincipalEmail(token);
            const conn = await getDbConnection();

            const [beforeRows] = await conn.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const maxIdBefore = beforeRows[0].maxId || 0;

            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: 'Dara Lakshmi Prasanna',
                    action: 'DOWNLOADED_ALL'
                }
            });

            expect(res.status()).toBe(200);
            const body = await res.json();
            expect(body).toEqual({ status: 'logged' });

            const [afterRows] = await conn.execute(
                'SELECT id, viewer_name, viewer_email, action FROM outrate_view_log WHERE id > ? ORDER BY id DESC LIMIT 1',
                [maxIdBefore]
            );

            expect(afterRows.length).toBe(1);
            expect(afterRows[0].action).toBe('DOWNLOADED_ALL');
            expect(afterRows[0].viewer_email.toLowerCase()).toBe(principalEmail.toLowerCase());
        });

        test('OUT-POST-P09 & P10: Verify new record appears at the top of GET /view-logs', async () => {
            const testUniqueViewer = `Auditor_${Date.now()}`;
            const api = await getApiContext();

            // 1. Log event
            const postRes = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: testUniqueViewer,
                    action: 'VIEWED_INDIVIDUAL'
                }
            });
            expect(postRes.status()).toBe(200);

            // 2. Fetch log list
            const getRes = await api.get('employee-base-costs/view-logs');
            expect(getRes.status()).toBe(200);
            const logs = await getRes.json();

            // Latest activity appears first
            expect(logs[0].viewerName).toBe(testUniqueViewer);
            expect(logs[0].action).toBe('VIEWED_INDIVIDUAL');
        });

        // --- Negative Test Cases ---
        test('OUT-POST-N01: Send request without an Authorization header -> HTTP 401', async () => {
            const unauth = await getUnauthContext();
            const res = await unauth.post('employee-base-costs/log-view', {
                data: { viewerName: 'Hacker', action: 'VIEWED_INDIVIDUAL' }
            });
            expect(res.status()).toBe(401);
            await unauth.dispose();
        });

        test('OUT-POST-N02, N03 & N04: Send request with invalid or tampered JWT -> HTTP 401', async () => {
            const tamperedCtx = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: { 'Authorization': 'Bearer bad_token_123' },
                ignoreHTTPSErrors: true
            });
            const res = await tamperedCtx.post('employee-base-costs/log-view', {
                data: { viewerName: 'Test', action: 'VIEWED_INDIVIDUAL' }
            });
            expect(res.status()).toBe(401);
            await tamperedCtx.dispose();
        });

        test('OUT-POST-N06: Send an unsupported action (INVALID_ACTION) -> HTTP 400', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: { viewerName: 'Test', action: 'INVALID_ACTION' }
            });
            expect(res.status()).toBe(400);
            const err = await res.json();
            expect(err.error).toContain('action must be VIEWED_INDIVIDUAL or DOWNLOADED_ALL');
        });

        test('OUT-POST-N07: Omit action -> HTTP 400', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: { viewerName: 'Test' }
            });
            expect(res.status()).toBe(400);
            const err = await res.json();
            expect(err.error).toContain('action must be VIEWED_INDIVIDUAL or DOWNLOADED_ALL');
        });

        test('OUT-POST-N08 & N09: Send empty or null action -> HTTP 400', async () => {
            const api = await getApiContext();

            const resEmpty = await api.post('employee-base-costs/log-view', {
                data: { viewerName: 'Test', action: '' }
            });
            expect(resEmpty.status()).toBe(400);

            const resNull = await api.post('employee-base-costs/log-view', {
                data: { viewerName: 'Test', action: null }
            });
            expect(resNull.status()).toBe(400);
        });

        test('OUT-POST-N10 & N11: Omit or send empty viewerName -> HTTP 400', async () => {
            const api = await getApiContext();

            const resOmit = await api.post('employee-base-costs/log-view', {
                data: { action: 'VIEWED_INDIVIDUAL' }
            });
            expect(resOmit.status()).toBe(400);
            const errOmit = await resOmit.json();
            expect(errOmit.error).toContain('viewerName is required');

            const resEmpty = await api.post('employee-base-costs/log-view', {
                data: { viewerName: '', action: 'VIEWED_INDIVIDUAL' }
            });
            expect(resEmpty.status()).toBe(400);
            const errEmpty = await resEmpty.json();
            expect(errEmpty.error).toContain('viewerName is required');
        });

        test('OUT-POST-N13: Send a request with an unsupported HTTP method (GET) -> HTTP 404', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/log-view');
            expect(res.status()).toBe(404);
        });

        test('OUT-POST-N15: Send a request with an incorrect endpoint path -> HTTP 405', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view-invalid-path', {
                data: { viewerName: 'Test', action: 'VIEWED_INDIVIDUAL' }
            });
            expect(res.status()).toBe(405);
        });

        // --- Edge Test Cases ---
        test('OUT-POST-E01: Send viewerName with leading/trailing spaces -> Handled safely', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: { viewerName: '   Spaced Viewer Name   ', action: 'VIEWED_INDIVIDUAL' }
            });
            expect(res.status()).toBe(200);
        });

        test('OUT-POST-E02 & E03: Send name containing apostrophes, hyphens, and Unicode characters -> Stored safely', async () => {
            const specialName = "O'Connor-Smith José Müller";
            const conn = await getDbConnection();
            const [beforeRows] = await conn.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const maxIdBefore = beforeRows[0].maxId || 0;

            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: { viewerName: specialName, action: 'VIEWED_INDIVIDUAL' }
            });
            expect(res.status()).toBe(200);

            const [afterRows] = await conn.execute(
                'SELECT viewer_name FROM outrate_view_log WHERE id > ? ORDER BY id DESC LIMIT 1',
                [maxIdBefore]
            );
            expect(afterRows.length).toBe(1);
            expect(afterRows[0].viewer_name).toBe(specialName);
        });

        test('OUT-POST-E07: Include a forged viewerEmail in request body -> Stored email remains authenticated JWT principal', async () => {
            const token = getAuthToken();
            const principalEmail = getJwtPrincipalEmail(token);
            const conn = await getDbConnection();

            const [beforeRows] = await conn.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const maxIdBefore = beforeRows[0].maxId || 0;

            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: 'Security Tester',
                    viewerEmail: 'spoofed_attacker@evil.com',
                    action: 'VIEWED_INDIVIDUAL'
                }
            });
            expect(res.status()).toBe(200);

            const [afterRows] = await conn.execute(
                'SELECT viewer_email FROM outrate_view_log WHERE id > ? ORDER BY id DESC LIMIT 1',
                [maxIdBefore]
            );
            expect(afterRows.length).toBe(1);
            expect(afterRows[0].viewer_email.toLowerCase()).toBe(principalEmail.toLowerCase());
            expect(afterRows[0].viewer_email).not.toBe('spoofed_attacker@evil.com');
        });

        test('OUT-POST-E08A: Include unrelated scalar extra field in request body -> Ignored and accepted with HTTP 200', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: 'Extra Field Tester',
                    action: 'VIEWED_INDIVIDUAL',
                    unrelatedNumber: 99999,
                    unrelatedString: 'arbitrary_metadata'
                }
            });
            expect(res.status()).toBe(200);
            const body = await res.json();
            expect(body).toEqual({ status: 'logged' });
        });

        test('OUT-POST-E08B: Include unmapped nested object in request body -> Rejected with HTTP 400', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: 'Extra Field Tester',
                    action: 'VIEWED_INDIVIDUAL',
                    unrelatedObject: { nested: 'value' }
                }
            });
            expect(res.status()).toBe(400);
        });

        test('OUT-POST-E10: Send several valid requests sequentially -> Each accepted event is recorded correctly', async () => {
            const conn = await getDbConnection();
            const [beforeRows] = await conn.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const maxIdBefore = beforeRows[0].maxId || 0;
            const seqTag = `Seq_${Date.now()}`;

            const api = await getApiContext();
            await api.post('employee-base-costs/log-view', { data: { viewerName: `${seqTag}_1`, action: 'VIEWED_INDIVIDUAL' } });
            await api.post('employee-base-costs/log-view', { data: { viewerName: `${seqTag}_2`, action: 'DOWNLOADED_ALL' } });
            await api.post('employee-base-costs/log-view', { data: { viewerName: `${seqTag}_3`, action: 'VIEWED_INDIVIDUAL' } });

            const [afterRows] = await conn.execute(
                'SELECT id FROM outrate_view_log WHERE id > ? AND viewer_name LIKE ?',
                [maxIdBefore, `${seqTag}%`]
            );
            expect(afterRows.length).toBe(3);
        });

        test('OUT-POST-E13: Send action with a very long string -> Validation rejects unsupported value with 400', async () => {
            const longAction = 'ACTION_'.repeat(50);
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: { viewerName: 'Tester', action: longAction }
            });
            expect(res.status()).toBe(400);
        });

        test('OUT-POST-E15: Send SQL-injection-like text in viewerName -> Safely escaped and stored without SQL execution', async () => {
            const sqlPayload = "Robert'); DROP TABLE outrate_view_log;--";
            const conn = await getDbConnection();
            const [beforeRows] = await conn.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const maxIdBefore = beforeRows[0].maxId || 0;

            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: { viewerName: sqlPayload, action: 'VIEWED_INDIVIDUAL' }
            });
            expect(res.status()).toBe(200);

            // Verify table still exists and payload is stored literally
            const [afterRows] = await conn.execute(
                'SELECT viewer_name FROM outrate_view_log WHERE id > ? ORDER BY id DESC LIMIT 1',
                [maxIdBefore]
            );
            expect(afterRows.length).toBe(1);
            expect(afterRows[0].viewer_name).toBe(sqlPayload);
        });
    });

    // ============================================================
    // 4. CROSS-API INTEGRATION TEST CASES
    // ============================================================
    test.describe('4. Cross-API Integration & Security Reconciliation', () => {

        test('OUT-INT-P01: Call /me and verify returned viewer name matches emp_details, then use in POST /log-view', async () => {
            const api = await getApiContext();

            // 1. Fetch Admin's viewer name via GET /me
            const meRes = await api.get('employee-base-costs/me');
            expect(meRes.status()).toBe(200);
            const meJson = await meRes.json();
            const viewerName = meJson.fullName;
            expect(viewerName).toBeTruthy();

            // 2. Use viewerName in POST /log-view
            const logRes = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: viewerName,
                    action: 'VIEWED_INDIVIDUAL'
                }
            });
            expect(logRes.status()).toBe(200);
        });

        test('OUT-INT-P02, P03 & P04: POST event, GET /view-logs, and compare against MySQL row for 1-to-1 consistency', async () => {
            const testName = `Integration_Tester_${Date.now()}`;
            const token = getAuthToken();
            const principalEmail = getJwtPrincipalEmail(token);
            const conn = await getDbConnection();

            const api = await getApiContext();

            // 1. POST DOWNLOADED_ALL
            const postRes = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: testName,
                    action: 'DOWNLOADED_ALL'
                }
            });
            expect(postRes.status()).toBe(200);

            // 2. GET /view-logs
            const getRes = await api.get('employee-base-costs/view-logs');
            expect(getRes.status()).toBe(200);
            const logs = await getRes.json();
            const apiLatest = logs[0];

            // 3. MySQL DB row query
            const [dbRows] = await conn.execute(
                'SELECT id, viewer_name, viewer_email, action FROM outrate_view_log ORDER BY id DESC LIMIT 1'
            );
            expect(dbRows.length).toBe(1);
            const dbLatest = dbRows[0];

            // 4. Cross-validate consistency across POST, GET, and DB
            expect(apiLatest.id).toBe(dbLatest.id);
            expect(apiLatest.viewerName).toBe(testName);
            expect(dbLatest.viewer_name).toBe(testName);
            expect(apiLatest.action).toBe('DOWNLOADED_ALL');
            expect(dbLatest.action).toBe('DOWNLOADED_ALL');
            expect(apiLatest.viewerEmail.toLowerCase()).toBe(principalEmail.toLowerCase());
            expect(dbLatest.viewer_email.toLowerCase()).toBe(principalEmail.toLowerCase());
        });

        test('OUT-INT-N01: Send POST without authentication -> Rejected with 401 and creates zero records in DB', async () => {
            const conn = await getDbConnection();
            const [beforeCount] = await conn.execute('SELECT COUNT(*) AS total FROM outrate_view_log');

            const unauth = await getUnauthContext();
            const res = await unauth.post('employee-base-costs/log-view', {
                data: { viewerName: 'Anonymous Attacker', action: 'VIEWED_INDIVIDUAL' }
            });
            expect(res.status()).toBe(401);

            const [afterCount] = await conn.execute('SELECT COUNT(*) AS total FROM outrate_view_log');
            expect(afterCount[0].total).toBe(beforeCount[0].total);
            await unauth.dispose();
        });

        test('OUT-INT-N02: Submit invalid action -> Validation fails with 400 and creates zero records in DB', async () => {
            const conn = await getDbConnection();
            const [beforeCount] = await conn.execute('SELECT COUNT(*) AS total FROM outrate_view_log');

            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: { viewerName: 'Tester', action: 'FORBIDDEN_ACTION_NAME' }
            });
            expect(res.status()).toBe(400);

            const [afterCount] = await conn.execute('SELECT COUNT(*) AS total FROM outrate_view_log');
            expect(afterCount[0].total).toBe(beforeCount[0].total);
        });
    });
});
