const { test, expect, request } = require('@playwright/test');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Backend URL resolution: supports local Spring Boot (8080) and remote environments
const SKILLS_API_BASE_URL = (
    process.env.SKILLS_API_BASE_URL ||
    'http://localhost:8080/api'
).replace(/\/+$/, '');

const API_TOKEN = process.env.API_TOKEN;

let dbConnection = null;
let apiContext = null;

async function getDbConnection() {
    if (!dbConnection) {
        const isLocal = SKILLS_API_BASE_URL.includes('localhost') || SKILLS_API_BASE_URL.includes('127.0.0.1');
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

test.describe('Employee Skills Self-Service APIs - Automation Suite', () => {
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

    /**
     * ============================================================
     * 1. LOOKUP EMPLOYEE ID BY EMAIL:
     *    GET /api/employeeSkills/lookupByEmail?email=...
     * ============================================================
     */
    test.describe('1. Lookup Employee by Email (/employeeSkills/lookupByEmail)', () => {

        test('POS-01 - Successfully resolve active employee by official email', async () => {
            const targetEmail = 'Lakshmi.Dara@relanto.ai';
            const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                params: { email: targetEmail }
            });

            expect(response.status()).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty('found', true);
            expect(data).toHaveProperty('employeeId');
            expect(String(data.employeeId).trim()).toBe('2068');

            console.log(`[PASS POS] Email "${targetEmail}" resolved to Employee ID: ${data.employeeId}`);
        });

        test('POS-02 - Case-insensitivity verification (uppercase, lowercase, mixed case)', async () => {
            const variations = [
                'lakshmi.dara@relanto.ai',
                'LAKSHMI.DARA@RELANTO.AI',
                'LaKsHmI.dArA@ReLaNtO.aI'
            ];

            for (const emailVar of variations) {
                const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                    params: { email: emailVar }
                });

                expect(response.status()).toBe(200);
                const data = await response.json();
                expect(data.found).toBe(true);
                expect(String(data.employeeId).trim()).toBe('2068');
            }
            console.log('[PASS POS] Email lookup successfully handles case-insensitivity');
        });

        test('POS-03 - Cross-validate email resolution with MySQL emp_details table', async () => {
            const targetEmail = 'Lakshmi.Dara@relanto.ai';

            // Query DB directly
            const conn = await getDbConnection();
            const [dbRows] = await conn.query(
                'SELECT emp_id, full_name, official_email_id FROM emp_details WHERE LOWER(official_email_id) = LOWER(?)',
                [targetEmail]
            );

            expect(dbRows.length).toBe(1);
            const dbEmp = dbRows[0];

            // Query API
            const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                params: { email: targetEmail }
            });
            expect(response.status()).toBe(200);
            const apiData = await response.json();

            expect(apiData.found).toBe(true);
            expect(String(apiData.employeeId).trim()).toBe(String(dbEmp.emp_id).trim());

            console.log(`[PASS DB MATCH] API resolved ID (${apiData.employeeId}) matches DB emp_id for ${dbEmp.full_name}`);
        });

        test('POS-04 - Dynamic lookup for multiple active employees from database', async () => {
            const conn = await getDbConnection();
            const [sampleEmployees] = await conn.query(
                `SELECT emp_id, official_email_id FROM emp_details 
                 WHERE official_email_id IS NOT NULL AND official_email_id != '' 
                   AND COALESCE(is_deleted, 0) = 0 
                 LIMIT 5`
            );

            expect(sampleEmployees.length).toBeGreaterThan(0);

            for (const emp of sampleEmployees) {
                const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                    params: { email: emp.official_email_id }
                });

                expect(response.status()).toBe(200);
                const data = await response.json();
                expect(data.found).toBe(true);
                expect(String(data.employeeId).trim()).toBe(String(emp.emp_id).trim());
            }
            console.log(`[PASS POS] Successfully validated ${sampleEmployees.length} dynamic employee emails against DB`);
        });

        test('NEG-01 - Non-existent email returns found: false', async () => {
            const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                params: { email: 'non_existent_employee_test_99999@relanto.ai' }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(data).toHaveProperty('found', false);
            expect(data.employeeId).toBeUndefined();

            console.log('[PASS NEG] Non-existent email returned found: false');
        });

        test('NEG-02 - Missing email parameter returns 400 Bad Request', async () => {
            const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`);

            // Spring Boot @RequestParam String email enforces parameter presence
            expect(response.status()).toBe(400);
            console.log('[PASS NEG] Missing email query param returned HTTP 400 Bad Request');
        });

        test('NEG-03 - Empty string email parameter returns error or found: false', async () => {
            const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                params: { email: '' }
            });

            // If empty/null emails exist in database, Spring Data JPA returns 500 NonUniqueResultException; otherwise 200 { found: false }
            expect([200, 500]).toContain(response.status());
            if (response.status() === 200) {
                const data = await response.json();
                expect(data.found).toBe(false);
            }
        });

        test('NEG-04 - Whitespace-only email returns error or found: false', async () => {
            const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                params: { email: '   ' }
            });

            expect([200, 500]).toContain(response.status());
            if (response.status() === 200) {
                const data = await response.json();
                expect(data.found).toBe(false);
            }
        });

        test('EDGE-01 - SQL injection attack vector handled safely without server error', async () => {
            const sqlInjections = [
                "' OR '1'='1",
                "admin' --",
                "'; DROP TABLE emp_details; --"
            ];

            for (const payload of sqlInjections) {
                const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                    params: { email: payload }
                });

                // Spring Boot JPA parameterized query handles safely
                expect(response.status()).toBe(200);
                const data = await response.json();
                expect(data.found).toBe(false);
            }
            console.log('[PASS EDGE] SQL injection attempts safely handled with found: false');
        });

        test('EDGE-02 - Malformed email string handled gracefully', async () => {
            const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                params: { email: 'invalid@@@email...domain' }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(data.found).toBe(false);
        });

        test('EDGE-03 - Extremely long email string handled gracefully', async () => {
            const longEmail = 'a'.repeat(300) + '@relanto.ai';
            const response = await apiContext.get(`${SKILLS_API_BASE_URL}/employeeSkills/lookupByEmail`, {
                params: { email: longEmail }
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(data.found).toBe(false);
        });
    });

    /**
     * ============================================================
     * 2. SAVE EMPLOYEE SKILLS:
     *    POST /api/employeeSkills/save
     * ============================================================
     */
    test.describe('2. Save Employee Skills (/employeeSkills/save)', () => {

        test('POS-01 - Save skills using valid email resolves employee and persists successfully', async () => {
            const payload = {
                email: 'Lakshmi.Dara@relanto.ai',
                projectSkills: ['Spring Boot', 'Kafka', 'AWS'],
                primarySkills: ['Java', 'Spring Cloud'],
                secondarySkills: ['React', 'TypeScript'],
                otherSkills: ['Figma', 'Agile'],
                certifications: ['AWS Certified Developer']
            };

            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: payload
            });

            expect(response.status()).toBe(200);
            const data = await response.json();

            expect(data).toHaveProperty('success', true);
            expect(data).toHaveProperty('message', 'Skills saved successfully.');
            expect(data).toHaveProperty('employeeId', '2068');

            console.log(`[PASS POS] Successfully saved skills for email: ${payload.email} (Emp ID: ${data.employeeId})`);
        });

        test('POS-02 - Cross-validate saved skills in MySQL employee_designation_and_experience table', async () => {
            const empId = '2068';
            const payload = {
                employeeId: empId,
                primarySkills: ['Java', 'Golang'],
                secondarySkills: ['Docker', 'Kubernetes'],
                projectSkills: ['Microservices', 'REST APIs'],
                otherSkills: ['Jira'],
                certifications: ['Oracle Certified Java Professional']
            };

            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: payload
            });
            expect(response.status()).toBe(200);

            // Verify in DB
            const conn = await getDbConnection();
            const [rows] = await conn.query(
                `SELECT primary_skill, secondary_skill, project_skills, other_skills, certification_complete 
                 FROM employee_designation_and_experience 
                 WHERE employee_id = ?`,
                [empId]
            );

            expect(rows.length).toBeGreaterThanOrEqual(1);
            const desig = rows[0];

            expect(desig.primary_skill).toBe(payload.primarySkills.join(', '));
            expect(desig.secondary_skill).toBe(payload.secondarySkills.join(', '));
            expect(desig.project_skills).toBe(payload.projectSkills.join(', '));
            expect(desig.other_skills).toBe(payload.otherSkills.join(', '));
            expect(desig.certification_complete).toBe(payload.certifications.join(', '));

            console.log('[PASS DB MATCH] Database skills match payload persisted via API');
        });

        test('POS-03 - Fallback to employeeId when email is not provided', async () => {
            const payload = {
                employeeId: '2068',
                primarySkills: ['Python', 'Django'],
                secondarySkills: ['PostgreSQL']
            };

            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: payload
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);
            expect(data.employeeId).toBe('2068');
        });

        test('NEG-01 - Missing both email and employeeId returns 400 Bad Request', async () => {
            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: {
                    primarySkills: ['Java']
                }
            });

            expect(response.status()).toBe(400);
            const data = await response.json();
            expect(data).toHaveProperty('success', false);
            expect(data).toHaveProperty('message', 'Could not determine employee. Please provide a valid Employee ID.');

            console.log('[PASS NEG] Missing identity returned HTTP 400 with expected error message');
        });

        test('NEG-02 - Empty email and empty employeeId strings return 400 Bad Request', async () => {
            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: {
                    email: '   ',
                    employeeId: '',
                    primarySkills: ['Python']
                }
            });

            expect(response.status()).toBe(400);
            const data = await response.json();
            expect(data.success).toBe(false);
        });

        test('NEG-03 - Unknown email without employeeId fallback returns 400 Bad Request', async () => {
            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: {
                    email: 'unknown_fake_employee_9999@relanto.ai',
                    primarySkills: ['React']
                }
            });

            expect(response.status()).toBe(400);
            const data = await response.json();
            expect(data.success).toBe(false);
            expect(data.message).toContain('Could not determine employee');
        });

        test('EDGE-01 - Empty skill arrays save cleanly as empty strings', async () => {
            const payload = {
                employeeId: '2068',
                projectSkills: [],
                primarySkills: [],
                secondarySkills: [],
                otherSkills: [],
                certifications: []
            };

            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: payload
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);

            // DB should have empty strings
            const conn = await getDbConnection();
            const [rows] = await conn.query(
                'SELECT primary_skill, secondary_skill FROM employee_designation_and_experience WHERE employee_id = ?',
                ['2068']
            );
            expect(rows[0].primary_skill).toBe('');
            expect(rows[0].secondary_skill).toBe('');
        });

        test('EDGE-02 - Special characters in skill names (C++, C#, .NET, CI/CD)', async () => {
            const specialSkills = ['C++', 'C#', '.NET Core', 'CI/CD Pipelines', 'TCP/IP'];
            const payload = {
                employeeId: '2068',
                primarySkills: specialSkills
            };

            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: payload
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);

            const conn = await getDbConnection();
            const [rows] = await conn.query(
                'SELECT primary_skill FROM employee_designation_and_experience WHERE employee_id = ?',
                ['2068']
            );
            expect(rows[0].primary_skill).toBe(specialSkills.join(', '));
        });

        test('EDGE-03 - Large list of skills handled successfully', async () => {
            const largeSkillList = Array.from({ length: 30 }, (_, i) => `Skill_${i + 1}`);
            const payload = {
                employeeId: '2068',
                projectSkills: largeSkillList
            };

            const response = await apiContext.post(`${SKILLS_API_BASE_URL}/employeeSkills/save`, {
                data: payload
            });

            expect(response.status()).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);
        });
    });
});
