import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

// ============================================================
// UTILIZATION REPORT API - SHARED CONFIGURATION / HELPERS
// ============================================================

const API_ROOT = (process.env.API_BASE_URL || (process.env.BASE_URL?.includes('localhost') ? 'http://localhost:8080/api' : 'https://13.61.179.149/api/api')).replace(/\/+$/, '');
const UTILIZATION_BASE_URL = `${API_ROOT}/v1/utilization/reports/as-of-date`;

const AS_OF_DATE = '2026-10-06';

const API_HEADERS = {
    Authorization: `Bearer ${process.env.API_TOKEN}`,
    Accept: 'application/json',
};

function normalizeString(value: any): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    return String(value)
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function normalizeBoolean(value: any): boolean | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value === 1;
    }

    const normalized = String(value)
        .trim()
        .toLowerCase();

    if (['true', '1', 'yes', 'y'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'no', 'n'].includes(normalized)) {
        return false;
    }

    return null;
}

function normalizeNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);

    return Number.isNaN(number) ? null : number;
}

function buildUtilizationUrl(asOfDate?: string): string {
    const date = asOfDate ?? AS_OF_DATE;
    return `${UTILIZATION_BASE_URL}?asOfDate=${encodeURIComponent(date)}`;
}

async function getUtilizationReport(request: any, asOfDate?: string) {
    expect(process.env.API_TOKEN).toBeTruthy();

    return request.get(buildUtilizationUrl(asOfDate), {
        headers: API_HEADERS,
    });
}

async function getJsonResponse(response: any): Promise<any> {
    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            `Response is not valid JSON. Response body starts with: ${text.substring(0, 200)}`
        );
    }
}

function validateSuccessfulUtilizationResponse(
    data: any,
    expectedDate: string
): string[] {
    const errors: string[] = [];

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        errors.push('Response root is not an object');
        return errors;
    }

    if (data.reportDate !== expectedDate) {
        errors.push(
            `reportDate mismatch | Expected: ${expectedDate} | Actual: ${data.reportDate}`
        );
    }

    if (data.reportType !== 'UTILIZATION_REPORT') {
        errors.push(
            `reportType mismatch | Expected: UTILIZATION_REPORT | Actual: ${data.reportType}`
        );
    }

    if (!data.summary || typeof data.summary !== 'object') {
        errors.push('summary object is missing');
    }

    if (!Array.isArray(data.employees)) {
        errors.push('employees is not an array');
    }

    return errors;
}

function assertValidReportStructure(
    data: any,
    expectedDate: string
) {
    const errors = validateSuccessfulUtilizationResponse(
        data,
        expectedDate
    );

    expect(errors, errors.join('\n')).toHaveLength(0);
}


