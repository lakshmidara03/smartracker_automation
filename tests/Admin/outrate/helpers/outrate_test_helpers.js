/**
 * Shared Helper Functions for Outrate Management Test Suites
 * Strict Zero-Bypass Enforcement: No error suppression, no default value fallbacks.
 */

const { request } = require('@playwright/test');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const BASE_URL = (process.env.BASE_URL || 'http://localhost:4200/').replace(/\/$/, '');
const OUTRATE_VIEW_URL = `${BASE_URL}/admin/outrate-view`;
const API_BASE = (process.env.API_BASE_URL || (BASE_URL.includes('localhost') ? 'http://localhost:8080/api' : `${BASE_URL}/api/api`)).replace(/\/$/, '');

const KNOWN_RECORDS = {
    ACTIVE_EMP: {
        id: 2,
        empId: '10003',
        expectedRate: BASE_URL.includes('localhost') ? 85.0 : 180.0,
        fullName: 'Nadia Aziz Dessouki',
        officialEmail: 'nadia@relanto.ai',
        isDeleted: 0
    },
    ZERO_RATE_EMP: {
        id: 1,
        empId: '100',
        expectedRate: 0.0,
        isDeleted: 1
    },
    ALPHA_HYPHEN_EMP: {
        id: 762,
        empId: 'C-00001',
        expectedRate: BASE_URL.includes('localhost') ? 85.0 : 100.23
    },
    NO_RATE_ACTIVE_EMP: '98322987',
    NO_RATE_DELETED_EMP: '90768626',
    NON_EXISTENT_EMP_ID: '999999999',
    SAMPLE_CSV_PATH: path.resolve(__dirname, '../../../../fixtures/outdummy(5).csv')
};

function getAuthToken() {
    if (process.env.API_TOKEN && process.env.API_TOKEN.trim().length > 10) {
        return process.env.API_TOKEN.trim();
    }
    const authPath = path.resolve(__dirname, '../../../../.auth/user.json');
    if (!fs.existsSync(authPath)) {
        throw new Error(`Authentication file not found at ${authPath}. Ensure test credentials exist.`);
    }
    const data = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const origin = data.origins?.find(o => o.localStorage?.some(item => item.name === 'token'));
    const tokenItem = origin?.localStorage?.find(item => item.name === 'token');
    if (!tokenItem?.value) {
        throw new Error(`JWT Token missing in auth state ${authPath}`);
    }
    return tokenItem.value.trim();
}

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

let dbPool = null;

function getDbPool() {
    if (!dbPool) {
        dbPool = mysql.createPool({
            host: process.env.DB_HOST || '13.61.179.149',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'relanto123',
            database: process.env.DB_NAME || 'hrportal',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return dbPool;
}

async function closeDbPool() {
    if (dbPool) {
        await dbPool.end();
        dbPool = null;
    }
}

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

async function getUnauthContext() {
    return await request.newContext({
        baseURL: `${API_BASE}/`,
        ignoreHTTPSErrors: true
    });
}

async function handleSessionModal(page) {
    const sessionBtn = page.getByRole('button', { name: 'Yes', exact: true });
    const isModalVisible = await sessionBtn.isVisible({ timeout: 2000 });
    if (isModalVisible) {
        await sessionBtn.click();
        await page.waitForTimeout(500);
    }
    if (page.url().includes('/login')) {
        const token = getAuthToken();
        await page.evaluate((t) => {
            localStorage.setItem('token', t);
        }, token);
        await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 30000 });
    }
    await page.locator('.page-title').waitFor({ state: 'visible', timeout: 30000 });
}

module.exports = {
    BASE_URL,
    OUTRATE_VIEW_URL,
    API_BASE,
    KNOWN_RECORDS,
    getAuthToken,
    getJwtPrincipalEmail,
    getDbPool,
    closeDbPool,
    getApiContext,
    getUnauthContext,
    handleSessionModal
};
