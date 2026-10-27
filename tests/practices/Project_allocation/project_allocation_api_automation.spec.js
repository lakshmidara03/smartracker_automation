/**
 * Project Allocations: API Automation Test Suite
 * 
 * Comprehensive API automation covering the complete backend data pipeline 
 * that powers the Project Allocations dashboard (/practice/project-allocations):
 * - GET /api/clients
 * - GET /api/projects
 * - GET /api/v1/utilization/reports/as-of-date
 * - GET /api/project-practice
 * - GET /api/sow/get/allSoW
 * - GET /api/project-sow/mappings
 * - GET /api/resource/get/allEmployeeSoWdata
 * - GET /api/margin/total-revenue
 * - GET /api/margin/project/{projectId}
 * 
 * Catalog:
 * - Suite 1: Positive API Test Cases (PAA-P01 to PAA-P10)
 * - Suite 2: Negative API Test Cases (PAA-N01 to PAA-N06)
 * - Suite 3: Edge Cases & Relational Integrity (PAA-E01 to PAA-E04)
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
    } catch { }
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

// ============================================================
// SUITE 1: POSITIVE API TEST CASES
// ============================================================
test.describe('Suite 1: Positive API Test Cases', () => {

    test('PAA-P01: GET /api/clients - Retrieve client accounts for filter dropdown', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/clients`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const clients = await res.json();
        expect(Array.isArray(clients)).toBeTruthy();
        expect(clients.length).toBeGreaterThan(0);

        const firstClient = clients[0];
        expect(firstClient).toHaveProperty('id');
        expect(firstClient).toHaveProperty('name');
        expect(typeof firstClient.name).toBe('string');
    });

    test('PAA-P02: GET /api/projects - Retrieve project list for project hierarchy & filter', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/projects`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const projects = await res.json();
        expect(Array.isArray(projects)).toBeTruthy();
        expect(projects.length).toBeGreaterThan(0);

        const sample = projects[0];
        expect(sample).toHaveProperty('id');
        expect(sample).toHaveProperty('projectCode');
        expect(sample).toHaveProperty('projectName');
        expect(sample).toHaveProperty('clientName');
        expect(sample).toHaveProperty('projectType');
    });

    test('PAA-P03: GET /api/v1/utilization/reports/as-of-date - Base resource allocations', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('summary');
        expect(data).toHaveProperty('employees');
        expect(Array.isArray(data.employees)).toBeTruthy();
        expect(data.employees.length).toBeGreaterThan(0);

        // Assert summary counters used by KPI cards
        expect(data.summary).toHaveProperty('totalEmployees');
        expect(data.summary).toHaveProperty('production');
        expect(data.summary).toHaveProperty('bench');
        expect(data.summary).toHaveProperty('utilizationPercentage');
    });

    test('PAA-P04: Verify Team Size and Production vs Non-Production calculations', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const data = await res.json();

        let prodAllocationCount = 0;
        let nonProdAllocationCount = 0;
        const uniqueProdEmpIds = new Set();

        for (const emp of data.employees) {
            const engType = (emp.engagementType || '').toUpperCase().trim();
            if (engType === 'PRODUCTION') {
                prodAllocationCount++;
                if (emp.empId) uniqueProdEmpIds.add(emp.empId);
            } else {
                nonProdAllocationCount++;
            }
        }

        expect(prodAllocationCount + nonProdAllocationCount).toBe(data.employees.length);
        expect(prodAllocationCount).toBeGreaterThan(0);
        expect(uniqueProdEmpIds.size).toBe(data.summary.production);
    });



    test('PAA-P05: Verify Offshore and Onsite distribution calculation', async ({ request }) => {
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

        expect(offshoreCount).toBeGreaterThan(0);
        expect(onsiteCount).toBeGreaterThan(0);
    });

    test('PAA-P06: GET /api/project-practice - Retrieve practice mappings for projects', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/project-practice`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const practices = await res.json();
        expect(Array.isArray(practices)).toBeTruthy();
        expect(practices.length).toBeGreaterThan(0);

        const first = practices[0];
        expect(first).toHaveProperty('id');
        expect(first).toHaveProperty('project');
        expect(first).toHaveProperty('practice');
    });

    test('PAA-P07: GET /api/sow/get/allSoW - Retrieve SoWs for nested project hierarchy', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/sow/get/allSoW`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const sows = await res.json();
        expect(Array.isArray(sows)).toBeTruthy();
        expect(sows.length).toBeGreaterThan(0);

        const sampleSow = sows[0];
        expect(sampleSow).toHaveProperty('sowId');
        expect(sampleSow).toHaveProperty('sowName');
        expect(sampleSow).toHaveProperty('sowStatus');
    });

    test('PAA-P08: GET /api/project-sow/mappings - Retrieve project-to-SoW relational mappings', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/project-sow/mappings`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const mappings = await res.json();
        expect(Array.isArray(mappings)).toBeTruthy();
        expect(mappings.length).toBeGreaterThan(0);

        const mapping = mappings[0];
        expect(mapping).toHaveProperty('id');
        expect(mapping).toHaveProperty('projectId');
        expect(mapping).toHaveProperty('sowId');
    });

    test('PAA-P09: GET /api/resource/get/allEmployeeSoWdata - Retrieve allocated resource rates and days', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/resource/get/allEmployeeSoWdata`, {
            headers: getHeaders()
        });

        expect(res.status()).toBe(200);
        const resources = await res.json();
        expect(Array.isArray(resources)).toBeTruthy();
        expect(resources.length).toBeGreaterThan(0);

        const sampleResource = resources[0];
        expect(sampleResource).toHaveProperty('id');
        expect(sampleResource).toHaveProperty('resource');
        expect(sampleResource).toHaveProperty('sowId');
    });

    test('PAA-P10: GET /api/margin/total-revenue and GET /api/margin/project/{id} - Revenue and margin metrics', async ({ request }) => {
        // 1. Total revenue endpoint
        const revRes = await request.get(`${API_BASE}/api/margin/total-revenue`, {
            headers: getHeaders()
        });
        expect(revRes.status()).toBe(200);
        const revData = await revRes.json();
        expect(revData).toHaveProperty('totalRevenueUsd');
        expect(typeof revData.totalRevenueUsd).toBe('number');

        // 2. Sample project margin endpoint
        const projRes = await request.get(`${API_BASE}/api/projects`, { headers: getHeaders() });
        const projects = await projRes.json();
        const validProjectId = projects[0]?.id || 65;

        const marginRes = await request.get(`${API_BASE}/api/margin/project/${validProjectId}`, {
            headers: getHeaders()
        });
        expect(marginRes.status()).toBe(200);
        const marginData = await marginRes.json();
        expect(marginData).toHaveProperty('projectId');
        expect(marginData).toHaveProperty('marginDollar');
        expect(marginData).toHaveProperty('marginPercent');
    });
});

// ============================================================
// SUITE 2: NEGATIVE API TEST CASES
// ============================================================
test.describe('Suite 2: Negative API Test Cases', () => {

    test('PAA-N01: GET /api/clients - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/clients`);
        expect([401, 403]).toContain(res.status());
    });

    test('PAA-N02: GET /api/projects - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/projects`);
        expect([401, 403]).toContain(res.status());
    });

    test('PAA-N03: GET /api/project-sow/mappings - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/project-sow/mappings`);
        expect([401, 403]).toContain(res.status());
    });

    test('PAA-N04: GET /api/resource/get/allEmployeeSoWdata - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/resource/get/allEmployeeSoWdata`);
        expect([401, 403]).toContain(res.status());
    });

    test('PAA-N05: GET /api/margin/total-revenue - Fails without Authorization token (401)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/margin/total-revenue`);
        expect([401, 403]).toContain(res.status());
    });

    test('PAA-N06: GET /api/margin/project/{id} - Non-existent project returns 404 or zeroed margin payload', async ({ request }) => {
        const nonExistentProjectId = 99999999;
        const res = await request.get(`${API_BASE}/api/margin/project/${nonExistentProjectId}`, {
            headers: getHeaders()
        });

        // Backend either returns 404 or a zero-initialized payload
        expect([200, 400, 404, 500]).toContain(res.status());
        if (res.status() === 200) {
            const data = await res.json();
            expect(data.marginPercent || 0).toBe(0);
        }
    });
});

// ============================================================
// SUITE 3: EDGE CASES & RELATIONAL INTEGRITY
// ============================================================
test.describe('Suite 3: Edge Cases & Relational Integrity', () => {

    test('PAA-E01: Project-SoW mapping consistency (valid project and sow references)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/project-sow/mappings`, {
            headers: getHeaders()
        });
        expect(res.status()).toBe(200);
        const mappings = await res.json();

        for (const m of mappings.slice(0, 30)) {
            expect(m.projectId).toBeDefined();
            expect(m.sowId).toBeDefined();
            expect(Number(m.projectId)).toBeGreaterThan(0);
            expect(Number(m.sowId)).toBeGreaterThan(0);
        }
    });

    test('PAA-E02: Client-Project relational integrity (projects have non-empty client names)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/projects`, {
            headers: getHeaders()
        });
        expect(res.status()).toBe(200);
        const projects = await res.json();

        const validClientProjects = projects.filter(p => p.clientName && p.clientName.trim().length > 0);
        expect(validClientProjects.length).toBeGreaterThan(0);
    });

    test('PAA-E03: Resource SoW allocation percentages (0% to 100%)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/resource/get/allEmployeeSoWdata`, {
            headers: getHeaders()
        });
        expect(res.status()).toBe(200);
        const resources = await res.json();

        for (const r of resources.slice(0, 30)) {
            if (r.percentAllocation !== null && r.percentAllocation !== undefined) {
                const percent = Number(r.percentAllocation);
                expect(percent).toBeGreaterThanOrEqual(0);
                expect(percent).toBeLessThanOrEqual(100);
            }
        }
    });

    test('PAA-E04: Multi-project allocation verification (distinct employees vs allocation count)', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/utilization/reports/as-of-date?asOfDate=${TODAY}`, {
            headers: getHeaders()
        });
        expect(res.status()).toBe(200);
        const data = await res.json();

        const totalAllocations = data.employees.length;
        const distinctEmployees = new Set(data.employees.map(e => e.empId).filter(Boolean)).size;

        // Distinct employees must be less than or equal to total allocation records
        expect(distinctEmployees).toBeLessThanOrEqual(totalAllocations);
        expect(distinctEmployees).toBeGreaterThan(0);
    });
});
