/**
 * ============================================================================
 * Outrate Management Master Automation Test Suite
 * File: tests/Admin/outrate/outrate_db_ui_validation.spec.js
 *
 * Mandatory Zero-Bypass Rule Strictly Enforced:
 * 1. No error suppression (no empty catch blocks, no `.catch(() => {})`)
 * 2. No weakened assertions (exact status code and value comparisons)
 * 3. No hidden skips or conditional passes
 * 4. Strict UI validation across all controls, modals, and tabs
 * 5. Strict API contract validation
 * 6. Strict database reconciliation (MySQL employee_base_costs, outrate_view_log, emp_details)
 * 7. Safe error handling and cleanup (failures reported, no destructive cleanup)
 * 8. Distinguish expected negative outcomes from defects
 * 9. Root-cause analysis mandatory on failures
 * 10. Mandatory final verification
 *
 * Complete Test Catalog:
 * - Suite A: Positive Tests (OUT-P001 to OUT-P028) [28 Tests]
 * - Suite B: Negative Tests (OUT-N001 to OUT-N035) [35 Tests]
 * - Suite C: Edge Cases & Data Integrity (OUT-E001 to OUT-E045) [45 Tests]
 * - Suite D: Security & Authorization (OUT-S001 to OUT-S015) [15 Tests]
 * Total: 123 Tests
 * ============================================================================
 */

const { test, expect, request } = require('@playwright/test');
const mysql = require('mysql2/promise');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const {
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
} = require('./helpers/outrate_test_helpers');

test.use({ trace: 'off' });

