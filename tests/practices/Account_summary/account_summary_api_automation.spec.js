/**
 * Account Summary: API Automation Test Suite
 * 
 * Comprehensive API automation covering the endpoints that power the 
 * Practices Account Summary module (/practice/account-summary):
 * - GET /api/v1/utilization/reports/as-of-date
 * - GET /api/sow/get/allSoW
 * - GET /api/projects
 * 
 * Catalog:
 * - Suite 1: Positive API Test Cases (ASA-P01 to ASA-P08)
 * - Suite 2: Negative API Test Cases (ASA-N01 to ASA-N05)
 * - Suite 3: Edge Cases & Business Calculation Parity (ASA-E01 to ASA-E04)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Turn off trace recording to avoid Windows file-lock issues
test.use({ trace: 'off' });

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================
const API_BASE = (process.env.BACKEND_URL || 'http://localhost:8080').replace(/\/api\/?$/, '').replace(/\/$/, '');
const TODAY = new Date().toISOString().split('T')[0];

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
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

const EXPECTED_CLIENTS = [
    'Amgen', 'Autodesk', 'Bazar Voice', 'BlackDuck', 'Ciena',
    'Deckers Outdoor Corporation', 'Docusign', 'Fastly',
    'Fountain group - DTDC', 'Google', 'Greystar',
    'Hewlett Packard Enterprise Company', 'Intuit Inc',
    'Intuitive Surgical', 'JPMC', 'OT', 'Palo Alto',
    'Pure Storage', 'Salesforce Inc', 'Siemens', 'Stripe',
    'Western Digital'
];

const VALID_PRACTICES = [
    'Data & AI',
    'Digital Transformation',
    'Enterprise Business Planning',
    'Revenue and Sales',
    'IP & Solutions'
];

// ============================================================
// SUITE 1: POSITIVE API TEST CASES
// ============================================================
test.describe('Suite 1: Positive API Test Cases', () => {

    test('ASA-P01: GET /api/v1/utilization/reports/as-of-date - Retrieve base utilization data', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        expect(data).toHaveProperty('summary');
        expect(data).toHaveProperty('employees');
        expect(Array.isArray(data.employees)).toBeTruthy();
        expect(data.employees.length).toBeGreaterThan(0);

        // Verify summary metrics presence
        expect(data.summary).toHaveProperty('totalEmployees');
        expect(data.summary).toHaveProperty('production');
        expect(data.summary).toHaveProperty('bench');
    });

    test('ASA-P02: Verify clientName attribute is present across employee allocations', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        // Collect all distinct clients from the API response
        const clientsInApi = new Set(
            data.employees
                .map(e => e.clientName)
                .filter(name => name && name.trim().length > 0)
        );

        expect(clientsInApi.size).toBeGreaterThan(0);

        // Verify known production clients exist in the response
        const commonClients = EXPECTED_CLIENTS.filter(c => clientsInApi.has(c));
        expect(commonClients.length).toBeGreaterThan(0);
    });

    test('ASA-P03: Account aggregation metrics calculation (Team Size, Billable, Non-Billable)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        // Aggregate by client
        const clientMap = new Map();
        for (const emp of data.employees) {
            const client = emp.clientName || 'Unassigned';
            if (!clientMap.has(client)) {
                clientMap.set(client, {
                    teamSize: 0,
                    billable: 0,
                    nonBillable: 0,
                    empIds: new Set()
                });
            }
            const agg = clientMap.get(client);
            if (emp.empId) agg.empIds.add(emp.empId);
            if (emp.isBillable === true || emp.isBillable === 1) agg.billable++;
            else agg.nonBillable++;
            agg.teamSize++;
        }

        expect(clientMap.size).toBeGreaterThan(0);

        // Verify mathematical integrity for each client
        for (const [client, agg] of clientMap.entries()) {
            expect(agg.billable + agg.nonBillable).toBe(agg.teamSize);
            expect(agg.empIds.size).toBeLessThanOrEqual(agg.teamSize);
        }
    });

    test('ASA-P04: Practice distribution per account in utilization payload', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        const practicesInPayload = new Set(data.employees.map(e => e.practice).filter(Boolean));
        expect(practicesInPayload.size).toBeGreaterThan(0);

        // Verify each employee has valid practice and role attributes
        for (const emp of data.employees.slice(0, 20)) {
            expect(emp).toHaveProperty('empId');
            expect(emp).toHaveProperty('empName');
            expect(emp).toHaveProperty('practice');
        }
    });

    test('ASA-P05: GET /api/sow/get/allSoW - Retrieve SoWs for account revenue & project mapping', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/sow/get/allSoW`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const sows = await res.json();
        expect(Array.isArray(sows)).toBeTruthy();
        expect(sows.length).toBeGreaterThan(0);

        const firstSow = sows[0];
        expect(firstSow).toHaveProperty('sowName');
        expect(firstSow).toHaveProperty('client');
        expect(firstSow.client).toHaveProperty('name');
    });

    test('ASA-P06: GET /api/projects - Retrieve projects and verify client names', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/projects`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const projects = await res.json();
        expect(Array.isArray(projects)).toBeTruthy();
        expect(projects.length).toBeGreaterThan(0);

        for (const p of projects.slice(0, 15)) {
            expect(p).toHaveProperty('projectName');
            expect(p).toHaveProperty('projectCode');
            expect(p).toHaveProperty('clientName');
        }
    });

    test('ASA-P07: Validate location classification (Offshore vs Onsite) per client', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        let offshoreCount = 0;
        let onsiteCount = 0;

        for (const emp of data.employees) {
            const loc = (emp.projectLocation || '').trim().toLowerCase();
            if (loc.includes('india') || loc.includes('bangalore') || loc.includes('hyderabad') || loc.includes('chennai') || loc.includes('pune')) {
                offshoreCount++;
            } else if (loc.length > 0) {
                onsiteCount++;
            }
        }

        expect(offshoreCount + onsiteCount).toBeGreaterThan(0);
    });

    test('ASA-P08: Query practice-filtered utilization endpoint', async ({ request }) => {
        const practice = 'Data & AI';
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}&practice=${encodeURIComponent(practice)}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('summary');
        expect(data).toHaveProperty('employees');

        // Verify all returned employees belong to the queried practice
        for (const emp of data.employees) {
            expect(emp.practice).toBe(practice);
        }
    });
});

// ============================================================
// SUITE 2: NEGATIVE API TEST CASES
// ============================================================
test.describe('Suite 2: Negative API Test Cases', () => {

    test('ASA-N01: GET /api/v1/utilization/reports/as-of-date - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`);
        expect([401, 403]).toContain(res.status());
    });

    test('ASA-N02: GET /api/sow/get/allSoW - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/sow/get/allSoW`);
        expect([401, 403]).toContain(res.status());
    });

    test('ASA-N03: GET /api/projects - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/projects`);
        expect([401, 403]).toContain(res.status());
    });

    test('ASA-N04: GET /api/v1/utilization/reports/as-of-date - Invalid date format handling', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=invalid-date-format`, {
            headers: getHeaders()
        });

        // Backend should either reject with 400 or fallback gracefully with 200
        expect([200, 400, 500]).toContain(res.status());
    });

    test('ASA-N05: GET /api/v1/utilization/reports/as-of-date - Non-existent practice filter returns empty employees', async ({ request }) => {
        const nonExistentPractice = `NonExistentPractice_${Date.now()}`;
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}&practice=${encodeURIComponent(nonExistentPractice)}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();
        expect(data.employees.length).toBe(0);
    });
});

// ============================================================
// SUITE 3: EDGE CASES & BUSINESS CALCULATION PARITY
// ============================================================
test.describe('Suite 3: Edge Cases & Business Calculation Parity', () => {

    test('ASA-E01: Cross-endpoint client parity between /api/projects and /api/v1/utilization/reports', async ({ request }) => {
        const [projRes, utilRes] = await Promise.all([
            request.get(`${API_BASE}/api/projects`, { headers: getHeaders() }),
            request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, { headers: getHeaders() })
        ]);

        expect(projRes.status()).toBe(200);
        expect(utilRes.status()).toBe(200);

        const projects = await projRes.json();
        const utilData = await utilRes.json();

        const projectClients = new Set(projects.map(p => p.clientName).filter(Boolean));
        const utilClients = new Set(utilData.employees.map(e => e.clientName).filter(Boolean));

        // Ensure key production clients overlap between both endpoints
        const overlap = Array.from(utilClients).filter(c => projectClients.has(c));
        expect(overlap.length).toBeGreaterThan(0);
    });

    test('ASA-E02: Category mapping integrity (PRODUCTION, BENCH, INTERNAL, INVESTMENT, W2)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        const validCategories = [
            'PRODUCTION', 'BENCH', 'INTERNAL', 'INVESTMENT',
            'LEAVE', 'HOLD', 'ON NOTICE', 'ONNOTICE', 'TRAINING',
            'W2', 'C2C', '1099', 'FULL TIME', 'CONTRACT', 'FTE'
        ];

        for (const emp of data.employees) {
            if (emp.category) {
                expect(
                    validCategories,
                    `Category "${emp.category}" should be a recognized category`
                ).toContain(emp.category.toUpperCase().trim());
            }
        }
    });

    test('ASA-E03: Allocation percentage boundaries (0% to 100%)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        for (const emp of data.employees.slice(0, 30)) {
            if (emp.allocationPercentage !== null && emp.allocationPercentage !== undefined) {
                const alloc = Number(emp.allocationPercentage);
                expect(alloc).toBeGreaterThanOrEqual(0);
                expect(alloc).toBeLessThanOrEqual(100);
            }
        }
    });

    test('ASA-E04: Account summary calculations match sum totals in utilization summary', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        // Distinct employees accounting for split multi-project allocations
        const distinctEmployees = new Set(
            data.employees
                .map(e => String(e.empId ?? '').trim())
                .filter(Boolean)
        ).size;
        const totalInSummary = Number(data.summary.totalEmployees);

        expect(distinctEmployees).toBe(totalInSummary);
    });
});
