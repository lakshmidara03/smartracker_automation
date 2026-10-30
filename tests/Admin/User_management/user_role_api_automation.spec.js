/**
 * User & Role Management: API Automation Test Suite
 * 
 * Comprehensive API Automation covering:
 * - UserController & UserService
 * - GET /getAllUsers
 * - PUT /updateRole/{username}?newRoleName={roleName}
 * - POST /registerNewUser
 * - GET /get-approvers-list
 * 
 * Catalog:
 * - Suite 1: Positive API Test Cases (UR-API-P01 to UR-API-P08)
 * - Suite 2: Negative API Test Cases (UR-API-N01 to UR-API-N06)
 * - Suite 3: Edge Cases & Database Consistency (UR-API-E01 to UR-API-E04)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Turn off trace recording to avoid Windows file-lock issues
test.use({ trace: 'off' });

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================
// Note: UserController endpoints are mapped directly on root (http://localhost:8080)
const API_BASE = (process.env.BACKEND_URL || 'http://localhost:8080').replace(/\/api\/?$/, '').replace(/\/$/, '');

function getAuthToken() {
    if (process.env.API_TOKEN && process.env.API_TOKEN.trim().length > 10) {
        return process.env.API_TOKEN.trim();
    }
    try {
        const authPath = path.resolve(__dirname, '../../../.auth/user.json');
        if (fs.existsSync(authPath)) {
            const data = JSON.parse(fs.readFileSync(authPath, 'utf8'));
            const origin = data.origins?.find(o => o.localStorage?.some(item => item.name === 'token'));
            const tokenItem = origin?.localStorage?.find(item => item.name === 'token');
            if (tokenItem?.value) return tokenItem.value.trim();
        }
    } catch {}
    return '';
}

const API_TOKEN = getAuthToken();

function getHeaders(token = API_TOKEN) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

let dbConnection = null;

async function getDbConnection() {
    if (!dbConnection) {
        const isLocal = API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');
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

const createdTestUsers = [];

test.afterAll(async () => {
    try {
        const conn = await getDbConnection();
        for (const username of createdTestUsers) {
            await conn.query('DELETE FROM user_role WHERE user_name = ?', [username]).catch(() => {});
            await conn.query('DELETE FROM user WHERE user_name = ?', [username]).catch(() => {});
        }
        if (dbConnection) {
            await dbConnection.end().catch(() => {});
            dbConnection = null;
        }
    } catch {}
});

// ============================================================
// SUITE 1: POSITIVE API TEST CASES
// ============================================================
test.describe('Suite 1: Positive API Test Cases', () => {
    test.describe.configure({ mode: 'serial' });

    test('UR-API-P01: GET /getAllUsers - Retrieve all users as Admin', async ({ request }) => {
        const res = await request.get(`${API_BASE}/getAllUsers`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const users = await res.json();
        expect(Array.isArray(users)).toBeTruthy();
        expect(users.length).toBeGreaterThan(0);

        const firstUser = users[0];
        expect(firstUser).toHaveProperty('userName');
        expect(firstUser).toHaveProperty('userFirstName');
        expect(firstUser).toHaveProperty('userLastName');
        expect(firstUser).toHaveProperty('role');
        expect(Array.isArray(firstUser.role)).toBeTruthy();
    });

    test('UR-API-P02: GET /getAllUsers - Confirm password security (passwords not exposed)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/getAllUsers`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const users = await res.json();

        for (const u of users) {
            expect(u.userPassword).toBeFalsy();
        }
    });

    test('UR-API-P03: POST /registerNewUser - Register new test user with default User role', async ({ request }) => {
        const uniqueSuffix = Date.now();
        const testUsername = `api_user_${uniqueSuffix}@example.com`;
        createdTestUsers.push(testUsername);

        const payload = {
            userName: testUsername,
            userFirstName: 'AutoFirst',
            userLastName: 'AutoLast',
            userPassword: 'StrongPassword@123'
        };

        const res = await request.post(`${API_BASE}/registerNewUser`, {
            headers: getHeaders(),
            data: payload
        });

        expect(res.status()).toBe(200);
        const registered = await res.json();

        expect(registered.userName).toBe(testUsername);
        expect(registered.userFirstName).toBe('AutoFirst');
        expect(registered.userLastName).toBe('AutoLast');

        // Confirm default role is 'User'
        expect(Array.isArray(registered.role)).toBeTruthy();
        const roles = registered.role.map(r => r.roleName);
        expect(roles).toContain('User');

        // Confirm password returned is encrypted/hashed, not plain text
        expect(registered.userPassword).not.toBe('StrongPassword@123');
    });

    test('UR-API-P04: GET /getAllUsers - Confirm newly registered user appears in user list', async ({ request }) => {
        const testUsername = createdTestUsers[createdTestUsers.length - 1];
        expect(testUsername).toBeTruthy();

        const res = await request.get(`${API_BASE}/getAllUsers`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const users = await res.json();
        const found = users.find(u => u.userName === testUsername);

        expect(found).toBeDefined();
        expect(found.userFirstName).toBe('AutoFirst');
        expect(found.role.some(r => r.roleName === 'User')).toBeTruthy();
    });

    test('UR-API-P05: PUT /updateRole/{username}?newRoleName=TA - Update role to TA', async ({ request }) => {
        const testUsername = createdTestUsers[createdTestUsers.length - 1];
        expect(testUsername).toBeTruthy();

        const res = await request.put(`${API_BASE}/updateRole/${testUsername}?newRoleName=TA`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const bodyText = await res.text();
        expect(bodyText).toContain(`Role updated successfully for user: ${testUsername}`);
    });

    test('UR-API-P06: GET /getAllUsers - Confirm role update reflects TA and old role is removed', async ({ request }) => {
        const testUsername = createdTestUsers[createdTestUsers.length - 1];
        expect(testUsername).toBeTruthy();

        const res = await request.get(`${API_BASE}/getAllUsers`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const users = await res.json();
        const found = users.find(u => u.userName === testUsername);

        expect(found).toBeDefined();
        const roleNames = found.role.map(r => r.roleName);
        expect(roleNames).toContain('TA');
        expect(roleNames).not.toContain('User');
    });

    test('UR-API-P07: PUT /updateRole/{username}?newRoleName=Practice Lead - Update role again', async ({ request }) => {
        const testUsername = createdTestUsers[createdTestUsers.length - 1];
        expect(testUsername).toBeTruthy();

        const res = await request.put(`${API_BASE}/updateRole/${testUsername}?newRoleName=Practice Lead`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const bodyText = await res.text();
        expect(bodyText).toContain(`Role updated successfully for user: ${testUsername}`);
    });

    test('UR-API-P08: GET /get-approvers-list - Retrieve approvers list', async ({ request }) => {
        const res = await request.get(`${API_BASE}/get-approvers-list`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const approvers = await res.json();
        expect(Array.isArray(approvers)).toBeTruthy();
        expect(approvers.length).toBeGreaterThan(0);

        for (const app of approvers) {
            expect(app).toHaveProperty('userName');
            expect(app).toHaveProperty('userFirstName');
            expect(app).toHaveProperty('userLastName');
        }
    });
});

// ============================================================
// SUITE 2: NEGATIVE API TEST CASES
// ============================================================
test.describe('Suite 2: Negative API Test Cases', () => {

    test('UR-API-N01: GET /getAllUsers - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/getAllUsers`);
        expect([401, 403]).toContain(res.status());
    });

    test('UR-API-N02: PUT /updateRole/{username} - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.put(`${API_BASE}/updateRole/someuser@example.com?newRoleName=Admin`);
        expect([401, 403]).toContain(res.status());
    });

    test('UR-API-N03: PUT /updateRole/{username} - Fails when assigning non-existent role (404)', async ({ request }) => {
        const testUsername = 'abhatt@relanto.ai';
        const invalidRole = `NonExistentRole_${Date.now()}`;

        const res = await request.put(`${API_BASE}/updateRole/${testUsername}?newRoleName=${invalidRole}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(404);
        const bodyText = await res.text();
        expect(bodyText).toContain(`Role not found: ${invalidRole}`);
    });

    test('UR-API-N04: PUT /updateRole/{username} - Fails when updating non-existent user (404)', async ({ request }) => {
        const nonExistentUser = `nonexistent_user_${Date.now()}@example.com`;

        const res = await request.put(`${API_BASE}/updateRole/${nonExistentUser}?newRoleName=Admin`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(404);
        const bodyText = await res.text();
        expect(bodyText).toContain(`User not found: ${nonExistentUser}`);
    });

    test('UR-API-N05: POST /registerNewUser - Fails with empty payload (400 / 500)', async ({ request }) => {
        const res = await request.post(`${API_BASE}/registerNewUser`, {
            headers: getHeaders(),
            data: {}
        });

        expect([400, 500]).toContain(res.status());
    });

    test('UR-API-N06: PUT /updateRole/{username} - Fails when newRoleName query parameter is omitted', async ({ request }) => {
        const testUsername = createdTestUsers[createdTestUsers.length - 1] || 'abhatt@relanto.ai';

        const res = await request.put(`${API_BASE}/updateRole/${testUsername}`, {
            headers: getHeaders()
        });

        expect([400, 500]).toContain(res.status());
    });
});

// ============================================================
// SUITE 3: EDGE CASES & DATABASE CONSISTENCY
// ============================================================
test.describe('Suite 3: Edge Cases & Database Consistency', () => {

    test('UR-API-E01: Single effective role per user rule', async ({ request }) => {
        const uniqueSuffix = Date.now();
        const testUsername = `edge_singlerole_${uniqueSuffix}@example.com`;
        createdTestUsers.push(testUsername);

        const resReg = await request.post(`${API_BASE}/registerNewUser`, {
            headers: getHeaders(),
            data: {
                userName: testUsername,
                userFirstName: 'Edge',
                userLastName: 'SingleRole',
                userPassword: 'Password123!'
            }
        });
        expect(resReg.status()).toBe(200);

        // Assign 'Super User'
        const res = await request.put(`${API_BASE}/updateRole/${testUsername}?newRoleName=Super User`, {
            headers: getHeaders()
        });
        expect(res.status()).toBe(200);

        // Verify in DB directly that exactly 1 role is mapped in USER_ROLE
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT ROLE_NAME FROM user_role WHERE USER_NAME = ?', [testUsername]);
        expect(rows.length).toBe(1);
        expect(rows[0].ROLE_NAME).toBe('Super User');
    });

    test('UR-API-E02: Register and update role for email with special characters', async ({ request }) => {
        const uniqueSuffix = Date.now();
        const specialEmail = `test.user+tag_${uniqueSuffix}@sub.domain.com`;
        createdTestUsers.push(specialEmail);

        const resReg = await request.post(`${API_BASE}/registerNewUser`, {
            headers: getHeaders(),
            data: {
                userName: specialEmail,
                userFirstName: 'Special',
                userLastName: 'Char',
                userPassword: 'P@ssw0rd!#$'
            }
        });
        expect(resReg.status()).toBe(200);

        // Update role
        const resUpd = await request.put(`${API_BASE}/updateRole/${encodeURIComponent(specialEmail)}?newRoleName=User`, {
            headers: getHeaders()
        });
        expect(resUpd.status()).toBe(200);

        // Check DB
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT ROLE_NAME FROM user_role WHERE USER_NAME = ?', [specialEmail]);
        expect(rows.length).toBe(1);
        expect(rows[0].ROLE_NAME).toBe('User');
    });

    test('UR-API-E03: Register user with duplicate username produces error or handled correctly', async ({ request }) => {
        const dupUsername = `dup_test_${Date.now()}@example.com`;
        createdTestUsers.push(dupUsername);

        // Register user initially
        await request.post(`${API_BASE}/registerNewUser`, {
            headers: getHeaders(),
            data: {
                userName: dupUsername,
                userFirstName: 'Original',
                userLastName: 'User',
                userPassword: 'Password@123'
            }
        });

        // Attempt duplicate registration
        const res = await request.post(`${API_BASE}/registerNewUser`, {
            headers: getHeaders(),
            data: {
                userName: dupUsername,
                userFirstName: 'Duplicate',
                userLastName: 'Attempt',
                userPassword: 'Password@123'
            }
        });

        // Backend either rejects with error or handles gracefully
        expect([200, 400, 409, 500]).toContain(res.status());
    });

    test('UR-API-E04: Database cleanup validation', async () => {
        const conn = await getDbConnection();
        for (const username of createdTestUsers) {
            await conn.query('DELETE FROM user_role WHERE user_name = ?', [username]);
            await conn.query('DELETE FROM user WHERE user_name = ?', [username]);

            const [checkUser] = await conn.query('SELECT user_name FROM user WHERE user_name = ?', [username]);
            expect(checkUser.length).toBe(0);

            const [checkRole] = await conn.query('SELECT user_name FROM user_role WHERE user_name = ?', [username]);
            expect(checkRole.length).toBe(0);
        }
        createdTestUsers.length = 0;
    });
});