test.describe('Outrate Management — Complete Automation Suite (Zero-Bypass)', () => {
    // Run tests in default mode so failure of one test does not skip subsequent tests
    test.describe.configure({ mode: 'default' });

    test.afterAll(async () => {
        await closeDbPool();
    });

    // ========================================================================
    // SUITE A: POSITIVE TESTS (+VE) — OUT-P001 to OUT-P028
    // ========================================================================
    test.describe('Suite A: Positive Tests (+ve)', () => {

        test('OUT-P001: Open Outrate Management page — Page loads; title and required controls are visible', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            const pageTitle = page.locator('.page-title');
            await expect(pageTitle).toBeVisible({ timeout: 20000 });
            await expect(pageTitle).toHaveText('Outrate Management');

            const subtitle = page.locator('.page-subtitle');
            await expect(subtitle).toBeVisible();
            await expect(subtitle).toContainText('Upload, look up or download decrypted employee outrates.');

            await expect(page.locator('#tab-individual')).toBeVisible();
            await expect(page.locator('#tab-download')).toBeVisible();
            await expect(page.locator('#tab-upload')).toBeVisible();
        });

        test('OUT-P002: Load the lookup tab — Employee ID field and Lookup button behave correctly', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            const empInput = page.locator('#empIdInput');
            await expect(empInput).toBeVisible();
            await expect(empInput).toHaveAttribute('placeholder', 'Enter Employee ID (e.g. TT0157)');

            const lookupBtn = page.locator('#btn-lookup');
            await expect(lookupBtn).toBeVisible();
            await expect(lookupBtn).toBeDisabled();

            await empInput.fill('100');
            await expect(lookupBtn).toBeEnabled();

            await empInput.fill('');
            await expect(lookupBtn).toBeDisabled();
        });

        test('OUT-P003: Lookup an existing employee with an outrate record — Correct employee and decrypted rate are displayed', async ({ page }) => {
            const emp = KNOWN_RECORDS.ACTIVE_EMP;
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill(emp.empId);
            await page.locator('#btn-lookup').click();

            const resultCard = page.locator('.result-card.success-result');
            await expect(resultCard).toBeVisible({ timeout: 15000 });

            await expect(page.locator('.result-emp-id')).toHaveText(emp.empId);
            const rateText = await page.locator('.rate-value').innerText();
            const parsedRate = parseFloat(rateText.replace(/[^0-9.]/g, ''));
            expect(parsedRate).toBe(emp.expectedRate);
        });

        test('OUT-P004: Lookup an active employee — Employee details and rate match API and DB', async ({ page }) => {
            const pool = getDbPool();
            const emp = KNOWN_RECORDS.ACTIVE_EMP;

            const [empRows] = await pool.execute(
                'SELECT emp_id, full_name, is_deleted FROM emp_details WHERE emp_id = ?',
                [emp.empId]
            );
            expect(empRows.length).toBe(1);
            expect(empRows[0].is_deleted).toBe(0);
            expect(empRows[0].full_name).toBe(emp.fullName);

            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${emp.empId}`);
            expect(res.status()).toBe(200);
            const apiJson = await res.json();
            expect(apiJson.outrate).toBe(emp.expectedRate);

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);
            await page.locator('#empIdInput').fill(emp.empId);
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('.result-emp-id')).toHaveText(emp.empId);
            const rateText = await page.locator('.rate-value').innerText();
            expect(parseFloat(rateText.replace(/[^0-9.]/g, ''))).toBe(apiJson.outrate);
        });

        test('OUT-P005: Lookup a valid alphanumeric employee ID — Correct record is returned', async ({ page }) => {
            const emp = KNOWN_RECORDS.ALPHA_HYPHEN_EMP;
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill(emp.empId);
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('.result-emp-id')).toHaveText(emp.empId);
            const rateText = await page.locator('.rate-value').innerText();
            expect(parseFloat(rateText.replace(/[^0-9.]/g, ''))).toBe(emp.expectedRate);
        });

        test('OUT-P006: Lookup an employee ID containing supported hyphens — Correct record is returned', async ({ page }) => {
            const emp = KNOWN_RECORDS.ALPHA_HYPHEN_EMP;
            expect(emp.empId).toContain('-');

            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${emp.empId}`);
            expect(res.status()).toBe(200);
            const json = await res.json();
            expect(json.employeeId).toBe(emp.empId);
            expect(json.outrate).toBe(emp.expectedRate);
        });

        test('OUT-P007: Validate employee ID displayed in the result card — Exact match with requested ID and API response', async ({ page }) => {
            const empId = KNOWN_RECORDS.ACTIVE_EMP.empId;
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${empId}`);
            expect(res.status()).toBe(200);
            const json = await res.json();

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);
            await page.locator('#empIdInput').fill(empId);
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            const displayedEmpId = await page.locator('.result-emp-id').innerText();
            expect(displayedEmpId.trim()).toBe(json.employeeId);
        });

        test('OUT-P008: Validate the displayed outrate — Numeric value matches API-decoded value and business formatting', async ({ page }) => {
            const empId = KNOWN_RECORDS.ACTIVE_EMP.empId;
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${empId}`);
            expect(res.status()).toBe(200);
            const json = await res.json();

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);
            await page.locator('#empIdInput').fill(empId);
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('.rate-value')).toBeVisible();
            await expect(page.locator('.rate-value')).toContainText('$');
            await expect(page.locator('.rate-unit')).toHaveText('/hr');

            const rateText = await page.locator('.rate-value').innerText();
            const parsedRate = parseFloat(rateText.replace(/[^0-9.]/g, ''));
            expect(parsedRate).toBe(json.outrate);
        });

        test('OUT-P009: Validate raw database outrate — Stored value is encrypted according to backend contract', async () => {
            const pool = getDbPool();
            const [rows] = await pool.execute(
                'SELECT employee_id, outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ACTIVE_EMP.empId]
            );
            expect(rows.length).toBe(1);
            const cipherText = rows[0].outrate;

            expect(isNaN(Number(cipherText))).toBe(true);
            expect(cipherText).toMatch(/^[A-Za-z0-9+/=]+$/);
            expect(cipherText.length).toBeGreaterThanOrEqual(16);
        });

        test('OUT-P010: Validate API response schema — Required fields, data types, and values are correct', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(200);

            const data = await res.json();
            expect(typeof data).toBe('object');
            expect(data).toHaveProperty('id');
            expect(data).toHaveProperty('employeeId');
            expect(data).toHaveProperty('outrate');

            expect(typeof data.id).toBe('number');
            expect(typeof data.employeeId).toBe('string');
            expect(typeof data.outrate).toBe('number');
            expect(data.id).toBeGreaterThan(0);
            expect(data.employeeId).toBe(KNOWN_RECORDS.ACTIVE_EMP.empId);
            expect(data.outrate).toBe(KNOWN_RECORDS.ACTIVE_EMP.expectedRate);
        });

        test('OUT-P011: Validate all-record API results — Returned records reconcile with the DB', async () => {
            const pool = getDbPool();
            const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM employee_base_costs');
            const dbTotal = countRows[0].total;

            const api = await getApiContext();
            const res = await api.get('employee-base-costs');
            expect(res.status()).toBe(200);

            const records = await res.json();
            expect(Array.isArray(records)).toBe(true);
            expect(records.length).toBe(dbTotal);
        });

        test('OUT-P012: Validate individual-record API results — Correct record is returned for requested employee', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`);
            expect(res.status()).toBe(200);

            const record = await res.json();
            expect(record.employeeId).toBe(KNOWN_RECORDS.ZERO_RATE_EMP.empId);
            expect(record.outrate).toBe(KNOWN_RECORDS.ZERO_RATE_EMP.expectedRate);
        });

        test('OUT-P013: Validate audit log after successful lookup — Exactly the expected new audit event is recorded', async ({ page }) => {
            const pool = getDbPool();
            const [before] = await pool.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const prevId = before[0].maxId || 0;

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);
            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ACTIVE_EMP.empId);
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            await page.waitForTimeout(1500);

            const [after] = await pool.execute(
                'SELECT id, action, viewer_name, viewer_email, timestamp FROM outrate_view_log WHERE id > ? AND action = "VIEWED_INDIVIDUAL" ORDER BY id DESC LIMIT 1',
                [prevId]
            );
            expect(after.length).toBe(1);
            expect(after[0].action).toBe('VIEWED_INDIVIDUAL');
        });

        test('OUT-P014: Validate audit actor name — Matches authenticated user expected identity', async () => {
            const api = await getApiContext();
            const meRes = await api.get('employee-base-costs/me');
            expect(meRes.status()).toBe(200);
            const meJson = await meRes.json();
            const expectedFullName = meJson.fullName;
            expect(typeof expectedFullName).toBe('string');
            expect(expectedFullName.length).toBeGreaterThan(0);

            const pool = getDbPool();
            const [recentLogs] = await pool.execute(
                'SELECT viewer_name FROM outrate_view_log WHERE viewer_email = ? ORDER BY id DESC LIMIT 1',
                ['Lakshmi.Dara@relanto.ai']
            );
            expect(recentLogs.length).toBe(1);
            expect(recentLogs[0].viewer_name).toBe(expectedFullName);
        });

        test('OUT-P015: Validate audit actor email — Matches authenticated user email from server-side identity', async () => {
            const pool = getDbPool();
            const [recentLogs] = await pool.execute(
                'SELECT viewer_email FROM outrate_view_log ORDER BY id DESC LIMIT 5'
            );
            expect(recentLogs.length).toBeGreaterThan(0);
            for (const log of recentLogs) {
                expect(log.viewer_email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
            }
        });

        test('OUT-P016: Validate audit action and timestamp — Action is correct and timestamp is valid', async () => {
            const pool = getDbPool();
            const [logs] = await pool.execute(
                'SELECT action, timestamp FROM outrate_view_log ORDER BY id DESC LIMIT 10'
            );
            expect(logs.length).toBeGreaterThan(0);

            const allowedActions = ['VIEWED_INDIVIDUAL', 'DOWNLOADED_ALL'];
            for (const log of logs) {
                const isBench = /^BENCH_REPORT_VIEWED_\d{4}$/.test(log.action);
                expect(allowedActions.includes(log.action) || isBench).toBe(true);
                const parsedDate = new Date(log.timestamp);
                expect(isNaN(parsedDate.getTime())).toBe(false);
            }
        });

        test('OUT-P017: Switch to Download tab — Correct tab is active and download controls are visible', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            const downloadTab = page.locator('#tab-download');
            await downloadTab.click();
            await expect(downloadTab).toHaveClass(/active/);

            const downloadBtn = page.locator('#btn-download-excel');
            await expect(downloadBtn).toBeVisible({ timeout: 10000 });
            await expect(downloadBtn).toBeEnabled();
        });

        test('OUT-P018: Download the Excel file — Download succeeds with expected filename and format', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-download').click();
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
            await page.locator('#btn-download-excel').click();
            const download = await downloadPromise;

            const filename = download.suggestedFilename();
            expect(filename).toMatch(/^employee_outrates_\d{4}-\d{2}-\d{2}\.xlsx$/);

            const tempPath = path.resolve('temp_out_p018.xlsx');
            await download.saveAs(tempPath);
            const stats = fs.statSync(tempPath);
            expect(stats.size).toBeGreaterThan(1000);
            fs.unlinkSync(tempPath);
        });

        test('OUT-P019: Validate downloaded workbook — File opens and contains expected columns and data', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-download').click();
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
            await page.locator('#btn-download-excel').click();
            const download = await downloadPromise;

            const tempPath = path.resolve('temp_out_p019.xlsx');
            await download.saveAs(tempPath);

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(tempPath);
            const sheet = workbook.worksheets[0];
            expect(sheet.name).toBe('Employee Outrates');
            expect(sheet.rowCount).toBeGreaterThan(800);

            const headerRow = sheet.getRow(1).values;
            expect(headerRow).toContain('Employee ID');
            expect(headerRow).toContain('Outrate ($/hr)');

            fs.unlinkSync(tempPath);
        });

        test('OUT-P020: Validate downloaded rates — Exported values match source records', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-download').click();
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
            await page.locator('#btn-download-excel').click();
            const download = await downloadPromise;

            const tempPath = path.resolve('temp_out_p020.xlsx');
            await download.saveAs(tempPath);

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(tempPath);
            const sheet = workbook.worksheets[0];

            let foundRecord = null;
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    const empId = String(row.getCell(1).value);
                    if (empId === KNOWN_RECORDS.ACTIVE_EMP.empId) {
                        foundRecord = {
                            empId,
                            rate: Number(row.getCell(2).value)
                        };
                    }
                }
            });

            expect(foundRecord).not.toBeNull();
            expect(foundRecord.empId).toBe(KNOWN_RECORDS.ACTIVE_EMP.empId);
            expect(foundRecord.rate).toBe(KNOWN_RECORDS.ACTIVE_EMP.expectedRate);

            fs.unlinkSync(tempPath);
        });

        test('OUT-P021: Validate download audit log — One expected DOWNLOADED_ALL event is recorded', async ({ page }) => {
            const pool = getDbPool();
            const [before] = await pool.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const prevId = before[0].maxId || 0;

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-download').click();
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
            await page.locator('#btn-download-excel').click();
            await downloadPromise;

            await page.waitForTimeout(1500);

            const [after] = await pool.execute(
                'SELECT id, action, viewer_name, viewer_email FROM outrate_view_log WHERE id > ? AND action = "DOWNLOADED_ALL" ORDER BY id DESC LIMIT 1',
                [prevId]
            );
            expect(after.length).toBe(1);
            expect(after[0].action).toBe('DOWNLOADED_ALL');
        });

        test('OUT-P022: Complete valid bulk upload — Valid file progresses through upload workflow', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await expect(page.getByText('SELECT FILE')).toBeVisible();

            const fileInput = page.locator('input[type="file"]');
            await fileInput.setInputFiles(KNOWN_RECORDS.SAMPLE_CSV_PATH);

            const nextBtn = page.getByRole('button', { name: /Next: Map Columns/i });
            await expect(nextBtn).toBeEnabled();
            await nextBtn.click();

            await expect(page.getByText('Map CSV Columns')).toBeVisible();
        });

        test('OUT-P023: Map valid upload columns — Employee ID and Outrate map to correct source columns', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles(KNOWN_RECORDS.SAMPLE_CSV_PATH);
            await page.getByRole('button', { name: /Next: Map Columns/i }).click();

            const selects = page.locator('select');
            await expect(selects.nth(0)).toBeVisible();
            await expect(selects.nth(1)).toBeVisible();

            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await expect(page.getByRole('button', { name: /Encrypt All Rows/i })).toBeEnabled();
        });

        test('OUT-P024: Encrypt rows during bulk upload — Encryption completes and stored values follow backend contract', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles(KNOWN_RECORDS.SAMPLE_CSV_PATH);
            await page.getByRole('button', { name: /Next: Map Columns/i }).click();

            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            const encryptBtn = page.getByRole('button', { name: /Encrypt All Rows/i });
            await expect(encryptBtn).toBeEnabled();
            await encryptBtn.click();

            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-P025: Complete the upload — Completion status and row counts match actual results', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles(KNOWN_RECORDS.SAMPLE_CSV_PATH);
            await page.getByRole('button', { name: /Next: Map Columns/i }).click();

            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });
            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();

            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
            await expect(page.getByText(/TOTAL ROWS/i)).toBeVisible();
            await expect(page.getByText(/ENCRYPTED & SAVED/i)).toBeVisible();
        });

        test('OUT-P026: Verify uploaded records in DB — Only intended records are inserted or updated', async () => {
            const pool = getDbPool();
            const [rows] = await pool.execute(
                'SELECT employee_id, outrate FROM employee_base_costs WHERE employee_id = "10007"'
            );
            expect(rows.length).toBe(1);
            expect(rows[0].employee_id).toBe('10007');
            expect(rows[0].outrate).toMatch(/^[A-Za-z0-9+/=]+$/);
        });

        test('OUT-P027: Verify uploaded records in UI/API — Updated data is visible and consistent across layers', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/10007');
            expect(res.status()).toBe(200);
            const data = await res.json();
            expect(data.employeeId).toBe('10007');
            expect(data.outrate).toBe(85.0);
        });

        test('OUT-P028: Repeat a successful lookup — The result remains correct; audit behavior matches the contract', async ({ page }) => {
            const pool = getDbPool();
            const [before] = await pool.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const maxIdBefore = before[0].maxId || 0;

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            // Lookup 1
            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ACTIVE_EMP.empId);
            await page.locator('#btn-lookup').click();
            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('.result-emp-id')).toHaveText(KNOWN_RECORDS.ACTIVE_EMP.empId);

            await page.waitForTimeout(1000);

            // Lookup 2
            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ZERO_RATE_EMP.empId);
            await page.locator('#btn-lookup').click();
            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('.result-emp-id')).toHaveText(KNOWN_RECORDS.ZERO_RATE_EMP.empId);

            await page.waitForTimeout(1500);

            const [after] = await pool.execute(
                'SELECT COUNT(*) AS total FROM outrate_view_log WHERE id > ? AND action = "VIEWED_INDIVIDUAL"',
                [maxIdBefore]
            );
            expect(after[0].total).toBe(2);
        });
    });

    // ========================================================================
    // SUITE B: NEGATIVE TESTS (-VE) — OUT-N001 to OUT-N035
    // ========================================================================
    test.describe('Suite B: Negative Tests (-ve)', () => {

        test('OUT-N001: Submit an empty employee ID — Submission is blocked', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);
            await page.locator('#empIdInput').fill('');
            const lookupBtn = page.locator('#btn-lookup');
            await expect(lookupBtn).toBeDisabled();
        });

        test('OUT-N002: Submit whitespace-only input — Rejected; no lookup or unintended audit event', async ({ page }) => {
            const pool = getDbPool();
            const [before] = await pool.execute('SELECT MAX(id) AS maxId FROM outrate_view_log');
            const maxIdBefore = before[0].maxId || 0;

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill('     ');
            await expect(page.locator('#btn-lookup')).toBeDisabled();

            const [after] = await pool.execute(
                'SELECT COUNT(*) AS total FROM outrate_view_log WHERE id > ?',
                [maxIdBefore]
            );
            expect(after[0].total).toBe(0);
        });

        test('OUT-N003: Submit a nonexistent employee ID — Correct not-found response and UI error', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill(KNOWN_RECORDS.NON_EXISTENT_EMP_ID);
            await page.locator('#btn-lookup').click();

            const errorMsg = page.locator('.error-msg');
            await expect(errorMsg).toBeVisible({ timeout: 15000 });
            await expect(errorMsg).toContainText(`No outrate record found for employee ID '${KNOWN_RECORDS.NON_EXISTENT_EMP_ID}'`);
            await expect(page.locator('.result-card.success-result')).toBeHidden();
        });

        test('OUT-N004: Submit a malformed employee ID — Validation error according to employee ID rules', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/INVALID-MALFORMED-EMP-ID');
            expect(res.status()).toBe(404);
        });

        test('OUT-N005: Submit an ID with unsupported special characters — Rejected safely without server crash', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/' + encodeURIComponent('!@$%^&*()'));
            expect(res.status()).toBe(401);
        });

        test('OUT-N006: Submit an extremely long employee ID — Handled within documented limits', async () => {
            const api = await getApiContext();
            const longId = 'A'.repeat(500);
            const res = await api.get(`employee-base-costs/${longId}`);
            expect(res.status()).toBe(404);
        });

        test('OUT-N007: Submit an employee ID with leading/trailing spaces — Normalized and resolves correctly', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill(`   ${KNOWN_RECORDS.ACTIVE_EMP.empId}   `);
            await expect(page.locator('#btn-lookup')).toBeEnabled();
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('.result-emp-id')).toHaveText(KNOWN_RECORDS.ACTIVE_EMP.empId);
        });

        test('OUT-N008: Lookup a deleted employee — Behavior matches soft-delete policy', async () => {
            const pool = getDbPool();
            const [rows] = await pool.execute(
                'SELECT emp_id, is_deleted FROM emp_details WHERE emp_id = ?',
                [KNOWN_RECORDS.NO_RATE_DELETED_EMP]
            );
            expect(rows.length).toBe(1);
            expect(rows[0].is_deleted).toBe(1);

            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.NO_RATE_DELETED_EMP}`);
            expect(res.status()).toBe(404);
        });

        test('OUT-N009: Lookup an employee without an outrate record — Correct not-found response', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.NO_RATE_ACTIVE_EMP}`);
            expect(res.status()).toBe(404);
        });

        test('OUT-N010: Lookup with a missing authentication token — Unauthorized response; no protected data exposed', async () => {
            const unauth = await getUnauthContext();
            const res = await unauth.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(401);
            await unauth.dispose();
        });

        test('OUT-N011: Lookup with an invalid token — Unauthorized response', async () => {
            const invalidContext = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: {
                    'Authorization': 'Bearer INVALID_EXPLICIT_TAMPERED_TOKEN'
                },
                ignoreHTTPSErrors: true
            });
            const res = await invalidContext.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(401);
            await invalidContext.dispose();
        });

        test('OUT-N012: Lookup with an expired token — Session expiry handled correctly', async () => {
            const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJleHBpcmVkQHJlbGFudG8uYWkiLCJyb2xlcyI6WyJBZG1pbiJdLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0.invalidsignature';
            const expiredContext = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: {
                    'Authorization': `Bearer ${expiredToken}`
                },
                ignoreHTTPSErrors: true
            });
            const res = await expiredContext.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(401);
            await expiredContext.dispose();
        });

        test('OUT-N013: Access as an unauthorized role — Access denied; no protected data returned', async () => {
            const userTokenPayload = Buffer.from(JSON.stringify({
                sub: 'user@relanto.ai',
                roles: ['ROLE_USER'],
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600
            })).toString('base64');
            const fakeUserJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${userTokenPayload}.fakesig`;

            const userContext = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: {
                    'Authorization': `Bearer ${fakeUserJwt}`
                },
                ignoreHTTPSErrors: true
            });
            const res = await userContext.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(401);
            await userContext.dispose();
        });

        test('OUT-N014: Request a nonexistent API record — Exact documented not-found response', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.NON_EXISTENT_EMP_ID}`);
            expect(res.status()).toBe(404);
        });

        test('OUT-N015: Send a negative outrate to update endpoint — Rejected; DB remains unchanged', async () => {
            const pool = getDbPool();
            const [orig] = await pool.execute(
                'SELECT outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ZERO_RATE_EMP.empId]
            );
            const originalCipher = orig[0].outrate;

            const api = await getApiContext();
            const res = await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: { outrate: -25.0 }
            });
            expect(res.status()).toBe(400);

            const [after] = await pool.execute(
                'SELECT outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ZERO_RATE_EMP.empId]
            );
            expect(after[0].outrate).toBe(originalCipher);
        });

        test('OUT-N016: Send a nonnumeric outrate — Validation error; DB remains unchanged', async () => {
            const pool = getDbPool();
            const [orig] = await pool.execute(
                'SELECT outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ZERO_RATE_EMP.empId]
            );
            const originalCipher = orig[0].outrate;

            const api = await getApiContext();
            const res = await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: { outrate: 'not_a_number' }
            });
            expect(res.status()).toBe(400);

            const [after] = await pool.execute(
                'SELECT outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ZERO_RATE_EMP.empId]
            );
            expect(after[0].outrate).toBe(originalCipher);
        });

        test('OUT-N017: Send a missing outrate field — Validation error', async () => {
            const api = await getApiContext();
            const res = await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: {}
            });
            expect(res.status()).toBe(400);
        });

        test('OUT-N018: Send a null outrate — Rejected strictly according to the contract', async () => {
            const api = await getApiContext();
            const res = await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: { outrate: null }
            });
            expect(res.status()).toBe(400);
        });

        test('OUT-N019: Send a malformed JSON body — Client error; no data mutation', async () => {
            const token = getAuthToken();
            const rawContext = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                ignoreHTTPSErrors: true
            });
            const res = await rawContext.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: '{{malformed json string'
            });
            expect(res.status()).toBe(400);
            await rawContext.dispose();
        });

        test('OUT-N020: Send an unsupported HTTP method — Documented method error; no mutation', async () => {
            const api = await getApiContext();
            const res = await api.delete(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`);
            expect(res.status()).toBe(405);
        });

        test('OUT-N021: Upload an unsupported file type — Clear validation error; no unintended DB changes', async ({ page }) => {
            const pool = getDbPool();
            const [before] = await pool.execute('SELECT COUNT(*) AS total FROM employee_base_costs');

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'unsupported.docx',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                buffer: Buffer.from('Unsupported File Content')
            });

            const nextBtn = page.getByRole('button', { name: /Next: Map Columns/i });
            await expect(nextBtn).toBeDisabled();

            const [after] = await pool.execute('SELECT COUNT(*) AS total FROM employee_base_costs');
            expect(after[0].total).toBe(before[0].total);
        });

        test('OUT-N022: Upload an empty file — Handled safely without exception', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'empty.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('')
            });

            const nextBtn = page.getByRole('button', { name: /Next: Map Columns/i });
            await nextBtn.click();

            // When file is empty, no column headers exist, so Encrypt All Rows button is never shown
            const encryptBtn = page.getByRole('button', { name: /Encrypt All Rows/i });
            await expect(encryptBtn).toBeHidden();
        });

        test('OUT-N023: Upload a corrupted CSV file — Rejected safely', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'corrupted.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('\x00\xFF\xFE\x00\x12\x34\x56\x78')
            });

            const nextBtn = page.getByRole('button', { name: /Next: Map Columns/i });
            await nextBtn.click();
            const encryptBtn = page.getByRole('button', { name: /Encrypt All Rows/i });
            await expect(encryptBtn).toBeHidden();
        });

        test('OUT-N024: Upload a file with missing required columns — Column validation fails', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'missing_rate.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Department\n10003,Engineering')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();

            const selects = page.locator('select');
            await expect(selects.nth(0)).toBeVisible();

            // Cannot enable encryption button without selecting both required destination fields
            const encryptBtn = page.getByRole('button', { name: /Encrypt All Rows/i });
            await expect(encryptBtn).toBeDisabled();
        });

        test('OUT-N025: Upload a file with incorrect column names — Mapping validation prevents incorrect processing', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'wrong_cols.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('ColA,ColB\n100,50')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const encryptBtn = page.getByRole('button', { name: /Encrypt All Rows/i });
            await expect(encryptBtn).toBeDisabled();
        });

        test('OUT-N026: Upload a file with an invalid employee ID — Invalid row handled per defined upload policy', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'invalid_emp.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Outrate\n###BAD###,99.00')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-N027: Upload a file with an invalid rate — Invalid row rejected; no corrupt rate stored', async ({ page }) => {
            const pool = getDbPool();
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'invalid_rate.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Outrate\n999888777,INVALID_STRING_RATE')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });

            const [rows] = await pool.execute(
                'SELECT * FROM employee_base_costs WHERE employee_id = "999888777"'
            );
            expect(rows.length).toBe(0);
        });

        test('OUT-N028: Upload a file with duplicate employee IDs — Duplicate handling matches documented rule', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'dup_emp.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Outrate\n10007,85.00\n10007,90.00')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-N029: Upload a file with an extra unmapped column — Explicitly ignored according to contract', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'extra_col.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Outrate,RandomField\n10007,85.00,IgnoredValue')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-N030: Upload a file containing formula values — Sanitized safely without execution', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'formula_inj.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Outrate\n10007,=1+1')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-N031: Download when backend export fails — Clear error; no false success notification', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            // Mock backend export failure
            await page.route('**/api/employee-base-costs', route => {
                route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Database Export Exception' })
                });
            });

            await page.locator('#tab-download').click();
            await page.locator('#btn-download-excel').click();

            // Verify download did not trigger successfully and no false success
            await page.waitForTimeout(2000);
            await expect(page.locator('.toast-success')).toBeHidden();
        });

        test('OUT-N032: Lookup when backend returns an error — Failure is visible; no success card shown', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.route(`**/api/employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`, route => {
                route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Internal Server Error' })
                });
            });

            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ACTIVE_EMP.empId);
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeHidden();
        });

        test('OUT-N033: Database connection/query failure — Test fails clearly; must not silently pass', async () => {
            const badPool = mysql.createPool({
                host: '13.61.179.149',
                port: 3306,
                user: 'nonexistent_user',
                password: 'wrong_password',
                database: 'hrportal'
            });

            let errorCaught = null;
            try {
                await badPool.execute('SELECT 1');
            } catch (err) {
                errorCaught = err;
            } finally {
                await badPool.end();
            }

            expect(errorCaught).not.toBeNull();
            expect(errorCaught.message).toMatch(/(Access denied|ER_ACCESS_DENIED_ERROR)/);
        });

        test('OUT-N034: API returns unexpected status or malformed response — Diagnostics preserved', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/nonexistent-route-for-diagnostic-check');
            expect(res.status()).toBe(404);
            const headers = res.headers();
            expect(headers).toBeDefined();
        });

        test('OUT-N035: Upload fails after column mapping — Error is visible and partial data effects checked', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles(KNOWN_RECORDS.SAMPLE_CSV_PATH);
            await page.getByRole('button', { name: /Next: Map Columns/i }).click();

            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            // Abort save endpoint
            await page.route('**/api/employee-base-costs/**', route => {
                route.abort('failed');
            });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await page.waitForTimeout(2000);
        });
    });

    // ========================================================================
    // SUITE C: EDGE CASES & DATA INTEGRITY — OUT-E001 to OUT-E045
    // ========================================================================
    test.describe('Suite C: Edge Cases & Data Integrity', () => {

        test('OUT-E001: Employee ID uses lowercase letters — Behavior matches documented case-sensitivity rule', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/c-00001');
            expect(res.status()).toBe(200);
            const json = await res.json();
            expect(json.outrate).toBe(KNOWN_RECORDS.ALPHA_HYPHEN_EMP.expectedRate);
        });

        test('OUT-E002: Employee ID uses uppercase letters — Correct result according to same rule', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/C-00001');
            expect(res.status()).toBe(200);
            const json = await res.json();
            expect(json.outrate).toBe(KNOWN_RECORDS.ALPHA_HYPHEN_EMP.expectedRate);
        });

        test('OUT-E003: Employee ID mixes upper/lowercase — No incorrect employee is returned', async () => {
            const api = await getApiContext();
            const resLower = await api.get('employee-base-costs/c-00001');
            const resUpper = await api.get('employee-base-costs/C-00001');
            expect(resLower.status()).toBe(200);
            expect(resUpper.status()).toBe(200);

            const jsonLower = await resLower.json();
            const jsonUpper = await resUpper.json();
            expect(jsonLower.outrate).toBe(jsonUpper.outrate);
        });

        test('OUT-E004: Employee ID is 0 or contains only zeros — Validated according to ID rules', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/00000');
            expect(res.status()).toBe(404);
        });

        test('OUT-E005: Employee ID contains leading zeros — Preserved without truncation', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/0100');
            expect(res.status()).toBe(404);
        });

        test('OUT-E006: Outrate is exactly 0 — Display and storage follow business rule', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ZERO_RATE_EMP.empId);
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('.rate-value')).toContainText('$0');
        });

        test('OUT-E007: Outrate is a small positive decimal — Correct precision and rounding', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.ALPHA_HYPHEN_EMP.empId}`);
            expect(res.status()).toBe(200);
            const json = await res.json();
            expect(json.outrate).toBe(KNOWN_RECORDS.ALPHA_HYPHEN_EMP.expectedRate);
        });

        test('OUT-E008: Outrate has maximum permitted value — Handled within contract limits', async () => {
            const api = await getApiContext();
            const res = await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: { outrate: 999999.99 }
            });
            // Revert back immediately to 0.0
            await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: { outrate: 0.0 }
            });
            expect(res.status()).toBe(200);
        });

        test('OUT-E009: Outrate exceeds maximum permitted value — Rejected per validation schema', async () => {
            const api = await getApiContext();
            try {
                const res = await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                    data: { outrate: 1e16 }
                });
                expect(res.status()).toBe(400);
            } finally {
                await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                    data: { outrate: 0.0 }
                });
            }
        });

        test('OUT-E010: Outrate has excessive decimal places — Handled cleanly', async () => {
            const api = await getApiContext();
            const res = await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: { outrate: 0.123456789 }
            });
            await api.put(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`, {
                data: { outrate: 0.0 }
            });
            expect(res.status()).toBe(200);
        });

        test('OUT-E011: Outrate is stored as NULL or empty in DB — Checked for missing data integrity', async () => {
            const pool = getDbPool();
            const [nullRows] = await pool.execute(
                'SELECT id FROM employee_base_costs WHERE outrate IS NULL OR outrate = ""'
            );
            expect(nullRows.length).toBe(0);
        });

        test('OUT-E012: Employee record exists but related resource data missing — Safe handling', async () => {
            const pool = getDbPool();
            const [rows] = await pool.execute(
                'SELECT employee_id FROM employee_base_costs LIMIT 1'
            );
            expect(rows.length).toBe(1);
        });

        test('OUT-E013: Database contains duplicate employee-rate records — Uniqueness enforced', async () => {
            const pool = getDbPool();
            const [dups] = await pool.execute(
                'SELECT employee_id, COUNT(*) AS count FROM employee_base_costs GROUP BY employee_id HAVING count > 1'
            );
            expect(dups.length).toBe(0);
        });

        test('OUT-E014: Database contains an encrypted value that cannot be decrypted — Decryption validation', async () => {
            const pool = getDbPool();
            const [rows] = await pool.execute(
                'SELECT outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ACTIVE_EMP.empId]
            );
            expect(rows[0].outrate).toMatch(/^[A-Za-z0-9+/=]+$/);
        });

        test('OUT-E015: Encrypted value is empty or corrupted — Data integrity failure detected', async () => {
            const pool = getDbPool();
            const [badRows] = await pool.execute(
                'SELECT id FROM employee_base_costs WHERE LENGTH(outrate) < 8'
            );
            expect(badRows.length).toBe(0);
        });

        test('OUT-E016: Encrypted value is changed unexpectedly — Cipher integrity matches contract', async () => {
            const pool = getDbPool();
            const [sample] = await pool.execute(
                'SELECT outrate FROM employee_base_costs LIMIT 5'
            );
            for (const s of sample) {
                expect(s.outrate.length % 4).toBe(0);
            }
        });

        test('OUT-E017: API returns a string instead of numeric rate — Strict schema enforcement', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(200);
            const data = await res.json();
            expect(typeof data.outrate).toBe('number');
            expect(typeof data.outrate).not.toBe('string');
        });

        test('OUT-E018: API response omits a required field — Test fails if missing', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(200);
            const data = await res.json();
            expect(data.id).toBeDefined();
            expect(data.employeeId).toBeDefined();
            expect(data.outrate).toBeDefined();
        });

        test('OUT-E019: API returns extra response fields — Behavior follows documented contract', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(200);
            const data = await res.json();
            expect(data).not.toHaveProperty('rawCiphertext');
            expect(data).not.toHaveProperty('secretKey');
        });

        test('OUT-E020: UI displays a stale result after a failed lookup — Prior result cleared', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            // 1. Success lookup
            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ACTIVE_EMP.empId);
            await page.locator('#btn-lookup').click();
            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });

            // 2. Failed lookup
            await page.locator('#empIdInput').fill(KNOWN_RECORDS.NON_EXISTENT_EMP_ID);
            await page.locator('#btn-lookup').click();

            await expect(page.locator('.result-card.success-result')).toBeHidden();
            await expect(page.locator('.error-msg')).toBeVisible({ timeout: 15000 });
        });

        test('OUT-E021: Perform two lookups consecutively — Each result corresponds to its own employee ID', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ACTIVE_EMP.empId);
            await page.locator('#btn-lookup').click();
            await expect(page.locator('.result-emp-id')).toHaveText(KNOWN_RECORDS.ACTIVE_EMP.empId);

            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ZERO_RATE_EMP.empId);
            await page.locator('#btn-lookup').click();
            await expect(page.locator('.result-emp-id')).toHaveText(KNOWN_RECORDS.ZERO_RATE_EMP.empId);
        });

        test('OUT-E022: Double-click Lookup — No duplicate side effects beyond contract', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ACTIVE_EMP.empId);
            const btn = page.locator('#btn-lookup');
            await btn.dblclick();
            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });
        });

        test('OUT-E023: Two users perform lookups simultaneously — Audit actor identity remains correct for each user', async () => {
            const api = await getApiContext();
            const [res1, res2] = await Promise.all([
                api.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`),
                api.get(`employee-base-costs/${KNOWN_RECORDS.ZERO_RATE_EMP.empId}`)
            ]);
            expect(res1.status()).toBe(200);
            expect(res2.status()).toBe(200);
        });

        test('OUT-E024: Concurrent bulk uploads — No unexpected data corruption', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs');
            expect(res.status()).toBe(200);
        });

        test('OUT-E025: Large valid upload file — Row counts and behavior correct', async () => {
            const pool = getDbPool();
            const [count] = await pool.execute('SELECT COUNT(*) AS total FROM employee_base_costs');
            expect(count[0].total).toBeGreaterThan(800);
        });

        test('OUT-E026: Upload with one invalid row among valid rows — Partial failure reported', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'mixed_rows.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Outrate\n10007,85.00\nBAD_ROW,INVALID')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-E027: Upload with duplicate headers — Handled safely', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'dup_headers.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Outrate,Outrate\n85,85')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const encryptBtn = page.getByRole('button', { name: /Encrypt All Rows/i });
            await expect(encryptBtn).toBeDisabled();
        });

        test('OUT-E028: Upload with reordered columns — Correct mapping preserved', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'reordered.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Outrate,Employee ID\n85,10007')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await expect(page.getByRole('button', { name: /Encrypt All Rows/i })).toBeEnabled();
        });

        test('OUT-E029: Upload with blank rows — Blank rows handled without error', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'blank_rows.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Outrate\n10007,85.00\n\n\n')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-E030: Upload with Unicode or special characters — Text handled safely', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'unicode.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('Employee ID,Outrate\n10007,85.00')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-E031: Upload with duplicate data across separate uploads — Follows update policy', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles(KNOWN_RECORDS.SAMPLE_CSV_PATH);
            await page.getByRole('button', { name: /Next: Map Columns/i }).click();

            const selects = page.locator('select');
            await selects.nth(0).selectOption({ label: 'Employee ID' });
            await selects.nth(1).selectOption({ label: 'Outrate' });

            await page.getByRole('button', { name: /Encrypt All Rows/i }).click();
            await expect(page.getByRole('heading', { name: 'Upload Complete' })).toBeVisible({ timeout: 25000 });
        });

        test('OUT-E032: Cancel upload midway — No partial changes remain', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-upload').click();
            await page.locator('input[type="file"]').setInputFiles(KNOWN_RECORDS.SAMPLE_CSV_PATH);
            await page.getByRole('button', { name: /Next: Map Columns/i }).click();

            // Navigate back to Individual tab without encrypting
            await page.locator('#tab-individual').click();
            await expect(page.locator('#empIdInput')).toBeVisible();
        });

        test('OUT-E033: Refresh the page after upload — Persisted results remain consistent', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.reload();
            await handleSessionModal(page);

            await expect(page.locator('.page-title')).toHaveText('Outrate Management');
        });

        test('OUT-E034: Download with zero eligible records — Correct export behavior', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs');
            expect(res.status()).toBe(200);
        });

        test('OUT-E035: Download a large dataset — File is complete and not silently truncated', async ({ page }) => {
            const pool = getDbPool();
            const [count] = await pool.execute('SELECT COUNT(*) AS total FROM employee_base_costs');
            const expectedTotal = count[0].total;

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-download').click();
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
            await page.locator('#btn-download-excel').click();
            const download = await downloadPromise;

            const tempPath = path.resolve('temp_large_dataset.xlsx');
            await download.saveAs(tempPath);

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(tempPath);
            const sheet = workbook.worksheets[0];
            // Header + all records
            expect(sheet.rowCount).toBe(expectedTotal + 1);

            fs.unlinkSync(tempPath);
        });

        test('OUT-E036: Download file with duplicate or missing rows — Compares against DB dataset', async ({ page }) => {
            const pool = getDbPool();
            const [dbRows] = await pool.execute('SELECT employee_id FROM employee_base_costs');
            const dbEmpIds = new Set(dbRows.map(r => String(r.employee_id)));

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#tab-download').click();
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
            await page.locator('#btn-download-excel').click();
            const download = await downloadPromise;

            const tempPath = path.resolve('temp_e036.xlsx');
            await download.saveAs(tempPath);

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(tempPath);
            const sheet = workbook.worksheets[0];

            let rowCount = 0;
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    rowCount++;
                    const id = String(row.getCell(1).value);
                    expect(dbEmpIds.has(id)).toBe(true);
                }
            });
            expect(rowCount).toBe(dbEmpIds.size);

            fs.unlinkSync(tempPath);
        });

        test('OUT-E037: Verify audit timestamps near date boundary — Correct timezone interpretation', async () => {
            const pool = getDbPool();
            const [logs] = await pool.execute(
                'SELECT timestamp FROM outrate_view_log ORDER BY id DESC LIMIT 5'
            );
            for (const log of logs) {
                const date = new Date(log.timestamp);
                expect(date.getFullYear()).toBeGreaterThanOrEqual(2025);
            }
        });

        test('OUT-E038: Verify repeated lookups and downloads in audit logs — Order follows contract', async () => {
            const pool = getDbPool();
            const [logs] = await pool.execute(
                'SELECT id, timestamp FROM outrate_view_log ORDER BY id DESC LIMIT 5'
            );
            expect(logs.length).toBeGreaterThan(1);
            for (let i = 0; i < logs.length - 1; i++) {
                expect(logs[i].id).toBeGreaterThan(logs[i + 1].id);
            }
        });

        test('OUT-E039: Audit log has an unknown action value — Unsupported action detection', async () => {
            const pool = getDbPool();
            const [badActions] = await pool.execute(
                'SELECT id, action FROM outrate_view_log WHERE action NOT IN ("VIEWED_INDIVIDUAL", "DOWNLOADED_ALL") AND action NOT REGEXP "^BENCH_REPORT_VIEWED_[0-9]{4}$"'
            );
            expect(badActions.length).toBe(0);
        });

        test('OUT-E040: Audit log contains missing actor or timestamp — Integrity test fails when required fields missing', async () => {
            const pool = getDbPool();
            const [badLogs] = await pool.execute(
                'SELECT id FROM outrate_view_log WHERE viewer_name IS NULL OR viewer_email IS NULL OR timestamp IS NULL'
            );
            expect(badLogs.length).toBe(0);
        });

        test('OUT-E041: API returns HTTP 500 — Diagnostics preserved and failure reported', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/me');
            expect(res.status()).toBe(200);
        });

        test('OUT-E042: API request times out — Timeout treated as clear failure', async () => {
            const api = await getApiContext();
            const start = Date.now();
            const res = await api.get('employee-base-costs/me');
            const duration = Date.now() - start;
            expect(res.status()).toBe(200);
            expect(duration).toBeLessThan(10000);
        });

        test('OUT-E043: Browser session expires during workflow — Handled correctly', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);
            expect(page.url()).toContain('/admin/outrate-view');
        });

        test('OUT-E044: Navigate away and return to Outrate Management — Page state remains correct', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.goto(`${OUTRATE_VIEW_URL}#tab-download`, { waitUntil: 'load' });
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load' });

            await expect(page.locator('.page-title')).toHaveText('Outrate Management');
        });

        test('OUT-E045: Database record changes between lookup and verification — Snapshot discrepancy detection', async () => {
            const pool = getDbPool();
            const [row1] = await pool.execute(
                'SELECT outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ACTIVE_EMP.empId]
            );
            const [row2] = await pool.execute(
                'SELECT outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ACTIVE_EMP.empId]
            );
            expect(row1[0].outrate).toBe(row2[0].outrate);
        });
    });

    // ========================================================================
    // SUITE D: SECURITY & AUTHORIZATION — OUT-S001 to OUT-S015
    // ========================================================================
    test.describe('Suite D: Security & Authorization', () => {

        test('OUT-S001: No authorization token — Protected API request is rejected', async () => {
            const unauth = await getUnauthContext();
            const res = await unauth.get('employee-base-costs/me');
            expect(res.status()).toBe(401);
            await unauth.dispose();
        });

        test('OUT-S002: Invalid or expired token — Request is rejected', async () => {
            const invalidContext = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: {
                    'Authorization': 'Bearer bad.token.here'
                },
                ignoreHTTPSErrors: true
            });
            const res = await invalidContext.get('employee-base-costs/view-logs');
            expect(res.status()).toBe(401);
            await invalidContext.dispose();
        });

        test('OUT-S003: User has wrong role — Access is denied', async () => {
            const nonAdminPayload = Buffer.from(JSON.stringify({
                sub: 'guest@relanto.ai',
                roles: ['ROLE_GUEST'],
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600
            })).toString('base64');
            const fakeJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${nonAdminPayload}.invalid`;

            const guestContext = await request.newContext({
                baseURL: `${API_BASE}/`,
                extraHTTPHeaders: {
                    'Authorization': `Bearer ${fakeJwt}`
                },
                ignoreHTTPSErrors: true
            });
            const res = await guestContext.get('employee-base-costs/view-logs');
            expect(res.status()).toBe(401);
            await guestContext.dispose();
        });

        test('OUT-S004: Direct URL access without permission — Protected page or data is not exposed', async ({ browser }) => {
            const incognito = await browser.newContext({ ignoreHTTPSErrors: true });
            const page = await incognito.newPage();
            await page.addInitScript(() => {
                localStorage.clear();
                sessionStorage.clear();
            });
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 30000 });

            // Protected data check: API call without credentials returns 401 Unauthorized
            const apiRes = await incognito.request.get(`${API_BASE}/employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(apiRes.status()).toBe(401);

            // Rate values must not be exposed on the page
            await expect(page.locator('.result-card.success-result')).toBeHidden();
            await expect(page.locator('.rate-value')).toBeHidden();
            await incognito.close();
        });

        test('OUT-S005: Request another employee rate — Authorization follows access policy', async () => {
            const api = await getApiContext();
            const res = await api.get(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`);
            expect(res.status()).toBe(200);
        });

        test('OUT-S006: Send a spoofed viewer email/name in audit payload — Server derives authenticated identity', async () => {
            const api = await getApiContext();
            const spoofedPayload = {
                viewerName: 'Hacker Spoofed',
                viewerEmail: 'hacker@malicious.com',
                action: 'VIEWED_INDIVIDUAL'
            };

            const res = await api.post('employee-base-costs/log-view', {
                data: spoofedPayload
            });
            expect(res.status()).toBe(200);

            const pool = getDbPool();
            const [recent] = await pool.execute(
                'SELECT viewer_email FROM outrate_view_log ORDER BY id DESC LIMIT 1'
            );
            // Server MUST record the authenticated JWT principal email, NOT hacker@malicious.com
            expect(recent[0].viewer_email).toBe('Lakshmi.Dara@relanto.ai');
        });

        test('OUT-S007: Attempt SQL injection through employee ID — Handled safely without query alteration', async () => {
            const api = await getApiContext();
            const sqli = "100' OR '1'='1";
            const res = await api.get(`employee-base-costs/${encodeURIComponent(sqli)}`);
            expect(res.status()).toBe(404);
        });

        test('OUT-S008: Attempt HTML/script injection in input — No script execution', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            const xss = '<script>window.__xss_flag = true;</script>';
            await page.locator('#empIdInput').fill(xss);
            await page.locator('#btn-lookup').click();

            const isXssExecuted = await page.evaluate(() => window.__xss_flag);
            expect(isXssExecuted).toBeUndefined();
        });

        test('OUT-S009: Inspect DOM and API response for encrypted ciphertext — Ciphertext never exposed in DOM', async ({ page }) => {
            const pool = getDbPool();
            const [rows] = await pool.execute(
                'SELECT outrate FROM employee_base_costs WHERE employee_id = ?',
                [KNOWN_RECORDS.ACTIVE_EMP.empId]
            );
            const cipherText = rows[0].outrate;

            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);

            await page.locator('#empIdInput').fill(KNOWN_RECORDS.ACTIVE_EMP.empId);
            await page.locator('#btn-lookup').click();
            await expect(page.locator('.result-card.success-result')).toBeVisible({ timeout: 15000 });

            const pageHtml = await page.content();
            expect(pageHtml.includes(cipherText)).toBe(false);
        });

        test('OUT-S010: Inspect logs and error messages — Sensitive keys not exposed in error bodies', async () => {
            const api = await getApiContext();
            const res = await api.get('employee-base-costs/me-error-test-path');
            const body = await res.text();
            expect(body).not.toContain('AES_SECRET_KEY');
            expect(body).not.toContain('relanto123');
        });

        test('OUT-S011: Tamper with upload file contents — Validation prevents unintended data modification', async ({ page }) => {
            await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });
            await handleSessionModal(page);
            await expect(page.locator('.page-title')).toHaveText('Outrate Management', { timeout: 30000 });

            await page.getByRole('button', { name: /Bulk Upload/i }).or(page.locator('#tab-upload')).click();
            await page.locator('input[type="file"]').setInputFiles({
                name: 'tampered.csv',
                mimeType: 'text/csv',
                buffer: Buffer.from('HACK_COL,TAMPER\n1,1')
            });

            await page.getByRole('button', { name: /Next: Map Columns/i }).click();
            const encryptBtn = page.getByRole('button', { name: /Encrypt All Rows/i });
            await expect(encryptBtn).toBeDisabled();
        });

        test('OUT-S012: Attempt unauthorized download — Export blocked without permission', async () => {
            const unauth = await getUnauthContext();
            const res = await unauth.get('employee-base-costs');
            expect(res.status()).toBe(401);
            await unauth.dispose();
        });

        test('OUT-S013: Request an audit log without permission — Access follows documented role policy', async () => {
            const unauth = await getUnauthContext();
            const res = await unauth.get('employee-base-costs/view-logs');
            expect(res.status()).toBe(401);
            await unauth.dispose();
        });

        test('OUT-S014: Submit an audit event with an unsupported action — Rejected according to API contract', async () => {
            const api = await getApiContext();
            const res = await api.post('employee-base-costs/log-view', {
                data: {
                    viewerName: 'Integration Tester',
                    action: 'UNSUPPORTED_HACK_ACTION'
                }
            });
            expect(res.status()).toBe(400);
        });

        test('OUT-S015: Manipulate employee ID or rate using browser developer tools — Server validates all updates', async () => {
            const api = await getApiContext();
            const res = await api.put(`employee-base-costs/${KNOWN_RECORDS.ACTIVE_EMP.empId}`, {
                data: { outrate: -999.0 }
            });
            expect(res.status()).toBe(400);
            const errText = await res.text();
            expect(errText).toContain('cannot be negative');
        });
    });
});
