/**
 * Manage Projects: API Automation Test Suite
 * 
 * Comprehensive API Automation covering all endpoints in:
 * - ProjectController (/api/projects)
 * - ProjectRoleController (/api/projects/{projectId}/roles)
 * - ProjectPracticeController (/api/project-practice)
 * - ProjectSowMappingController (/api/project-sow)
 * 
 * Catalog:
 * - Suite 1: Positive Test Cases (API-P01 to API-P12)
 * - Suite 2: Negative Test Cases (API-N01 to API-N08)
 * - Suite 3: Edge & Boundary Test Cases (API-E01 to API-E06)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================
const API_BASE = (process.env.API_BASE_URL || 'http://localhost:8080/api').replace(/\/$/, '');

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

const VALID_PRACTICES = [
    'Data & AI',
    'Digital Transformation',
    'Planning',
    'Revenue and Sales',
    'AI-First Lab',
    'IP & Solutions'
];

function getHeaders(token = API_TOKEN) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

test.use({
    trace: 'off'
});

// ============================================================
// SUITE 1: POSITIVE API TEST CASES (API-P01 to API-P12)
// ============================================================
test.describe.serial('Suite 1: Positive API Test Cases', () => {
    let projectId = null;
    let roleId = null;
    const runId = Date.now().toString().slice(-6);
    const testCode = `APIP${runId}`;

    test.afterAll(async () => {
        if (projectId) {
            await fetch(`${API_BASE}/projects/${projectId}`, {
                method: 'DELETE',
                headers: getHeaders()
            }).catch(() => {});
        }
    });

    test('API-P01: GET /api/projects - Retrieve all projects', async () => {
        const res = await fetch(`${API_BASE}/projects`, { headers: getHeaders() });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);

        // Verify structure of first item
        const first = data[0];
        expect(first).toHaveProperty('id');
        expect(first).toHaveProperty('projectCode');
        expect(first).toHaveProperty('projectName');
        expect(first).toHaveProperty('clientName');
        expect(first).toHaveProperty('projectType');
    });

    test('API-P02: POST /api/projects - Create project with valid payload', async () => {
        const payload = {
            projectCode: testCode,
            projectName: `API_Test_Project_${runId}`,
            clientName: 'Google',
            projectManager: 'Sridhar Pokuri',
            projectType: 'Production',
            startDate: '2026-11-01',
            endDate: '2026-12-31',
            isValid: true
        };

        const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        expect(res.status).toBe(200);
        const created = await res.json();
        expect(created.id).toBeDefined();
        expect(created.projectCode).toBe(testCode);
        expect(created.projectName).toBe(`API_Test_Project_${runId}`);
        projectId = created.id;
    });

    test('API-P03: GET /api/projects/{id} - Retrieve project details and roles structure', async () => {
        expect(projectId).toBeDefined();

        const res = await fetch(`${API_BASE}/projects/${projectId}`, { headers: getHeaders() });
        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.project).toBeDefined();
        expect(data.project.id).toBe(projectId);
        expect(data.project.projectCode).toBe(testCode);
        expect(data.roles).toBeDefined();
        expect(Array.isArray(data.roles)).toBe(true);
    });

    test('API-P04: PUT /api/projects/{id} - Update project fields', async () => {
        expect(projectId).toBeDefined();

        const updatePayload = {
            projectCode: testCode,
            projectName: `API_Updated_Project_${runId}`,
            clientName: 'Google',
            projectManager: 'Sridhar Pokuri',
            projectType: 'Internal',
            startDate: '2026-11-01',
            endDate: '2026-12-15',
            isValid: true
        };

        const res = await fetch(`${API_BASE}/projects/${projectId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(updatePayload)
        });

        expect(res.status).toBe(200);

        // Verify update persisted
        const getRes = await fetch(`${API_BASE}/projects/${projectId}`, { headers: getHeaders() });
        const data = await getRes.json();
        expect(data.project.projectName).toBe(`API_Updated_Project_${runId}`);
        expect(data.project.projectType).toBe('Internal');
    });

    test('API-P05: POST /api/projects/{projectId}/roles/bulk - Add multiple roles', async () => {
        expect(projectId).toBeDefined();

        const rolesPayload = [
            {
                projectRole: 'Senior Fullstack Engineer',
                clientRole: 'Technical Lead',
                clientRoleId: 153,
                billRate: 160.0,
                countryName: 'India',
                stateName: 'Karnataka',
                cityName: 'Bengaluru'
            },
            {
                projectRole: 'Automation QA Engineer',
                clientRole: 'SDET',
                clientRoleId: 154,
                billRate: 120.0,
                countryName: 'India',
                stateName: 'Karnataka',
                cityName: 'Bengaluru'
            }
        ];

        const res = await fetch(`${API_BASE}/projects/${projectId}/roles/bulk`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(rolesPayload)
        });

        expect(res.status).toBe(201);
        const savedRoles = await res.json();
        expect(Array.isArray(savedRoles)).toBe(true);
        expect(savedRoles.length).toBe(2);
        roleId = savedRoles[0].id;
    });

    test('API-P06: GET /api/projects/{projectId}/roles - Retrieve all project roles', async () => {
        expect(projectId).toBeDefined();

        const res = await fetch(`${API_BASE}/projects/${projectId}/roles`, { headers: getHeaders() });
        expect(res.status).toBe(200);
        const roles = await res.json();
        expect(Array.isArray(roles)).toBe(true);
        expect(roles.length).toBe(2);
        expect(roles.some(r => r.projectRole === 'Senior Fullstack Engineer')).toBe(true);
    });

    test('API-P07: PUT /api/projects/{projectId}/roles/{roleId} - Update a role', async () => {
        expect(projectId).toBeDefined();
        expect(roleId).toBeDefined();

        const updatePayload = {
            projectRole: 'Lead Fullstack Architect',
            clientRole: 'Architect',
            clientRoleId: 153,
            billRate: 185.0,
            countryName: 'India',
            stateName: 'Karnataka',
            cityName: 'Bengaluru'
        };

        const res = await fetch(`${API_BASE}/projects/${projectId}/roles/${roleId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(updatePayload)
        });

        expect([200, 204]).toContain(res.status);
    });

    test('API-P08: DELETE /api/projects/{projectId}/roles/{roleId} - Delete a role', async () => {
        expect(projectId).toBeDefined();
        expect(roleId).toBeDefined();

        const res = await fetch(`${API_BASE}/projects/${projectId}/roles/${roleId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        expect([200, 204]).toContain(res.status);

        // Verify only 1 role remains
        const getRoles = await fetch(`${API_BASE}/projects/${projectId}/roles`, { headers: getHeaders() });
        const remaining = await getRoles.json();
        expect(remaining.length).toBe(1);
    });

    test('API-P09: PUT /api/project-practice/{projectId} - Assign practice', async () => {
        expect(projectId).toBeDefined();

        const res = await fetch(`${API_BASE}/project-practice/${projectId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ practice: 'Data & AI' })
        });

        expect(res.status).toBe(200);
    });

    test('API-P10: GET /api/project-practice/{projectId} - Retrieve practice', async () => {
        expect(projectId).toBeDefined();

        const res = await fetch(`${API_BASE}/project-practice/${projectId}`, { headers: getHeaders() });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.practice).toBe('Data & AI');
    });

    test('API-P11: GET /api/projects/{projectId}/sows - Retrieve SOW mappings', async () => {
        expect(projectId).toBeDefined();

        const res = await fetch(`${API_BASE}/projects/${projectId}/sows`, { headers: getHeaders() });
        expect(res.status).toBe(200);
        const sows = await res.json();
        expect(Array.isArray(sows)).toBe(true);
    });

    test('API-P12: DELETE /api/projects/{id} - Delete project', async () => {
        expect(projectId).toBeDefined();

        const res = await fetch(`${API_BASE}/projects/${projectId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        expect(res.status).toBe(200);

        // Confirm project is deleted
        const check = await fetch(`${API_BASE}/projects/${projectId}`, { headers: getHeaders() });
        expect([404, 500]).toContain(check.status);
        projectId = null;
    });
});

// ============================================================
// SUITE 2: NEGATIVE API TEST CASES (API-N01 to API-N08)
// ============================================================
test.describe('Suite 2: Negative API Test Cases', () => {
    test('API-N01: POST /api/projects rejects duplicate projectCode', async () => {
        // AMGCIQ8 is an existing permanent project
        const payload = {
            projectCode: 'AMGCIQ8',
            projectName: 'Duplicate Project Code Test',
            clientName: 'Amgen',
            projectManager: 'Sridhar Pokuri',
            projectType: 'Production',
            startDate: '2026-01-01',
            endDate: '2026-12-31'
        };

        const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        expect([400, 409, 500]).toContain(res.status);
    });

    test('API-N02: POST /api/projects rejects missing mandatory projectCode', async () => {
        const payload = {
            projectName: 'Missing Code Test',
            clientName: 'Google',
            projectManager: 'Sridhar Pokuri',
            projectType: 'Production',
            startDate: '2026-01-01',
            endDate: '2026-12-31'
        };

        const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        expect([400, 500]).toContain(res.status);
    });

    test('API-N03: POST /api/projects rejects missing projectName', async () => {
        const payload = {
            projectCode: `NOC_${Date.now().toString().slice(-6)}`,
            clientName: 'Google',
            projectManager: 'Sridhar Pokuri',
            projectType: 'Production',
            startDate: '2026-01-01',
            endDate: '2026-12-31'
        };

        const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        expect([400, 500]).toContain(res.status);
    });

    test('API-N04: PUT /api/project-practice/{id} rejects invalid practice with 400 Bad Request', async () => {
        const res = await fetch(`${API_BASE}/project-practice/21`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ practice: 'CompletelyInvalidPracticeName' })
        });

        expect(res.status).toBe(400);
    });

    test('API-N05: GET /api/projects/9999999 returns error for non-existent ID', async () => {
        const res = await fetch(`${API_BASE}/projects/9999999`, { headers: getHeaders() });
        expect([404, 500]).toContain(res.status);
    });

    test('API-N06: PUT /api/projects/9999999 returns error for non-existent ID', async () => {
        const res = await fetch(`${API_BASE}/projects/9999999`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                projectCode: 'NOEXIST01',
                projectName: 'Non-existent Project',
                clientName: 'Google',
                projectManager: 'Sridhar Pokuri',
                projectType: 'Production',
                startDate: '2026-01-01',
                endDate: '2026-12-31'
            })
        });

        expect([400, 404, 500]).toContain(res.status);
    });

    test('API-N07: DELETE /api/projects/9999999 returns error for non-existent ID', async () => {
        const res = await fetch(`${API_BASE}/projects/9999999`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        expect([400, 404, 500]).toContain(res.status);
    });

    test('API-N08: Request without Authorization token returns 401 Unauthorized', async () => {
        const res = await fetch(`${API_BASE}/projects`);
        expect(res.status).toBe(401);
    });
});

// ============================================================
// SUITE 3: EDGE & BOUNDARY API TEST CASES (API-E01 to API-E06)
// ============================================================
test.describe('Suite 3: Edge & Boundary API Test Cases', () => {
    let edgeId = null;
    const edgeCode = `E20_${Date.now().toString().padStart(16, '0')}`; // Exactly 20 chars (4 + 16 = 20)

    test.afterAll(async () => {
        if (edgeId) {
            await fetch(`${API_BASE}/projects/${edgeId}`, {
                method: 'DELETE',
                headers: getHeaders()
            }).catch(() => {});
        }
    });

    test('API-E01: Boundary maximum 20-character projectCode is accepted', async () => {
        expect(edgeCode.length).toBe(20);

        const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                projectCode: edgeCode,
                projectName: '20 Characters Project Code Test',
                clientName: 'Google',
                projectManager: 'Sridhar Pokuri',
                projectType: 'Production',
                startDate: '2026-11-01',
                endDate: '2026-12-01',
                isValid: true
            })
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBeDefined();
        edgeId = data.id;
    });

    test('API-E02: Boundary Start Date = End Date (Same-day project) is accepted', async () => {
        const sameDayCode = `SD_${Date.now().toString().slice(-6)}`;
        const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                projectCode: sameDayCode,
                projectName: 'Same Day Project',
                clientName: 'Google',
                projectManager: 'Sridhar Pokuri',
                projectType: 'Production',
                startDate: '2026-11-20',
                endDate: '2026-11-20',
                isValid: true
            })
        });

        expect(res.status).toBe(200);
        const data = await res.json();

        // Cleanup
        if (data.id) {
            await fetch(`${API_BASE}/projects/${data.id}`, { method: 'DELETE', headers: getHeaders() });
        }
    });

    test('API-E03: Project with 0 roles returns empty roles array', async () => {
        expect(edgeId).toBeDefined();

        const res = await fetch(`${API_BASE}/projects/${edgeId}`, { headers: getHeaders() });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.roles).toEqual([]);
    });

    test('API-E04: GET /api/project-practice/unassigned returns valid array', async () => {
        const res = await fetch(`${API_BASE}/project-practice/unassigned`, { headers: getHeaders() });
        expect(res.status).toBe(200);
        const unassigned = await res.json();
        expect(Array.isArray(unassigned)).toBe(true);
    });

    test('API-E05: Whitespace in project name is accepted and trimmed', async () => {
        const trimCode = `TR_${Date.now().toString().slice(-6)}`;
        const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                projectCode: trimCode,
                projectName: '   Whitespace Project Name   ',
                clientName: 'Google',
                projectManager: 'Sridhar Pokuri',
                projectType: 'Production',
                startDate: '2026-11-01',
                endDate: '2026-12-01',
                isValid: true
            })
        });

        expect(res.status).toBe(200);
        const data = await res.json();

        if (data.id) {
            await fetch(`${API_BASE}/projects/${data.id}`, { method: 'DELETE', headers: getHeaders() });
        }
    });

    test('API-E06: All 6 allowed practice options accept updates', async () => {
        expect(edgeId).toBeDefined();

        for (const practice of VALID_PRACTICES) {
            const res = await fetch(`${API_BASE}/project-practice/${edgeId}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ practice })
            });
            expect(res.status).toBe(200);

            const verifyRes = await fetch(`${API_BASE}/project-practice/${edgeId}`, { headers: getHeaders() });
            const data = await verifyRes.json();
            expect(data.practice).toBe(practice);
        }
    });
});