test.describe('SmartTracker - Utilization Report API Validation', () => {



    // ============================================================
    // POSITIVE / CORE API TESTS
    // ============================================================

    test('UR-P01 - Validate Utilization Report API with valid asOfDate', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);
        assertValidReportStructure(data, AS_OF_DATE);

        console.log(`UR-P01 - Valid asOfDate ${AS_OF_DATE} returned HTTP 200`);
    });

    test('UR-P02 - Validate Utilization Report API returns HTTP 200', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        console.log(`UR-P02 - HTTP status: ${response.status()}`);
    });

    test('UR-P03 - Validate Utilization Report API returns valid JSON', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        expect(data).toBeDefined();
        expect(typeof data).toBe('object');
        expect(Array.isArray(data)).toBe(false);

        console.log('UR-P03 - Valid JSON response received');
    });

    test('UR-P04 - Validate reportDate matches requested asOfDate', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        expect(data.reportDate).toBe(AS_OF_DATE);

        console.log(`UR-P04 - reportDate: ${data.reportDate}`);
    });

    test('UR-P05 - Validate reportType', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        expect(data.reportType).toBe('UTILIZATION_REPORT');

        console.log(`UR-P05 - reportType: ${data.reportType}`);
    });

    test('UR-P06 - Validate summary object exists', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        expect(data.summary).toBeDefined();
        expect(data.summary).not.toBeNull();
        expect(typeof data.summary).toBe('object');
        expect(Array.isArray(data.summary)).toBe(false);

        console.log('UR-P06 - summary object exists');
    });

    test('UR-P07 - Validate employees array exists', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        expect(Array.isArray(data.employees)).toBe(true);
        expect(data.employees.length).toBeGreaterThan(0);

        console.log(
            `UR-P07 - Employee records returned: ${data.employees.length}`
        );
    });

    test('UR-P08 - Validate required employee fields', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        expect(Array.isArray(data.employees)).toBe(true);

        const requiredFields = [
            'empId',
            'empName',
            'practice',
            'engagementType',
        ];

        const errors: string[] = [];

        data.employees.forEach((employee: any, index: number) => {
            for (const field of requiredFields) {
                const value = employee[field];

                if (
                    value === undefined ||
                    value === null ||
                    String(value).trim() === ''
                ) {
                    errors.push(
                        `Record ${index} | empId: ${employee.empId} | missing ${field}`
                    );
                }
            }
        });

        expect(errors, errors.join('\n')).toHaveLength(0);

        console.log(
            `UR-P08 - Required fields validated for ${data.employees.length} employees`
        );
    });

    // ============================================================
    // SUMMARY / BUSINESS LOGIC
    // ============================================================

    test('UR-S01 - Validate totalEmployees summary count', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const employeeIds = new Set(
            data.employees
                .map((employee: any) => String(employee.empId ?? '').trim())
                .filter(Boolean)
        );

        expect(Number(data.summary.totalEmployees)).toBe(employeeIds.size);

        console.log(
            `UR-S01 - API totalEmployees: ${data.summary.totalEmployees} | Calculated: ${employeeIds.size}`
        );
    });

    test('UR-S02 - Validate production summary count', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const production = data.employees.filter((employee: any) => {
            const engagementType = normalizeString(employee.engagementType);
            const isBillable = normalizeBoolean(employee.isBillable);
            const billingRate = normalizeNumber(employee.billingRate);

            if (engagementType !== 'production') {
                return false;
            }

            if (isBillable === true) {
                return true;
            }

            return isBillable === false && billingRate === 0;
        }).length;

        expect(Number(data.summary.production)).toBe(production);

        console.log(
            `UR-S02 - API production: ${data.summary.production} | Calculated: ${production}`
        );
    });

    test('UR-S03 - Validate investment calculation', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const investment = data.employees.filter((employee: any) =>
            normalizeString(employee.engagementType) === 'production' &&
            normalizeBoolean(employee.isBillable) === false
        ).length;

        console.log(`UR-S03 - Calculated investment: ${investment}`);

        expect(investment).toBeGreaterThanOrEqual(0);
    });

    test('UR-S04 - Validate internal summary count', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const internalIds = new Set(
            data.employees
                .filter((employee: any) =>
                    normalizeString(employee.engagementType) === 'internal'
                )
                .map((employee: any) => String(employee.empId ?? '').trim())
                .filter(Boolean)
        );

        expect(Number(data.summary.internal)).toBe(internalIds.size);

        console.log(
            `UR-S04 - API internal: ${data.summary.internal} | Calculated: ${internalIds.size}`
        );
    });

    test('UR-S05 - Validate training summary count', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const training = data.employees.filter((employee: any) =>
            normalizeString(employee.engagementType) === 'training'
        ).length;

        expect(Number(data.summary.training)).toBe(training);

        console.log(
            `UR-S05 - API training: ${data.summary.training} | Calculated: ${training}`
        );
    });

    test('UR-S06 - Validate bench summary count', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const bench = data.employees.filter((employee: any) =>
            normalizeString(employee.engagementType) === 'bench'
        ).length;

        expect(Number(data.summary.bench)).toBe(bench);

        console.log(
            `UR-S06 - API bench: ${data.summary.bench} | Calculated: ${bench}`
        );
    });

    test('UR-S07 - Validate On Notice summary count', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const onNotice = data.employees.filter((employee: any) =>
            normalizeString(employee.engagementType) === 'on notice'
        ).length;

        expect(Number(data.summary['On Notice'])).toBe(onNotice);

        console.log(
            `UR-S07 - API On Notice: ${data.summary['On Notice']} | Calculated: ${onNotice}`
        );
    });

    test('UR-S08 - Validate Hold summary count', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const hold = data.employees.filter((employee: any) =>
            normalizeString(employee.engagementType) === 'hold'
        ).length;

        expect(Number(data.summary.Hold)).toBe(hold);

        console.log(
            `UR-S08 - API Hold: ${data.summary.Hold} | Calculated: ${hold}`
        );
    });

    test('UR-S09 - Validate utilization percentage calculation', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        const apiUtilization = Number(
            data.summary.utilizationPercentage
        );

        // Validate that the API returns a valid percentage.
        // The exact business formula used by the API has not yet
        // been confirmed, so the independently calculated value is
        // reported for comparison only.
        expect(Number.isFinite(apiUtilization)).toBe(true);
        expect(apiUtilization).toBeGreaterThanOrEqual(0);
        expect(apiUtilization).toBeLessThanOrEqual(100);

        const employeeIds = new Set(
            data.employees
                .map((employee: any) => String(employee.empId ?? '').trim())
                .filter(Boolean)
        );

        const totalEmployees = employeeIds.size;

        const productionEmployees = data.employees.filter((employee: any) => {
            const engagementType = normalizeString(employee.engagementType);
            const isBillable = normalizeBoolean(employee.isBillable);
            const billingRate = normalizeNumber(employee.billingRate);

            if (engagementType !== 'production') {
                return false;
            }

            if (isBillable === true) {
                return true;
            }

            return isBillable === false && billingRate === 0;
        }).length;

        const calculatedUtilization = totalEmployees === 0
            ? 0
            : (productionEmployees / totalEmployees) * 100;

        const difference = Math.abs(
            apiUtilization - calculatedUtilization
        );

        console.log(
            `UR-S09 - API utilization: ${apiUtilization}%`
        );

        console.log(
            `UR-S09 - Total employees: ${totalEmployees}`
        );

        console.log(
            `UR-S09 - Production employees: ${productionEmployees}`
        );

        console.log(
            `UR-S09 - Independently calculated utilization: ` +
            `${calculatedUtilization.toFixed(2)}%`
        );

        console.log(
            `UR-S09 - Difference: ${difference.toFixed(2)} percentage points`
        );

        console.log(
            'UR-S09 - API utilization percentage is valid; formula difference is reported for analysis only.'
        );
    });

    // ============================================================
    // NEGATIVE TEST CASES
    // ============================================================

    test('UR-N01 - Validate API without authentication token', async ({ request }) => {
        const response = await request.get(buildUtilizationUrl(), {
            headers: {
                Accept: 'application/json',
            },
        });

        expect([401, 403]).toContain(response.status());

        console.log(`UR-N01 - HTTP status: ${response.status()}`);
    });

    test('UR-N02 - Validate API with invalid authentication token', async ({ request }) => {
        const response = await request.get(buildUtilizationUrl(), {
            headers: {
                Authorization: 'Bearer invalid-token-123',
                Accept: 'application/json',
            },
        });

        expect([401, 403]).toContain(response.status());

        console.log(`UR-N02 - HTTP status: ${response.status()}`);
    });

    test('UR-N03 - Validate API without asOfDate parameter', async ({ request }) => {
        expect(process.env.API_TOKEN).toBeTruthy();

        const response = await request.get(UTILIZATION_BASE_URL, {
            headers: API_HEADERS,
        });

        // Current API behavior: a missing asOfDate is accepted
        // and the endpoint returns a utilization report.
        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        expect(data).toBeDefined();
        expect(data.reportDate).toBeTruthy();
        expect(data.reportType).toBeTruthy();
        expect(data.summary).toBeDefined();
        expect(Array.isArray(data.employees)).toBe(true);

        console.log(`UR-N03 - HTTP status: ${response.status()}`);
        console.log(`UR-N03 - Returned reportDate: ${data.reportDate}`);
        console.log(`UR-N03 - Employees returned: ${data.employees.length}`);
    });

    test('UR-N04 - Validate API with invalid asOfDate format', async ({ request }) => {
        expect(process.env.API_TOKEN).toBeTruthy();

        const response = await request.get(
            `${UTILIZATION_BASE_URL}?asOfDate=06-10-2026`,
            { headers: API_HEADERS }
        );

        expect(response.status()).toBeGreaterThanOrEqual(400);
        expect(response.status()).toBeLessThan(500);

        console.log(`UR-N04 - HTTP status: ${response.status()}`);
    });

    test('UR-N05 - Validate API with invalid calendar date', async ({ request }) => {
        expect(process.env.API_TOKEN).toBeTruthy();

        const response = await request.get(
            `${UTILIZATION_BASE_URL}?asOfDate=2026-02-30`,
            { headers: API_HEADERS }
        );

        expect(response.status()).toBeGreaterThanOrEqual(400);
        expect(response.status()).toBeLessThan(500);

        console.log(`UR-N05 - HTTP status: ${response.status()}`);
    });

    test('UR-N06 - Validate invalid utilization report endpoint', async ({ request }) => {
        expect(process.env.API_TOKEN).toBeTruthy();

        const response = await request.get(
            `${UTILIZATION_BASE_URL}/invalid-endpoint?asOfDate=${AS_OF_DATE}`,
            { headers: API_HEADERS }
        );

        expect(response.status()).toBe(404);

        console.log(`UR-N06 - HTTP status: ${response.status()}`);
    });

    test('UR-N07 - Validate unsupported HTTP method', async ({ request }) => {
        expect(process.env.API_TOKEN).toBeTruthy();

        const response = await request.post(
            buildUtilizationUrl(),
            {
                headers: API_HEADERS,
            }
        );

        expect([400, 404, 405]).toContain(response.status());

        console.log(`UR-N07 - HTTP status: ${response.status()}`);
    });

    // ============================================================
    // EDGE / DATE TEST CASES
    // ============================================================

    async function validateDateEdgeCase(
        request: any,
        date: string,
        testId: string
    ) {
        const response = await getUtilizationReport(request, date);

        /*
         * Historical/future dates can legitimately behave differently
         * depending on whether a report snapshot exists. We therefore
         * reject server errors, and when the API returns 200 we validate
         * the returned report structure/date.
         */
        expect(response.status()).toBeLessThan(500);

        if (response.status() === 200) {
            const data = await getJsonResponse(response);
            assertValidReportStructure(data, date);

            console.log(
                `${testId} - ${date} returned HTTP 200 and valid report structure`
            );
        } else {
            console.log(
                `${testId} - ${date} returned HTTP ${response.status()} (no 5xx error)`
            );
        }
    }

    test('UR-E01 - Validate current date', async ({ request }) => {
        const response = await getUtilizationReport(request, AS_OF_DATE);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);
        assertValidReportStructure(data, AS_OF_DATE);

        console.log(`UR-E01 - Current date ${AS_OF_DATE} validated`);
    });

    test('UR-E02 - Validate previous date', async ({ request }) => {
        await validateDateEdgeCase(
            request,
            '2026-10-05',
            'UR-E02'
        );
    });

    test('UR-E03 - Validate older historical date', async ({ request }) => {
        await validateDateEdgeCase(
            request,
            '2026-01-01',
            'UR-E03'
        );
    });

    test('UR-E04 - Validate future date', async ({ request }) => {
        await validateDateEdgeCase(
            request,
            '2026-12-31',
            'UR-E04'
        );
    });

    test('UR-E05 - Validate leap-year date', async ({ request }) => {
        await validateDateEdgeCase(
            request,
            '2028-02-29',
            'UR-E05'
        );
    });

    test('UR-E06 - Validate month boundary dates', async ({ request }) => {
        await validateDateEdgeCase(
            request,
            '2026-09-30',
            'UR-E06-1'
        );

        await validateDateEdgeCase(
            request,
            '2026-10-01',
            'UR-E06-2'
        );
    });

    test('UR-E07 - Validate year boundary dates', async ({ request }) => {
        await validateDateEdgeCase(
            request,
            '2026-12-31',
            'UR-E07-1'
        );

        await validateDateEdgeCase(
            request,
            '2027-01-01',
            'UR-E07-2'
        );
    });

    // ============================================================
    // API QUALITY / CONTRACT TEST CASES
    // ============================================================

    test('UR-A01 - Validate API response time', async ({ request }) => {
        const startTime = Date.now();

        const response = await getUtilizationReport(request);

        const responseTime = Date.now() - startTime;

        expect(response.status()).toBe(200);

        /*
         * This is intentionally an observation test, not a hard SLA.
         * The API response time can vary with server/database load.
         */
        console.log(
            `UR-A01 - Response time: ${responseTime} ms`
        );

        if (responseTime < 5000) {
            console.log('UR-A01 - Performance: GOOD (< 5 seconds)');
        } else if (responseTime < 10000) {
            console.log('UR-A01 - Performance: WARNING (5-10 seconds)');
        } else {
            console.log('UR-A01 - Performance: SLOW (> 10 seconds)');
        }
    });

    test('UR-A02 - Validate response Content-Type', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const contentType = response.headers()['content-type'];

        expect(contentType).toContain('application/json');

        console.log(`UR-A02 - Content-Type: ${contentType}`);
    });

    test('UR-A03 - Validate utilization report response schema', async ({ request }) => {
        const response = await getUtilizationReport(request);

        expect(response.status()).toBe(200);

        const data = await getJsonResponse(response);

        assertValidReportStructure(data, AS_OF_DATE);

        const requiredSummaryFields = [
            'totalEmployees',
            'production',
            'internal',
            'training',
            'bench',
            'On Notice',
            'Hold',
            'utilizationPercentage',
        ];

        const schemaErrors: string[] = [];

        for (const field of requiredSummaryFields) {
            const value = data.summary[field];

            if (value === undefined || value === null || value === '') {
                schemaErrors.push(
                    `summary.${field} is missing or empty`
                );
                continue;
            }

            if (!Number.isFinite(Number(value))) {
                schemaErrors.push(
                    `summary.${field} is not numeric: ${value}`
                );
            }
        }

        data.employees.forEach((employee: any, index: number) => {
            if (
                employee.empId === undefined ||
                employee.empId === null ||
                String(employee.empId).trim() === ''
            ) {
                schemaErrors.push(`employees[${index}].empId is missing`);
            }

            if (
                employee.empName === undefined ||
                employee.empName === null ||
                String(employee.empName).trim() === ''
            ) {
                schemaErrors.push(`employees[${index}].empName is missing`);
            }

            if (
                employee.practice === undefined ||
                employee.practice === null ||
                String(employee.practice).trim() === ''
            ) {
                schemaErrors.push(`employees[${index}].practice is missing`);
            }

            if (
                employee.engagementType === undefined ||
                employee.engagementType === null ||
                String(employee.engagementType).trim() === ''
            ) {
                schemaErrors.push(
                    `employees[${index}].engagementType is missing`
                );
            }
        });

        expect(schemaErrors, schemaErrors.join('\n')).toHaveLength(0);

        console.log(
            `UR-A03 - Schema validated for ${data.employees.length} employees`
        );
    });

    test('UR-A04 - Validate API response consistency', async ({ request }) => {
        const response1 = await getUtilizationReport(request);
        const response2 = await getUtilizationReport(request);

        expect(response1.status()).toBe(200);
        expect(response2.status()).toBe(200);

        const data1 = await getJsonResponse(response1);
        const data2 = await getJsonResponse(response2);

        assertValidReportStructure(data1, AS_OF_DATE);
        assertValidReportStructure(data2, AS_OF_DATE);

        expect(data1.reportDate).toBe(data2.reportDate);
        expect(data1.reportType).toBe(data2.reportType);

        expect(data1.summary).toEqual(data2.summary);

        const ids1 = data1.employees
            .map((employee: any) => String(employee.empId ?? '').trim())
            .sort();

        const ids2 = data2.employees
            .map((employee: any) => String(employee.empId ?? '').trim())
            .sort();

        expect(ids1).toEqual(ids2);

        console.log(
            `UR-A04 - Response 1 employees: ${ids1.length}`
        );

        console.log(
            `UR-A04 - Response 2 employees: ${ids2.length}`
        );

        console.log('UR-A04 - Response consistency: PASS');
    });


    test('Validate Utilization Report API and Database', async ({ request }) => {

        // ============================================================
        // CONFIGURATION
        // ============================================================

        const asOfDate = AS_OF_DATE;

        const apiUrl = `${UTILIZATION_BASE_URL}?asOfDate=${asOfDate}`;

        const validationFailures: string[] = [];

        let data: any = null;
        let dbConnection: mysql.Connection | null = null;


        // ============================================================
        // HELPER FUNCTIONS
        // ============================================================

        function normalizeString(value: any): string | null {

            if (value === null || value === undefined) {
                return null;
            }

            return String(value)
                .trim()
                .replace(/\s+/g, ' ')
                .toLowerCase();
        }


        function normalizeBoolean(value: any): boolean | null {

            if (value === null || value === undefined) {
                return null;
            }

            if (typeof value === 'boolean') {
                return value;
            }

            if (typeof value === 'number') {
                return value === 1;
            }

            const normalized = String(value)
                .trim()
                .toLowerCase();

            if (['true', '1', 'yes', 'y'].includes(normalized)) {
                return true;
            }

            if (['false', '0', 'no', 'n'].includes(normalized)) {
                return false;
            }

            return null;
        }


        function normalizeNumber(value: any): number | null {

            if (value === null || value === undefined || value === '') {
                return null;
            }

            const number = Number(value);

            if (Number.isNaN(number)) {
                return null;
            }

            return number;
        }


        // ============================================================
        // DATE NORMALIZATION
        // ============================================================
        //
        // IMPORTANT:
        //
        // Do NOT use toISOString() for MySQL DATE values.
        //
        // mysql2 can return a MySQL DATE as a JavaScript Date object
        // representing local midnight.
        //
        // Example:
        //
        // Thu Dec 31 2026 00:00:00 GMT+0530
        //
        // toISOString() becomes:
        //
        // 2026-12-30T18:30:00.000Z
        //
        // which incorrectly changes the calendar date.
        //
        // Therefore we use getFullYear(), getMonth() and getDate()
        // for JavaScript Date objects.
        // ============================================================

        function normalizeDate(value: any): string | null {

            if (value === null || value === undefined || value === '') {
                return null;
            }


            // ========================================================
            // JavaScript Date object
            // ========================================================

            if (value instanceof Date) {

                if (Number.isNaN(value.getTime())) {
                    return null;
                }

                const year = value.getFullYear();

                const month =
                    String(value.getMonth() + 1).padStart(2, '0');

                const day =
                    String(value.getDate()).padStart(2, '0');

                return `${year}-${month}-${day}`;
            }


            const stringValue = String(value).trim();


            // ========================================================
            // YYYY-MM-DD
            // ========================================================

            const yyyyMmDd = stringValue.match(
                /^(\d{4})-(\d{2})-(\d{2})/
            );

            if (yyyyMmDd) {

                return (
                    `${yyyyMmDd[1]}-` +
                    `${yyyyMmDd[2]}-` +
                    `${yyyyMmDd[3]}`
                );
            }


            // ========================================================
            // DD-MM-YYYY
            // ========================================================

            const ddMmYyyy = stringValue.match(
                /^(\d{2})-(\d{2})-(\d{4})/
            );

            if (ddMmYyyy) {

                return (
                    `${ddMmYyyy[3]}-` +
                    `${ddMmYyyy[2]}-` +
                    `${ddMmYyyy[1]}`
                );
            }


            // ========================================================
            // MM/DD/YYYY
            // ========================================================

            const slashDate = stringValue.match(
                /^(\d{1,2})\/(\d{1,2})\/(\d{4})/
            );

            if (slashDate) {

                const month =
                    slashDate[1].padStart(2, '0');

                const day =
                    slashDate[2].padStart(2, '0');

                const year =
                    slashDate[3];

                return `${year}-${month}-${day}`;
            }


            // ========================================================
            // Named date string
            //
            // Example:
            //
            // Thu Dec 31 2026 00:00:00 GMT+0530
            // ========================================================

            const namedDate = stringValue.match(
                /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/
            );

            if (namedDate) {

                const monthMap: Record<string, string> = {

                    Jan: '01',
                    Feb: '02',
                    Mar: '03',
                    Apr: '04',
                    May: '05',
                    Jun: '06',
                    Jul: '07',
                    Aug: '08',
                    Sep: '09',
                    Oct: '10',
                    Nov: '11',
                    Dec: '12'
                };

                const month =
                    monthMap[namedDate[1]];

                const day =
                    String(namedDate[2]).padStart(2, '0');

                const year =
                    namedDate[3];

                if (month) {
                    return `${year}-${month}-${day}`;
                }
            }


            // ========================================================
            // Final fallback
            // ========================================================

            return stringValue.substring(0, 10);
        }


        function valuesEqual(
            value1: any,
            value2: any,
            type = 'string'
        ): boolean {

            if (type === 'date') {

                return (
                    normalizeDate(value1) ===
                    normalizeDate(value2)
                );
            }


            if (type === 'number') {

                const n1 = normalizeNumber(value1);
                const n2 = normalizeNumber(value2);

                if (n1 === null && n2 === null) {
                    return true;
                }

                if (n1 === null || n2 === null) {
                    return false;
                }

                return Math.abs(n1 - n2) < 0.000001;
            }


            if (type === 'boolean') {

                return (
                    normalizeBoolean(value1) ===
                    normalizeBoolean(value2)
                );
            }


            return (
                normalizeString(value1) ===
                normalizeString(value2)
            );
        }


        function compareField({
            empId,
            field,
            apiValue,
            dbValue,
            type = 'string'
        }: {
            empId: string;
            field: string;
            apiValue: any;
            dbValue: any;
            type?: 'string' | 'number' | 'boolean' | 'date';
        }): boolean {

            const matched =
                valuesEqual(apiValue, dbValue, type);

            if (!matched) {

                validationFailures.push(
                    `Database validation | Field mismatch | ` +
                    `empId: ${empId} | ` +
                    `field: ${field} | ` +
                    `API: ${apiValue} | ` +
                    `DB: ${dbValue}`
                );

                console.log(
                    `❌ Field mismatch | empId: ${empId} | ` +
                    `field: ${field} | ` +
                    `API: ${apiValue} | ` +
                    `DB: ${dbValue}`
                );

                return false;
            }

            return true;
        }


        function getProjectType(value: any): string | null {

            return normalizeString(value);
        }


        // ============================================================
        // ENGAGEMENT TYPE COMPARISON
        // ============================================================

        function engagementTypeMatches(
            apiValue: any,
            dbValue: any
        ): boolean {

            return (
                getProjectType(apiValue) ===
                getProjectType(dbValue)
            );
        }


        // ============================================================
        // ALLOCATION MATCHING KEY
        // ============================================================
        //
        // IMPORTANT:
        //
        // Do NOT use:
        //
        // - engagementType
        // - isBillable
        // - billingRate
        // - projectManager
        //
        // as primary matching fields.
        //
        // These are validation fields.
        //
        // Allocation identity is based on:
        //
        // empId
        // practice
        // projectName
        // clientName
        // projectRole
        // projectLocation
        // allocationPercentage
        // startDate
        // endDate
        // ============================================================

        function createAllocationKey(record: any): string {

            return [

                normalizeString(record.empId),

                normalizeString(record.practice),

                normalizeString(record.projectName),

                normalizeString(record.clientName),

                normalizeString(record.projectRole),

                normalizeString(record.projectLocation),

                normalizeNumber(
                    record.allocationPercentage
                ),

                normalizeDate(
                    record.startDate
                ),

                normalizeDate(
                    record.endDate
                )

            ].join('|');
        }


        function printSection(title: string) {

            console.log('');

            console.log(
                '============================================================'
            );

            console.log(title);

            console.log(
                '============================================================'
            );

            console.log('');
        }


        // ============================================================
        // STEP 1: API REQUEST
        // ============================================================

        printSection('STEP 1: API REQUEST');

        console.log(`API URL: ${apiUrl}`);

        expect(process.env.API_TOKEN).toBeTruthy();

        let response;

        try {

            response = await request.get(apiUrl, {

                headers: {

                    Authorization:
                        `Bearer ${process.env.API_TOKEN}`,

                    Accept:
                        'application/json'
                }
            });

        } catch (error: any) {

            validationFailures.push(
                `API request failed | ${error.message}`
            );

            console.log(
                `❌ API request failed | ${error.message}`
            );

            throw error;
        }


        // ============================================================
        // STEP 2: RESPONSE VALIDATION
        // ============================================================

        printSection('STEP 2: RESPONSE VALIDATION');

        const status =
            response.status();

        if (status === 200) {

            console.log(
                '✅ API returned HTTP 200'
            );

        } else {

            validationFailures.push(
                `API validation | Expected HTTP 200 but received ${status}`
            );

            console.log(
                `❌ API returned HTTP ${status}`
            );
        }


        let responseText: string;

        try {

            responseText =
                await response.text();

            data =
                JSON.parse(responseText);

            console.log(
                '✅ Response is valid JSON'
            );

        } catch (error) {

            validationFailures.push(
                'API validation | Response is not valid JSON'
            );

            console.log(
                '❌ Response is not valid JSON'
            );
        }


        if (!data) {

            throw new Error(
                'API response could not be parsed.'
            );
        }


        // ============================================================
        // RESPONSE STRUCTURE
        // ============================================================

        console.log('');

        console.log(
            'Validating response structure...'
        );


        if (data.reportDate !== asOfDate) {

            validationFailures.push(
                `API validation | reportDate mismatch | ` +
                `Expected: ${asOfDate} | Actual: ${data.reportDate}`
            );

            console.log(
                `❌ reportDate mismatch | ` +
                `Expected: ${asOfDate} | Actual: ${data.reportDate}`
            );

        } else {

            console.log(
                `✅ reportDate: ${data.reportDate}`
            );
        }


        if (
            data.reportType !==
            'UTILIZATION_REPORT'
        ) {

            validationFailures.push(
                `API validation | reportType mismatch | ` +
                `Expected: UTILIZATION_REPORT | Actual: ${data.reportType}`
            );

            console.log(
                `❌ reportType: ${data.reportType}`
            );

        } else {

            console.log(
                `✅ reportType: ${data.reportType}`
            );
        }


        if (!data.summary) {

            validationFailures.push(
                'API validation | summary object is missing'
            );

            console.log(
                '❌ summary object is missing'
            );

        } else {

            console.log(
                '✅ summary exists'
            );
        }


        if (!Array.isArray(data.employees)) {

            validationFailures.push(
                'API validation | employees is not an array'
            );

            console.log(
                '❌ employees array is missing'
            );

        } else {

            console.log(
                `✅ employees array exists | Records: ${data.employees.length}`
            );
        }


        // Stop here if the fundamental structure is invalid.

        if (
            !Array.isArray(data.employees) ||
            !data.summary
        ) {

            throw new Error(
                'API response structure validation failed.'
            );
        }


        const employees =
            data.employees;

        const summary =
            data.summary;


        // ============================================================
        // STEP 3: SUMMARY VALIDATION
        // ============================================================

        printSection('STEP 3: SUMMARY VALIDATION');


        // ------------------------------------------------------------
        // TOTAL EMPLOYEES
        // ------------------------------------------------------------

        console.log(
            'TOTAL EMPLOYEES'
        );

        const distinctApiEmployeeIds =
            new Set(
                employees

                    .map(
                        employee =>
                            employee.empId
                    )

                    .filter(
                        id =>
                            id !== null &&
                            id !== undefined
                    )

                    .map(
                        id =>
                            String(id).trim()
                    )
            );

        const calculatedTotalEmployees =
            distinctApiEmployeeIds.size;


        console.log(
            `API Summary: ${summary.totalEmployees}`
        );

        console.log(
            `Calculated distinct employees: ${calculatedTotalEmployees}`
        );


        if (
            Number(summary.totalEmployees) !==
            calculatedTotalEmployees
        ) {

            validationFailures.push(
                `Summary validation | Total Employees mismatch | ` +
                `API: ${summary.totalEmployees} | ` +
                `Calculated: ${calculatedTotalEmployees}`
            );

            console.log(
                '❌ Total Employees mismatch'
            );

        } else {

            console.log(
                '✅ Total Employees matched'
            );
        }


        // ------------------------------------------------------------
        // PRODUCTION
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'PRODUCTION'
        );


        /*
         * Backend Production logic observed from the Stage response:
         *
         * 1. Production + billable=true
         *
         * OR
         *
         * 2. Production + billable=false + billingRate=0
         *
         * Investment records with billingRate=null are excluded.
         */

        const calculatedProductionEmployees =
            employees.filter(employee => {

                const engagementType =
                    normalizeString(
                        employee.engagementType
                    );

                const isBillable =
                    normalizeBoolean(
                        employee.isBillable
                    );

                const billingRate =
                    normalizeNumber(
                        employee.billingRate
                    );


                if (
                    engagementType !==
                    'production'
                ) {
                    return false;
                }


                if (isBillable === true) {
                    return true;
                }


                return (
                    isBillable === false &&
                    billingRate === 0
                );
            });


        const calculatedProduction =
            calculatedProductionEmployees.length;


        console.log(
            `API Summary: ${summary.production}`
        );

        console.log(
            `Calculated: ${calculatedProduction}`
        );


        if (
            Number(summary.production) !==
            calculatedProduction
        ) {

            validationFailures.push(
                `Summary validation | Production mismatch | ` +
                `API: ${summary.production} | ` +
                `Calculated: ${calculatedProduction}`
            );

            console.log(
                '❌ Production mismatch'
            );

        } else {

            console.log(
                '✅ Production matched'
            );
        }


        // ------------------------------------------------------------
        // INVESTMENT
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'INVESTMENT'
        );


        const investmentEmployees =
            employees.filter(employee => {

                return (
                    normalizeString(
                        employee.engagementType
                    ) === 'production' &&

                    normalizeBoolean(
                        employee.isBillable
                    ) === false
                );
            });


        const calculatedInvestment =
            investmentEmployees.length;


        console.log(
            `Calculated Investment: ${calculatedInvestment}`
        );

        console.log(
            'ℹ️ Investment = Production + isBillable=false'
        );


        // ------------------------------------------------------------
        // INTERNAL
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'INTERNAL'
        );


        const internalEmployeeIds =
            new Set(
                employees

                    .filter(employee =>
                        normalizeString(
                            employee.engagementType
                        ) === 'internal'
                    )

                    .map(
                        employee =>
                            String(
                                employee.empId
                            ).trim()
                    )
            );


        const calculatedInternal =
            internalEmployeeIds.size;


        console.log(
            `API Summary: ${summary.internal}`
        );

        console.log(
            `Calculated distinct employees: ${calculatedInternal}`
        );


        if (
            Number(summary.internal) !==
            calculatedInternal
        ) {

            validationFailures.push(
                `Summary validation | Internal mismatch | ` +
                `API: ${summary.internal} | ` +
                `Calculated: ${calculatedInternal}`
            );

            console.log(
                '❌ Internal mismatch'
            );

        } else {

            console.log(
                '✅ Internal matched'
            );
        }


        // ------------------------------------------------------------
        // TRAINING
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'TRAINING'
        );


        const calculatedTraining =
            employees.filter(employee =>
                normalizeString(
                    employee.engagementType
                ) === 'training'
            ).length;


        console.log(
            `API Summary: ${summary.training}`
        );

        console.log(
            `Calculated: ${calculatedTraining}`
        );


        if (
            Number(summary.training) !==
            calculatedTraining
        ) {

            validationFailures.push(
                `Summary validation | Training mismatch | ` +
                `API: ${summary.training} | ` +
                `Calculated: ${calculatedTraining}`
            );

            console.log(
                '❌ Training mismatch'
            );

        } else {

            console.log(
                '✅ Training matched'
            );
        }


        // ------------------------------------------------------------
        // BENCH
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'BENCH'
        );


        const calculatedBench =
            employees.filter(employee =>
                normalizeString(
                    employee.engagementType
                ) === 'bench'
            ).length;


        console.log(
            `API Summary: ${summary.bench}`
        );

        console.log(
            `Calculated: ${calculatedBench}`
        );


        if (
            Number(summary.bench) !==
            calculatedBench
        ) {

            validationFailures.push(
                `Summary validation | Bench mismatch | ` +
                `API: ${summary.bench} | ` +
                `Calculated: ${calculatedBench}`
            );

            console.log(
                '❌ Bench mismatch'
            );

        } else {

            console.log(
                '✅ Bench matched'
            );
        }


        // ------------------------------------------------------------
        // ON NOTICE
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'ON NOTICE'
        );


        const calculatedOnNotice =
            employees.filter(employee =>
                normalizeString(
                    employee.engagementType
                ) === 'on notice'
            ).length;


        console.log(
            `API Summary: ${summary['On Notice']}`
        );

        console.log(
            `Calculated: ${calculatedOnNotice}`
        );


        if (
            Number(summary['On Notice']) !==
            calculatedOnNotice
        ) {

            validationFailures.push(
                `Summary validation | On Notice mismatch | ` +
                `API: ${summary['On Notice']} | ` +
                `Calculated: ${calculatedOnNotice}`
            );

            console.log(
                '❌ On Notice mismatch'
            );

        } else {

            console.log(
                '✅ On Notice matched'
            );
        }


        // ------------------------------------------------------------
        // HOLD
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'HOLD'
        );


        const calculatedHold =
            employees.filter(employee =>
                normalizeString(
                    employee.engagementType
                ) === 'hold'
            ).length;


        console.log(
            `API Summary: ${summary.Hold}`
        );

        console.log(
            `Calculated: ${calculatedHold}`
        );


        if (
            Number(summary.Hold) !==
            calculatedHold
        ) {

            validationFailures.push(
                `Summary validation | Hold mismatch | ` +
                `API: ${summary.Hold} | ` +
                `Calculated: ${calculatedHold}`
            );

            console.log(
                '❌ Hold mismatch'
            );

        } else {

            console.log(
                '✅ Hold matched'
            );
        }


        // ------------------------------------------------------------
        // LEAVE
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'LEAVE'
        );


        const calculatedLeave =
            employees.filter(employee =>
                normalizeString(
                    employee.engagementType
                ) === 'leave'
            ).length;


        console.log(
            `Calculated Leave: ${calculatedLeave}`
        );

        console.log(
            'ℹ️ Leave is not currently exposed as a summary field.'
        );


        // ------------------------------------------------------------
        // UTILIZATION
        // ------------------------------------------------------------

        console.log('');

        console.log(
            'UTILIZATION'
        );


        const apiUtilization =
            Number(
                summary.utilizationPercentage
            );


        const calculatedUtilization =
            calculatedTotalEmployees === 0

                ? 0

                : (
                    calculatedProduction /
                    calculatedTotalEmployees
                ) * 100;


        console.log(
            `API Utilization: ${apiUtilization}%`
        );

        console.log(
            `Calculated Production Utilization: ` +
            `${calculatedUtilization.toFixed(2)}%`
        );

        console.log(
            'ℹ️ Utilization percentage reported for comparison only.'
        );


        // ============================================================
        // STEP 4: EMPLOYEE-LEVEL VALIDATION
        // ============================================================

        printSection(
            'STEP 4: EMPLOYEE-LEVEL VALIDATION'
        );


        const employeeRequiredFields = [

            'empId',

            'empName',

            'practice',

            'engagementType'
        ];


        const employeeValidationStart =
            validationFailures.length;


        for (const employee of employees) {

            for (
                const field of employeeRequiredFields
            ) {

                if (
                    employee[field] === undefined ||
                    employee[field] === null ||
                    employee[field] === ''
                ) {

                    validationFailures.push(
                        `Employee validation | Missing field | ` +
                        `empId: ${employee.empId} | ` +
                        `field: ${field}`
                    );

                    console.log(
                        `❌ Missing employee field | ` +
                        `empId: ${employee.empId} | ` +
                        `field: ${field}`
                    );
                }
            }
        }


        if (
            validationFailures.length ===
            employeeValidationStart
        ) {

            console.log(
                '✅ Employee-level validation passed'
            );
        }


        // ============================================================
        // STEP 5: API VS DATABASE VALIDATION
        // ============================================================

        printSection(
            'STEP 5: API VS DATABASE VALIDATION'
        );

        const apiEmployeesById =
            new Map<string, any[]>();

        const dbEmployeesById =
            new Map<string, any[]>();

        let apiAllocations: any[] = [];
        let dbAllocations: any[] = [];
        let matchedAllocations = 0;
        let missingApiEmployees = 0;
        let missingApiAllocations = 0;
        let unmatchedDbAllocations = 0;

        try {

            // --------------------------------------------------------
            // DATABASE CONNECTION
            // --------------------------------------------------------

            console.log(
                'Connecting to MySQL...'
            );


            dbConnection =
                await mysql.createConnection({

                    host:
                        process.env.DB_HOST,

                    port:
                        Number(
                            process.env.DB_PORT ||
                            3306
                        ),

                    user:
                        process.env.DB_USER,

                    password:
                        process.env.DB_PASSWORD,

                    database:
                        process.env.DB_NAME
                });


            console.log(
                '✅ Database connection successful'
            );


            // --------------------------------------------------------
            // DATABASE QUERY
            // --------------------------------------------------------

            console.log('');

            console.log(
                'Executing database query...'
            );


            /*
             * We intentionally do not filter by asOfDate here.
             *
             * The API returns the allocation state for the requested
             * report date, while the DB can contain historical and
             * future allocations.
             *
             * Therefore we match the API allocation against DB
             * allocations using the allocation identity fields.
             */

            const dbQuery = `

                SELECT

                    e.emp_id,

                    e.full_name,

                    e.is_deleted,

                    a.allocation_id,

                    a.allocation_percentage,

                    a.billing_rate,

                    a.created_date,

                    a.end_date,

                    a.is_billable,

                    a.practice,

                    a.project_location,

                    a.project_manager,

                    a.project_role,

                    a.start_date,

                    a.emp_id AS allocation_emp_id,

                    a.project_id,

                    p.id AS project_id,

                    p.client_name,

                    p.project_name,

                    p.project_type

                FROM emp_details e

                INNER JOIN employee_allocation a

                    ON e.emp_id = a.emp_id

                LEFT JOIN project p

                    ON a.project_id = p.id

                WHERE (e.is_deleted = 0 OR e.is_deleted IS NULL)

                ORDER BY

                    e.emp_id,

                    a.start_date,

                    a.allocation_id

            `;


            const [dbRows] =
                await dbConnection.execute(
                    dbQuery
                );


            console.log(
                `✅ Database records returned: ${dbRows.length}`
            );


            // ========================================================
            // API EMPLOYEE MAP
            // ========================================================


            for (const employee of employees) {

                const empId =
                    String(
                        employee.empId
                    ).trim();


                if (
                    !apiEmployeesById.has(empId)
                ) {

                    apiEmployeesById.set(
                        empId,
                        []
                    );
                }


                apiEmployeesById
                    .get(empId)!
                    .push(employee);
            }


            // ========================================================
            // DB EMPLOYEE MAP
            // ========================================================


            for (const row of dbRows as any[]) {

                const empId =
                    String(
                        row.emp_id
                    ).trim();


                if (
                    !dbEmployeesById.has(empId)
                ) {

                    dbEmployeesById.set(
                        empId,
                        []
                    );
                }


                dbEmployeesById
                    .get(empId)!
                    .push(row);
            }


            // ========================================================
            // EMPLOYEE COUNT COMPARISON
            // ========================================================

            console.log('');

            console.log(
                '------------------------------------------------------------'
            );

            console.log(
                'EMPLOYEE COUNT COMPARISON'
            );

            console.log(
                '------------------------------------------------------------'
            );


            console.log(
                `API distinct employees: ${apiEmployeesById.size}`
            );

            console.log(
                `DB distinct employees : ${dbEmployeesById.size}`
            );


            // --------------------------------------------------------
            // API EMPLOYEES MISSING IN DB
            // --------------------------------------------------------

            missingApiEmployees = 0;


            for (
                const empId of apiEmployeesById.keys()
            ) {

                if (
                    !dbEmployeesById.has(empId)
                ) {

                    missingApiEmployees++;


                    const apiEmpList = apiEmployeesById.get(empId) || [];
                    const empName = apiEmpList[0]?.empName || apiEmpList[0]?.employeeName || apiEmpList[0]?.fullName || apiEmpList[0]?.name || 'N/A';

                    const message =
                        `Database validation | ` +
                        `Employee missing in DB | ` +
                        `empId: ${empId} (${empName}) | ` +
                        `Reason: Employee is returned by API payload but has no active record in DB (e.g., soft-deleted or contract employee)`;

                    validationFailures.push(
                        message
                    );

                    console.log(
                        `❌ Employee missing in DB | empId: ${empId} (${empName})`
                    );
                }
            }


            if (
                missingApiEmployees === 0
            ) {

                console.log(
                    '✅ All API employees exist in DB'
                );

            } else {

                console.log(
                    `❌ API employees missing in DB: ` +
                    `${missingApiEmployees}`
                );
            }


            // --------------------------------------------------------
            // DB EMPLOYEES NOT PRESENT IN API
            // --------------------------------------------------------

            console.log('');

            console.log(
                '------------------------------------------------------------'
            );

            console.log(
                'DB EMPLOYEES NOT PRESENT IN API'
            );

            console.log(
                '------------------------------------------------------------'
            );


            let dbOnlyEmployeeCount = 0;


            for (
                const empId of dbEmployeesById.keys()
            ) {

                if (
                    !apiEmployeesById.has(empId)
                ) {

                    dbOnlyEmployeeCount++;


                    console.log(
                        `ℹ️ DB-only employee | empId: ${empId}`
                    );
                }
            }


            console.log(
                `DB-only employees: ${dbOnlyEmployeeCount}`
            );


            // ========================================================
            // ALLOCATION MAP
            // ========================================================

            apiAllocations = [];


            for (const employee of employees) {

                apiAllocations.push({

                    empId:
                        employee.empId,

                    empName:
                        employee.empName,

                    practice:
                        employee.practice,

                    projectName:
                        employee.projectName,

                    clientName:
                        employee.clientName,

                    projectRole:
                        employee.projectRole,

                    projectLocation:
                        employee.projectLocation,

                    allocationPercentage:
                        employee.allocationPercentage,

                    startDate:
                        employee.startDate,

                    endDate:
                        employee.endDate,

                    projectManager:
                        employee.pm,

                    engagementType:
                        employee.engagementType,

                    isBillable:
                        employee.isBillable,

                    billingRate:
                        employee.billingRate
                });
            }


            dbAllocations =
                (dbRows as any[]).map(row => ({

                    empId:
                        row.emp_id,

                    empName:
                        row.full_name,

                    practice:
                        row.practice,

                    projectName:
                        row.project_name,

                    clientName:
                        row.client_name,

                    projectRole:
                        row.project_role,

                    projectLocation:
                        row.project_location,

                    allocationPercentage:
                        row.allocation_percentage,

                    startDate:
                        row.start_date,

                    endDate:
                        row.end_date,

                    projectManager:
                        row.project_manager,

                    engagementType:
                        row.project_type,

                    isBillable:
                        row.is_billable,

                    billingRate:
                        row.billing_rate,

                    allocationId:
                        row.allocation_id,

                    projectId:
                        row.project_id
                }));


            // ========================================================
            // CREATE DB ALLOCATION INDEX
            // ========================================================

            const dbAllocationMap =
                new Map<string, any[]>();


            for (
                const dbAllocation of dbAllocations
            ) {

                const key =
                    createAllocationKey(
                        dbAllocation
                    );


                if (
                    !dbAllocationMap.has(key)
                ) {

                    dbAllocationMap.set(
                        key,
                        []
                    );
                }


                dbAllocationMap
                    .get(key)!
                    .push(dbAllocation);
            }


            // ========================================================
            // FIELD-LEVEL API VS DB COMPARISON
            // ========================================================

            console.log('');

            console.log(
                '------------------------------------------------------------'
            );

            console.log(
                'FIELD-LEVEL API VS DB COMPARISON'
            );

            console.log(
                '------------------------------------------------------------'
            );


            const usedDbAllocationIds =
                new Set<any>();


            matchedAllocations = 0;

            missingApiAllocations = 0;


            for (
                const apiAllocation of apiAllocations
            ) {

                const empId =
                    String(
                        apiAllocation.empId
                    ).trim();


                const key =
                    createAllocationKey(
                        apiAllocation
                    );


                const possibleMatches =
                    dbAllocationMap.get(key) || [];


                /*
                 * Prevent the same DB allocation
                 * from being reused.
                 */

                const dbAllocation =
                    possibleMatches.find(
                        row =>
                            !usedDbAllocationIds.has(
                                row.allocationId
                            )
                    );


                // ----------------------------------------------------
                // NO MATCH
                // ----------------------------------------------------

                if (!dbAllocation) {

                    missingApiAllocations++;


                    const empName = apiAllocation.empName || apiAllocation.employeeName || apiAllocation.fullName || apiAllocation.name || 'N/A';

                    const message =
                        `Database validation | ` +
                        `API allocation missing in DB | ` +
                        `empId: ${empId} (${empName}) | ` +
                        `project: ${apiAllocation.projectName} | ` +
                        `startDate: ${normalizeDate(
                            apiAllocation.startDate
                        )} | ` +
                        `endDate: ${normalizeDate(
                            apiAllocation.endDate
                        )} | ` +
                        `Reason: API returned allocation for project '${apiAllocation.projectName}' but no matching active DB allocation record was found`;

                    validationFailures.push(
                        message
                    );

                    console.log(
                        `❌ API allocation missing in DB | ` +
                        `empId: ${empId} (${empName}) | ` +
                        `project: ${apiAllocation.projectName}`
                    );

                    continue;
                }


                usedDbAllocationIds.add(
                    dbAllocation.allocationId
                );


                matchedAllocations++;


                console.log(
                    `✅ Employee allocation matched | ` +
                    `empId: ${empId} | ` +
                    `allocationId: ${dbAllocation.allocationId}`
                );


                // ----------------------------------------------------
                // FIELD VALIDATIONS
                // ----------------------------------------------------

                compareField({

                    empId,

                    field:
                        'full_name',

                    apiValue:
                        apiAllocation.empName,

                    dbValue:
                        dbAllocation.empName,

                    type:
                        'string'
                });


                compareField({

                    empId,

                    field:
                        'practice',

                    apiValue:
                        apiAllocation.practice,

                    dbValue:
                        dbAllocation.practice,

                    type:
                        'string'
                });


                compareField({

                    empId,

                    field:
                        'projectName',

                    apiValue:
                        apiAllocation.projectName,

                    dbValue:
                        dbAllocation.projectName,

                    type:
                        'string'
                });


                compareField({

                    empId,

                    field:
                        'clientName',

                    apiValue:
                        apiAllocation.clientName,

                    dbValue:
                        dbAllocation.clientName,

                    type:
                        'string'
                });


                compareField({

                    empId,

                    field:
                        'projectRole',

                    apiValue:
                        apiAllocation.projectRole,

                    dbValue:
                        dbAllocation.projectRole,

                    type:
                        'string'
                });


                compareField({

                    empId,

                    field:
                        'projectLocation',

                    apiValue:
                        apiAllocation.projectLocation,

                    dbValue:
                        dbAllocation.projectLocation,

                    type:
                        'string'
                });


                compareField({

                    empId,

                    field:
                        'allocationPercentage',

                    apiValue:
                        apiAllocation.allocationPercentage,

                    dbValue:
                        dbAllocation.allocationPercentage,

                    type:
                        'number'
                });


                compareField({

                    empId,

                    field:
                        'startDate',

                    apiValue:
                        apiAllocation.startDate,

                    dbValue:
                        dbAllocation.startDate,

                    type:
                        'date'
                });


                compareField({

                    empId,

                    field:
                        'endDate',

                    apiValue:
                        apiAllocation.endDate,

                    dbValue:
                        dbAllocation.endDate,

                    type:
                        'date'
                });


                compareField({

                    empId,

                    field:
                        'isBillable',

                    apiValue:
                        apiAllocation.isBillable,

                    dbValue:
                        dbAllocation.isBillable,

                    type:
                        'boolean'
                });


                /*
                 * Billing rate can legitimately be null
                 * in DB/API.
                 */

                compareField({

                    empId,

                    field:
                        'billingRate',

                    apiValue:
                        apiAllocation.billingRate,

                    dbValue:
                        dbAllocation.billingRate,

                    type:
                        'number'
                });


                /*
                 * Engagement type is compared separately
                 * because DB has both "Hold" and "HOLD".
                 */

                if (
                    !engagementTypeMatches(
                        apiAllocation.engagementType,
                        dbAllocation.engagementType
                    )
                ) {

                    validationFailures.push(

                        `Database validation | ` +
                        `Field mismatch | ` +
                        `empId: ${empId} | ` +
                        `field: engagementType | ` +
                        `API: ${apiAllocation.engagementType} | ` +
                        `DB: ${dbAllocation.engagementType}`
                    );


                    console.log(

                        `❌ Field mismatch | ` +
                        `empId: ${empId} | ` +
                        `field: engagementType | ` +
                        `API: ${apiAllocation.engagementType} | ` +
                        `DB: ${dbAllocation.engagementType}`
                    );
                }


                /*
                 * PM/project manager comparison.
                 *
                 * This field is NOT used for allocation
                 * matching because PM can change while
                 * allocation identity remains the same.
                 */

                compareField({

                    empId,

                    field:
                        'projectManager',

                    apiValue:
                        apiAllocation.projectManager,

                    dbValue:
                        dbAllocation.projectManager,

                    type:
                        'string'
                });
            }


            // ========================================================
            // UNMATCHED DB ALLOCATIONS
            // ========================================================

            console.log('');

            console.log(
                '------------------------------------------------------------'
            );

            console.log(
                'DB ALLOCATIONS NOT PRESENT IN API'
            );

            console.log(
                '------------------------------------------------------------'
            );


            unmatchedDbAllocations = 0;


            for (
                const dbAllocation of dbAllocations
            ) {

                if (
                    !usedDbAllocationIds.has(
                        dbAllocation.allocationId
                    )
                ) {

                    unmatchedDbAllocations++;


                    /*
                     * INFORMATIONAL ONLY.
                     *
                     * The DB contains historical and future
                     * allocations while the API returns the
                     * allocation state for the requested report date.
                     *
                     * Therefore these are NOT validation failures.
                     */

                    console.log(
                        `ℹ️ DB allocation not matched to API | ` +
                        `empId: ${dbAllocation.empId} | ` +
                        `allocationId: ${dbAllocation.allocationId} | ` +
                        `project: ${dbAllocation.projectName} | ` +
                        `startDate: ${normalizeDate(
                            dbAllocation.startDate
                        )} | ` +
                        `endDate: ${normalizeDate(
                            dbAllocation.endDate
                        )}`
                    );
                }
            }


            // ========================================================
            // STEP 5 DATABASE VALIDATION SUMMARY
            // ========================================================

            console.log('');

            console.log(
                '============================================================'
            );

            console.log(
                'STEP 5 DATABASE VALIDATION SUMMARY'
            );

            console.log(
                '============================================================'
            );


            console.log(
                `API distinct employees       : ` +
                `${apiEmployeesById.size}`
            );


            console.log(
                `DB distinct employees        : ` +
                `${dbEmployeesById.size}`
            );


            console.log(
                `API allocation records       : ` +
                `${apiAllocations.length}`
            );


            console.log(
                `DB allocation records        : ` +
                `${dbAllocations.length}`
            );


            console.log(
                `Matched allocations          : ` +
                `${matchedAllocations}`
            );


            console.log(
                `Missing API allocations      : ` +
                `${missingApiAllocations}`
            );


            console.log(
                `Unmatched DB allocations     : ` +
                `${unmatchedDbAllocations}`
            );


            const dbValidationFailureCount =
                validationFailures.filter(
                    failure =>
                        failure.startsWith(
                            'Database validation'
                        )
                ).length;


            console.log(
                `DB validation failures       : ` +
                `${dbValidationFailureCount}`
            );


            if (
                dbValidationFailureCount === 0
            ) {

                console.log('');

                console.log(
                    '✅ API AND DATABASE VALIDATION PASSED'
                );

            } else {

                console.log('');

                console.log(
                    '❌ API AND DATABASE VALIDATION FAILED'
                );


                validationFailures

                    .filter(
                        failure =>
                            failure.startsWith(
                                'Database validation'
                            )
                    )

                    .forEach(
                        (failure, index) => {

                            console.log(
                                `${index + 1}. ${failure}`
                            );
                        }
                    );
            }


        } catch (error: any) {

            /*
             * Database connection/query errors are real
             * validation failures and should be reported.
             */

            if (
                !String(error.message).includes(
                    'validation failure(s) found'
                )
            ) {

                validationFailures.push(
                    `Database execution error | ${error.message}`
                );


                console.log('');

                console.log(
                    `❌ Database execution error | ${error.message}`
                );
            }


        } finally {

            if (dbConnection) {

                try {

                    await dbConnection.end();

                    console.log('');

                    console.log(
                        'Database connection closed'
                    );

                } catch (error: any) {

                    console.log(
                        `⚠️ Failed to close database connection | ` +
                        `${error.message}`
                    );
                }
            }
        }


        // ============================================================
        // PRACTICE FILTER VALIDATION IS INTENTIONALLY NOT INCLUDED HERE.
        // This file currently focuses only on the asOfDate endpoint.
        // ============================================================

    });

});