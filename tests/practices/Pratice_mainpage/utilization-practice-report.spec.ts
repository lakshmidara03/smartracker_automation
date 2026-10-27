import { test, expect, APIRequestContext, APIResponse } from '@playwright/test';



/**

 * ============================================================

 * SMARTTRACKER - UTILIZATION PRACTICE REPORT API

 * ============================================================

 *

 * Endpoint:

 * GET /api/api/v1/utilization/reports/as-of-date

 *

 * Example:

 * ?asOfDate=2026-10-06&practice=Data%20%26%20AI

 *

 * Base URL:

 * https://13.61.179.149/api

 *

 * Full endpoint:

 * https://13.61.179.149/api/api/v1/utilization/reports/as-of-date

 *

 * ============================================================

 */



const RAW_BASE_URL =
    process.env.BASE_URL || 'https://13.61.179.149';

// Normalize BASE_URL so the application always uses:
// https://13.61.179.149/api/api/v1/utilization/reports/as-of-date
const HOST_BASE_URL = RAW_BASE_URL
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

const BASE_URL = `${HOST_BASE_URL}/api`;

const UTILIZATION_BASE_URL =
    `${BASE_URL}/api/v1/utilization/reports/as-of-date`;



const API_TOKEN = process.env.API_TOKEN;



const AS_OF_DATE =

    process.env.UTILIZATION_AS_OF_DATE || '2026-10-06';



/**

 * Practices confirmed for the utilization endpoint.

 *

 * Data & AI is confirmed from the current API request.

 * Digital Transformation and Revenue and Sales were previously

 * confirmed against the same endpoint.

 */

const VALID_PRACTICES = [

    'Data & AI',

    'Digital Transformation',

    'Revenue and Sales',

];



/**

 * API headers

 */

const API_HEADERS = {

    Authorization: `Bearer ${API_TOKEN}`,

    Accept: 'application/json',

};



/**

 * ============================================================

 * TYPES

 * ============================================================

 */



interface EmployeeRecord {

    empId?: string | number | null;

    empName?: string | null;

    practice?: string | null;

    subPractice?: string | null;

    engagementType?: string | null;

    clientName?: string | null;

    projectName?: string | null;

    category?: string | null;

    pm?: string | null;

    allocationPercentage?: number | null;

    billingRate?: number | null;

    projectRole?: string | null;

    projectLocation?: string | null;

    startDate?: string | null;

    endDate?: string | null;

    benchSinceDays?: number | null;

    isBillable?: boolean | null;

}



interface UtilizationSummary {

    totalEmployees?: number | null;

    production?: number | null;

    internal?: number | null;

    training?: number | null;

    bench?: number | null;

    utilizationPercentage?: number | null;

    onNotice?: number | null;

    hold?: number | null;

}



interface UtilizationReport {

    reportDate?: string;

    reportType?: string;

    summary?: UtilizationSummary;

    employees?: EmployeeRecord[];

}



/**

 * ============================================================

 * HELPER FUNCTIONS

 * ============================================================

 */



function getPracticeUrl(practice: string, asOfDate = AS_OF_DATE): string {

    const params = new URLSearchParams();



    params.set('asOfDate', asOfDate);

    params.set('practice', practice);



    return `${UTILIZATION_BASE_URL}?${params.toString()}`;

}



async function getPracticeReport(

    request: APIRequestContext,

    practice: string,

    asOfDate = AS_OF_DATE,

): Promise<APIResponse> {

    return await request.get(

        getPracticeUrl(practice, asOfDate),

        {

            headers: API_HEADERS,

        },

    );

}



async function getJsonResponse(

    response: APIResponse,

): Promise<UtilizationReport> {

    const contentType = response.headers()['content-type'] || '';



    expect(

        contentType.toLowerCase(),

        'API response should contain JSON content type',

    ).toContain('application/json');



    return await response.json();

}



function normalizeString(value: unknown): string {

    return String(value ?? '')

        .trim()

        .toLowerCase();

}



function isValidDateFormat(date: string): boolean {

    return /^\d{4}-\d{2}-\d{2}$/.test(date);

}



function isValidCalendarDate(date: string): boolean {

    if (!isValidDateFormat(date)) {

        return false;

    }



    const [year, month, day] = date.split('-').map(Number);



    const parsedDate = new Date(

        Date.UTC(year, month - 1, day),

    );



    return (

        parsedDate.getUTCFullYear() === year &&

        parsedDate.getUTCMonth() === month - 1 &&

        parsedDate.getUTCDate() === day

    );

}



function validateEmployeeRecord(

    employee: EmployeeRecord,

    index: number,

): void {

    expect(

        employee,

        `Employee record ${index + 1} should be an object`,

    ).toBeDefined();



    expect(

        employee.empId,

        `Employee ${index + 1} should have empId`,

    ).not.toBeNull();



    expect(

        String(employee.empId ?? '').trim(),

        `Employee ${index + 1} should have non-empty empId`,

    ).not.toBe('');



    expect(

        employee.empName,

        `Employee ${index + 1} should have empName`,

    ).not.toBeNull();



    expect(

        String(employee.empName ?? '').trim(),

        `Employee ${index + 1} should have non-empty empName`,

    ).not.toBe('');



    expect(

        employee.practice,

        `Employee ${index + 1} should have practice`,

    ).not.toBeNull();



    expect(

        employee.engagementType,

        `Employee ${index + 1} should have engagementType`,

    ).not.toBeNull();



    expect(

        employee.allocationPercentage,

        `Employee ${index + 1} should have allocationPercentage`,

    ).not.toBeUndefined();



    expect(

        employee.isBillable,

        `Employee ${index + 1} should have isBillable`,

    ).not.toBeUndefined();

}



/**

 * ============================================================

 * TEST SUITE

 * ============================================================

 */



test.describe(

    'SmartTracker - Utilization Practice Report API Validation',

    () => {



        test.beforeAll(() => {

            console.log('\n');

            console.log('='.repeat(70));

            console.log(

                'UTILIZATION PRACTICE REPORT API AUTOMATION',

            );

            console.log('='.repeat(70));

            console.log(`Base URL       : ${UTILIZATION_BASE_URL}`);

            console.log(`As Of Date     : ${AS_OF_DATE}`);

            console.log(

                `Valid Practices: ${VALID_PRACTICES.join(', ')}`,

            );

            console.log('='.repeat(70));

        });



        /**

         * ========================================================

         * POSITIVE TEST CASES

         * ========================================================

         */



        test(

            'URP-P01 - Validate valid asOfDate and practice request',

            async ({ request }) => {

                expect(API_TOKEN).toBeTruthy();



                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(data).toBeDefined();

                expect(data.reportDate).toBe(AS_OF_DATE);

                expect(data.reportType).toBe(

                    'UTILIZATION_REPORT',

                );

                expect(data.summary).toBeDefined();

                expect(Array.isArray(data.employees)).toBe(

                    true,

                );



                console.log('\nURP-P01');

                console.log(

                    `Practice    : ${practice}`,

                );

                console.log(

                    `As Of Date  : ${AS_OF_DATE}`,

                );

                console.log(

                    `HTTP Status : ${response.status()}`,

                );

                console.log(

                    `Employees   : ${data.employees?.length}`,

                );

            },

        );



        test(

            'URP-P02 - Validate HTTP 200 for Data & AI',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                console.log(

                    `URP-P02 - ${practice} returned HTTP ${response.status()}`,

                );

            },

        );



        test(

            'URP-P03 - Validate response is valid JSON',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(data).toBeDefined();

                expect(typeof data).toBe('object');



                console.log(

                    'URP-P03 - Response is valid JSON',

                );

            },

        );



        test(

            'URP-P04 - Validate reportDate',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(data.reportDate).toBe(AS_OF_DATE);



                console.log(

                    `URP-P04 - reportDate: ${data.reportDate}`,

                );

            },

        );



        test(

            'URP-P05 - Validate reportType',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(data.reportType).toBe(

                    'UTILIZATION_REPORT',

                );



                console.log(

                    `URP-P05 - reportType: ${data.reportType}`,

                );

            },

        );



        test(

            'URP-P06 - Validate summary object',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(data.summary).toBeDefined();

                expect(typeof data.summary).toBe('object');



                console.log(

                    'URP-P06 - Summary object is present',

                );

            },

        );



        test(

            'URP-P07 - Validate employees array',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(Array.isArray(data.employees)).toBe(

                    true,

                );



                console.log(

                    `URP-P07 - Employee records: ${data.employees?.length}`,

                );

            },

        );



        test(

            'URP-P08 - Validate required employee fields',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(Array.isArray(data.employees)).toBe(

                    true,

                );



                for (

                    let i = 0;

                    i < data.employees!.length;

                    i++

                ) {

                    validateEmployeeRecord(

                        data.employees![i],

                        i,

                    );

                }



                console.log(

                    `URP-P08 - Validated ${data.employees?.length} employee records`,

                );

            },

        );



        /**

         * ========================================================

         * PRACTICE VALIDATION

         * ========================================================

         */



        test(

            'URP-PR01 - Validate Data & AI practice',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const employees = data.employees || [];



                expect(employees.length).toBeGreaterThan(0);



                const mismatches = employees.filter(

                    employee =>

                        normalizeString(employee.practice) !==

                        normalizeString(practice),

                );



                console.log('\nURP-PR01');

                console.log(

                    `Requested Practice : ${practice}`,

                );

                console.log(

                    `Employees Returned : ${employees.length}`,

                );

                console.log(

                    `Practice Mismatches: ${mismatches.length}`,

                );



                expect(mismatches).toHaveLength(0);

            },

        );



        test(

            'URP-PR02 - Validate Digital Transformation practice',

            async ({ request }) => {

                const practice = 'Digital Transformation';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(Array.isArray(data.employees)).toBe(

                    true,

                );



                const employees = data.employees || [];



                const mismatches = employees.filter(

                    employee =>

                        normalizeString(employee.practice) !==

                        normalizeString(practice),

                );



                console.log('\nURP-PR02');

                console.log(

                    `Requested Practice : ${practice}`,

                );

                console.log(

                    `Employees Returned : ${employees.length}`,

                );

                console.log(

                    `Practice Mismatches: ${mismatches.length}`,

                );



                expect(mismatches).toHaveLength(0);

            },

        );



        test(

            'URP-PR03 - Validate Revenue and Sales practice',

            async ({ request }) => {

                const practice = 'Revenue and Sales';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                expect(Array.isArray(data.employees)).toBe(

                    true,

                );



                const employees = data.employees || [];



                const mismatches = employees.filter(

                    employee =>

                        normalizeString(employee.practice) !==

                        normalizeString(practice),

                );



                console.log('\nURP-PR03');

                console.log(

                    `Requested Practice : ${practice}`,

                );

                console.log(

                    `Employees Returned : ${employees.length}`,

                );

                console.log(

                    `Practice Mismatches: ${mismatches.length}`,

                );



                expect(mismatches).toHaveLength(0);

            },

        );



        /**

         * ========================================================

         * SUMMARY VALIDATION

         * ========================================================

         */



        test(

            'URP-S01 - Validate totalEmployees summary',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const summary =

                    data.summary as UtilizationSummary;



                const employeeIds = new Set(

                    (data.employees || [])

                        .map(employee =>

                            String(

                                employee.empId ?? '',

                            ).trim(),

                        )

                        .filter(Boolean),

                );



                const calculatedTotal =

                    employeeIds.size;



                expect(

                    Number(summary.totalEmployees),

                ).toBe(calculatedTotal);



                console.log('\nURP-S01');

                console.log(

                    `API Total Employees : ${summary.totalEmployees}`,

                );

                console.log(

                    `Calculated Total    : ${calculatedTotal}`,

                );

            },

        );



        test(

            'URP-S02 - Validate production count',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const summary =

                    data.summary as UtilizationSummary;



                // The API can return multiple allocation records for the same
                // employee. The summary is employee-based, so calculate
                // production using distinct employee IDs.
                const productionEmployeeIds = new Set(
                    (data.employees || [])
                        .filter(
                            employee =>
                                normalizeString(
                                    employee.engagementType,
                                ) === 'production',
                        )
                        .map(employee =>
                            String(employee.empId ?? '').trim(),
                        )
                        .filter(Boolean),
                );

                const productionCount =
                    productionEmployeeIds.size;



                console.log('\nURP-S02');

                console.log(

                    `API Production       : ${summary.production}`,

                );

                console.log(

                    `Calculated Production: ${productionCount}`,

                );



                expect(

                    Number(summary.production),

                ).toBe(productionCount);

            },

        );



        test(

            'URP-S03 - Validate internal count',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const summary =

                    data.summary as UtilizationSummary;



                const internalCount =

                    (data.employees || []).filter(

                        employee =>

                            normalizeString(

                                employee.engagementType,

                            ) === 'internal',

                    ).length;



                console.log('\nURP-S03');

                console.log(

                    `API Internal       : ${summary.internal}`,

                );

                console.log(

                    `Calculated Internal: ${internalCount}`,

                );



                expect(

                    Number(summary.internal),

                ).toBe(internalCount);

            },

        );



        test(

            'URP-S04 - Validate training count',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const summary =

                    data.summary as UtilizationSummary;



                const trainingCount =

                    (data.employees || []).filter(

                        employee =>

                            normalizeString(

                                employee.engagementType,

                            ) === 'training',

                    ).length;



                console.log('\nURP-S04');

                console.log(

                    `API Training       : ${summary.training}`,

                );

                console.log(

                    `Calculated Training: ${trainingCount}`,

                );



                expect(

                    Number(summary.training),

                ).toBe(trainingCount);

            },

        );



        test(

            'URP-S05 - Validate bench count',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const summary =

                    data.summary as UtilizationSummary;



                const benchCount =

                    (data.employees || []).filter(

                        employee =>

                            normalizeString(

                                employee.engagementType,

                            ) === 'bench',

                    ).length;



                console.log('\nURP-S05');

                console.log(

                    `API Bench       : ${summary.bench}`,

                );

                console.log(

                    `Calculated Bench: ${benchCount}`,

                );



                expect(

                    Number(summary.bench),

                ).toBe(benchCount);

            },

        );



        test(

            'URP-S06 - Validate utilization percentage range',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const utilization = Number(

                    data.summary?.utilizationPercentage,

                );



                expect(

                    Number.isFinite(utilization),

                ).toBe(true);



                expect(utilization).toBeGreaterThanOrEqual(

                    0,

                );



                expect(utilization).toBeLessThanOrEqual(

                    100,

                );



                console.log('\nURP-S06');

                console.log(

                    `API Utilization: ${utilization}%`,

                );

            },

        );



        /**

         * ========================================================

         * EMPLOYEE DATA VALIDATION

         * ========================================================

         */



        test(

            'URP-EV01 - Validate employee IDs and duplicate allocation records',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const employees =

                    data.employees || [];



                const employeeIds =

                    employees

                        .map(employee =>

                            String(

                                employee.empId ?? '',

                            ).trim(),

                        )

                        .filter(Boolean);



                const uniqueIds =

                    new Set(employeeIds);



                console.log('\nURP-EV01');

                console.log(

                    `Employee records: ${employeeIds.length}`,

                );

                console.log(

                    `Unique empIds    : ${uniqueIds.size}`,

                );



                const duplicateIds = [...uniqueIds].filter(
                    id =>
                        employeeIds.filter(
                            employeeId => employeeId === id,
                        ).length > 1,
                );

                console.log(
                    `Duplicate empIds : ${duplicateIds.length}`,
                );

                if (duplicateIds.length > 0) {
                    console.log(
                        `Duplicate IDs    : ${duplicateIds.join(', ')}`,
                    );
                }

                // Duplicate employee IDs are valid when the API returns
                // multiple allocation records for the same employee.
                // Validate that every returned record has a non-empty ID.
                expect(employeeIds.length).toBe(employees.length);
                expect(uniqueIds.size).toBeGreaterThan(0);

            },

        );



        test(

            'URP-EV02 - Validate employee practice matches requested practice',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response = await getPracticeReport(

                    request,

                    practice,

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const employees =

                    data.employees || [];



                const mismatches =

                    employees.filter(

                        employee =>

                            normalizeString(

                                employee.practice,

                            ) !==

                            normalizeString(

                                practice,

                            ),

                    );



                expect(mismatches).toHaveLength(0);



                console.log(

                    `URP-EV02 - All ${employees.length} employee records belong to ${practice}`,

                );

            },

        );



        test(

            'URP-EV03 - Validate allocation percentage range',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const invalidRecords =

                    (data.employees || []).filter(

                        employee => {

                            const value = Number(

                                employee.allocationPercentage,

                            );



                            return (

                                !Number.isFinite(value) ||

                                value < 0 ||

                                value > 100

                            );

                        },

                    );



                console.log(

                    `URP-EV03 - Invalid allocation records: ${invalidRecords.length}`,

                );



                expect(invalidRecords).toHaveLength(0);

            },

        );



        test(

            'URP-EV04 - Validate employee date format',

            async ({ request }) => {

                const response = await getPracticeReport(

                    request,

                    'Data & AI',

                );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(response);



                const invalidStartDates =

                    (data.employees || []).filter(

                        employee =>

                            employee.startDate &&

                            !isValidDateFormat(

                                employee.startDate,

                            ),

                    );



                const invalidEndDates =

                    (data.employees || []).filter(

                        employee =>

                            employee.endDate &&

                            !isValidDateFormat(

                                employee.endDate,

                            ),

                    );



                console.log(

                    `URP-EV04 - Invalid start dates: ${invalidStartDates.length}`,

                );



                console.log(

                    `URP-EV04 - Invalid end dates: ${invalidEndDates.length}`,

                );



                expect(

                    invalidStartDates,

                ).toHaveLength(0);



                expect(

                    invalidEndDates,

                ).toHaveLength(0);

            },

        );



        /**

         * ========================================================

         * NEGATIVE TEST CASES

         * ========================================================

         */



        test(

            'URP-N01 - Validate request without API token',

            async ({ request }) => {

                const response =

                    await request.get(

                        getPracticeUrl(

                            'Data & AI',

                        ),

                        {

                            headers: {

                                Accept:

                                    'application/json',

                            },

                        },

                    );



                console.log('\nURP-N01');

                console.log(

                    `HTTP Status without token: ${response.status()}`,

                );



                expect(

                    response.status(),

                    'API should reject a request without authentication',

                ).toBeGreaterThanOrEqual(400);



                expect(

                    response.status(),

                ).toBeLessThan(500);

            },

        );



        test(

            'URP-N02 - Validate request with invalid API token',

            async ({ request }) => {

                const response =

                    await request.get(

                        getPracticeUrl(

                            'Data & AI',

                        ),

                        {

                            headers: {

                                Authorization:

                                    'Bearer invalid-token-123456789',

                                Accept:

                                    'application/json',

                            },

                        },

                    );



                console.log('\nURP-N02');

                console.log(

                    `HTTP Status with invalid token: ${response.status()}`,

                );



                expect(

                    response.status(),

                ).toBeGreaterThanOrEqual(400);



                expect(

                    response.status(),

                ).toBeLessThan(500);

            },

        );



        test(

            'URP-N03 - Validate request without practice parameter',

            async ({ request }) => {

                const response =

                    await request.get(

                        `${UTILIZATION_BASE_URL}?asOfDate=${encodeURIComponent(

                            AS_OF_DATE,

                        )}`,

                        {

                            headers:

                                API_HEADERS,

                        },

                    );



                console.log('\nURP-N03');

                console.log(

                    `HTTP Status without practice: ${response.status()}`,

                );



                /**

                 * Do not assume that practice is mandatory.

                 *

                 * If the API returns 200, validate and document

                 * the actual behavior.

                 */

                if (response.status() === 200) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    console.log(

                        'URP-N03 - API accepts missing practice parameter.',

                    );



                    console.log(

                        `URP-N03 - Report Date: ${data.reportDate}`,

                    );



                    console.log(

                        `URP-N03 - Employee Records: ${data.employees?.length}`,

                    );



                    expect(data).toBeDefined();

                    expect(

                        data.summary,

                    ).toBeDefined();



                    expect(

                        Array.isArray(

                            data.employees,

                        ),

                    ).toBe(true);

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);



                    expect(

                        response.status(),

                    ).toBeLessThan(500);

                }

            },

        );



        test(

            'URP-N04 - Validate invalid practice name',

            async ({ request }) => {

                const invalidPractice =

                    'Invalid Practice XYZ';



                const response =

                    await getPracticeReport(

                        request,

                        invalidPractice,

                    );



                console.log('\nURP-N04');

                console.log(

                    `Invalid Practice: ${invalidPractice}`,

                );

                console.log(

                    `HTTP Status     : ${response.status()}`,

                );



                /**

                 * Do not hard-code an expected status until

                 * the API contract confirms it.

                 */

                if (

                    response.status() >= 200 &&

                    response.status() < 300

                ) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    console.log(

                        'URP-N04 - API accepts invalid practice value.',

                    );



                    console.log(

                        `Returned Employees: ${data.employees?.length}`,

                    );



                    expect(data).toBeDefined();

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);



                    expect(

                        response.status(),

                    ).toBeLessThan(500);

                }

            },

        );



        test(

            'URP-N05 - Validate empty practice parameter',

            async ({ request }) => {

                const response =

                    await getPracticeReport(

                        request,

                        '',

                    );



                console.log('\nURP-N05');

                console.log(

                    `HTTP Status with empty practice: ${response.status()}`,

                );



                if (response.status() === 200) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    console.log(

                        'URP-N05 - API accepts empty practice.',

                    );



                    expect(data).toBeDefined();

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);



                    expect(

                        response.status(),

                    ).toBeLessThan(500);

                }

            },

        );



        test(

            'URP-N06 - Validate invalid date with valid practice',

            async ({ request }) => {

                const invalidDate =

                    '2026-99-99';



                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                        invalidDate,

                    );



                console.log('\nURP-N06');

                console.log(

                    `Invalid Date: ${invalidDate}`,

                );

                console.log(

                    `HTTP Status : ${response.status()}`,

                );



                /**

                 * Actual API behavior is captured rather

                 * than assumed.

                 */

                if (

                    response.status() === 200

                ) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    expect(data).toBeDefined();



                    console.log(

                        'URP-N06 - API accepted invalid calendar date.',

                    );

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);



                    expect(

                        response.status(),

                    ).toBeLessThan(500);

                }

            },

        );



        test(

            'URP-N07 - Validate invalid endpoint',

            async ({ request }) => {

                const invalidEndpoint =

                    `${BASE_URL}/api/v1/utilization/reports/invalid-endpoint`;



                const response =

                    await request.get(

                        invalidEndpoint,

                        {

                            headers:

                                API_HEADERS,

                        },

                    );



                console.log('\nURP-N07');

                console.log(

                    `HTTP Status: ${response.status()}`,

                );



                expect(

                    response.status(),

                ).toBeGreaterThanOrEqual(400);



                expect(

                    response.status(),

                ).toBeLessThan(500);

            },

        );



        test(

            'URP-N08 - Validate unsupported HTTP method',

            async ({ request }) => {

                const response =

                    await request.post(

                        getPracticeUrl(

                            'Data & AI',

                        ),

                        {

                            headers:

                                API_HEADERS,

                        },

                    );



                console.log('\nURP-N08');

                console.log(

                    `POST HTTP Status: ${response.status()}`,

                );



                expect(

                    response.status(),

                ).toBeGreaterThanOrEqual(400);



                expect(

                    response.status(),

                ).toBeLessThan(500);

            },

        );



        /**

         * ========================================================

         * EDGE CASES

         * ========================================================

         */



        test(

            'URP-E01 - Validate current asOfDate',

            async ({ request }) => {

                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                        '2026-10-06',

                    );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(

                        response,

                    );



                expect(data.reportDate).toBe(

                    '2026-10-06',

                );



                console.log(

                    'URP-E01 - Current date validated',

                );

            },

        );



        test(

            'URP-E02 - Validate previous date',

            async ({ request }) => {

                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                        '2026-10-05',

                    );



                expect(response.status()).toBe(200);



                const data =

                    await getJsonResponse(

                        response,

                    );



                expect(data.reportDate).toBe(

                    '2026-10-05',

                );



                console.log(

                    'URP-E02 - Previous date validated',

                );

            },

        );



        test(

            'URP-E03 - Validate historical date',

            async ({ request }) => {

                const historicalDate =

                    '2025-01-01';



                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                        historicalDate,

                    );



                console.log(

                    `URP-E03 - HTTP Status: ${response.status()}`,

                );



                if (response.status() === 200) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    expect(

                        data.reportDate,

                    ).toBe(historicalDate);



                    expect(data.summary).toBeDefined();



                    expect(

                        Array.isArray(

                            data.employees,

                        ),

                    ).toBe(true);

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);

                }

            },

        );



        test(

            'URP-E04 - Validate future date',

            async ({ request }) => {

                const futureDate =

                    '2030-01-01';



                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                        futureDate,

                    );



                console.log(

                    `URP-E04 - Future date HTTP Status: ${response.status()}`,

                );



                if (response.status() === 200) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    expect(data).toBeDefined();



                    console.log(

                        `URP-E04 - Employees returned: ${data.employees?.length}`,

                    );

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);

                }

            },

        );



        test(

            'URP-E05 - Validate leap year date',

            async ({ request }) => {

                const leapYearDate =

                    '2028-02-29';



                expect(

                    isValidCalendarDate(

                        leapYearDate,

                    ),

                ).toBe(true);



                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                        leapYearDate,

                    );



                console.log(

                    `URP-E05 - HTTP Status: ${response.status()}`,

                );



                if (response.status() === 200) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    expect(data).toBeDefined();

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);

                }

            },

        );



        test(

            'URP-E06 - Validate month boundary date',

            async ({ request }) => {

                const boundaryDate =

                    '2026-10-01';



                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                        boundaryDate,

                    );



                console.log(

                    `URP-E06 - HTTP Status: ${response.status()}`,

                );



                if (response.status() === 200) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    expect(

                        data.reportDate,

                    ).toBe(boundaryDate);

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);

                }

            },

        );



        test(

            'URP-E07 - Validate year boundary date',

            async ({ request }) => {

                const yearBoundaryDate =

                    '2027-01-01';



                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                        yearBoundaryDate,

                    );



                console.log(

                    `URP-E07 - HTTP Status: ${response.status()}`,

                );



                if (response.status() === 200) {

                    const data =

                        await getJsonResponse(

                            response,

                        );



                    expect(data).toBeDefined();

                } else {

                    expect(

                        response.status(),

                    ).toBeGreaterThanOrEqual(400);

                }

            },

        );



        /**

         * ========================================================

         * SPECIAL PRACTICE / URL ENCODING

         * ========================================================

         */



        test(

            'URP-ENC01 - Validate Data & AI special character encoding',

            async ({ request }) => {

                const practice = 'Data & AI';



                const url =

                    getPracticeUrl(

                        practice,

                    );



                console.log('\nURP-ENC01');

                console.log(

                    `Generated URL: ${url}`,

                );



                expect(url).toContain(

                    'practice=Data+%26+AI',

                );



                const response =

                    await request.get(

                        url,

                        {

                            headers:

                                API_HEADERS,

                        },

                    );



                expect(response.status()).toBe(

                    200,

                );



                const data =

                    await getJsonResponse(

                        response,

                    );



                expect(

                    Array.isArray(

                        data.employees,

                    ),

                ).toBe(true);



                console.log(

                    `URP-ENC01 - Employees returned: ${data.employees?.length}`,

                );

            },

        );



        /**

         * ========================================================

         * API QUALITY

         * ========================================================

         */



        test(

            'URP-A01 - Validate API response time',

            async ({ request }) => {

                const startTime =

                    Date.now();



                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                    );



                const responseTime =

                    Date.now() - startTime;



                expect(response.status()).toBe(

                    200,

                );



                console.log('\nURP-A01');

                console.log(

                    `Response Time: ${responseTime} ms`,

                );



                /**

                 * No hard SLA assertion because the API

                 * SLA has not been formally confirmed.

                 */

                if (responseTime < 2000) {

                    console.log(

                        'URP-A01 - Response time: GOOD',

                    );

                } else if (responseTime < 5000) {

                    console.log(

                        'URP-A01 - Response time: ACCEPTABLE',

                    );

                } else {

                    console.warn(

                        'URP-A01 - Response time: SLOW',

                    );

                }

            },

        );



        test(

            'URP-A02 - Validate Content-Type',

            async ({ request }) => {

                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                    );



                expect(response.status()).toBe(

                    200,

                );



                const contentType =

                    response.headers()[

                    'content-type'

                    ] || '';



                console.log(

                    `URP-A02 - Content-Type: ${contentType}`,

                );



                expect(

                    contentType.toLowerCase(),

                ).toContain(

                    'application/json',

                );

            },

        );



        test(

            'URP-A03 - Validate response schema',

            async ({ request }) => {

                const response =

                    await getPracticeReport(

                        request,

                        'Data & AI',

                    );



                expect(response.status()).toBe(

                    200,

                );



                const data =

                    await getJsonResponse(

                        response,

                    );



                expect(

                    typeof data.reportDate,

                ).toBe('string');



                expect(

                    typeof data.reportType,

                ).toBe('string');



                expect(

                    typeof data.summary,

                ).toBe('object');



                expect(

                    Array.isArray(

                        data.employees,

                    ),

                ).toBe(true);



                const summary =

                    data.summary!;



                expect(

                    summary.totalEmployees,

                ).not.toBeUndefined();



                expect(

                    summary.production,

                ).not.toBeUndefined();



                expect(

                    summary.internal,

                ).not.toBeUndefined();



                expect(

                    summary.training,

                ).not.toBeUndefined();



                expect(

                    summary.bench,

                ).not.toBeUndefined();



                expect(

                    summary.utilizationPercentage,

                ).not.toBeUndefined();



                console.log(

                    'URP-A03 - Response schema validated',

                );

            },

        );



        test(

            'URP-A04 - Validate response consistency for repeated requests',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response1 =

                    await getPracticeReport(

                        request,

                        practice,

                    );



                const response2 =

                    await getPracticeReport(

                        request,

                        practice,

                    );



                expect(

                    response1.status(),

                ).toBe(200);



                expect(

                    response2.status(),

                ).toBe(200);



                const data1 =

                    await getJsonResponse(

                        response1,

                    );



                const data2 =

                    await getJsonResponse(

                        response2,

                    );



                expect(

                    data1.reportDate,

                ).toBe(

                    data2.reportDate,

                );



                expect(

                    data1.reportType,

                ).toBe(

                    data2.reportType,

                );



                expect(

                    data1.summary,

                ).toEqual(

                    data2.summary,

                );



                expect(

                    data1.employees?.length,

                ).toBe(

                    data2.employees?.length,

                );



                console.log(

                    'URP-A04 - Repeated requests returned consistent results',

                );

            },

        );



        /**

         * ========================================================

         * PRACTICE SUMMARY INVESTIGATION

         * ========================================================

         */



        test(

            'URP-SUM01 - Print complete Data & AI utilization summary',

            async ({ request }) => {

                const practice = 'Data & AI';



                const response =

                    await getPracticeReport(

                        request,

                        practice,

                    );



                expect(response.status()).toBe(

                    200,

                );



                const data =

                    await getJsonResponse(

                        response,

                    );



                const summary =

                    data.summary!;



                console.log('\n');

                console.log(

                    '='.repeat(70),

                );

                console.log(

                    'DATA & AI UTILIZATION SUMMARY',

                );

                console.log(

                    '='.repeat(70),

                );



                console.log(

                    `Practice             : ${practice}`,

                );



                console.log(

                    `Report Date          : ${data.reportDate}`,

                );



                console.log(

                    `Report Type          : ${data.reportType}`,

                );



                console.log(

                    `Total Employees      : ${summary.totalEmployees}`,

                );



                console.log(

                    `Production           : ${summary.production}`,

                );



                console.log(

                    `Internal             : ${summary.internal}`,

                );



                console.log(

                    `Training             : ${summary.training}`,

                );



                console.log(

                    `Bench                : ${summary.bench}`,

                );



                console.log(

                    `Utilization %        : ${summary.utilizationPercentage}`,

                );



                console.log(

                    `Employee Records     : ${data.employees?.length}`,

                );



                console.log(

                    '='.repeat(70),

                );



                expect(

                    Number(summary.totalEmployees),

                ).toBeGreaterThanOrEqual(0);



                expect(

                    Number(summary.production),

                ).toBeGreaterThanOrEqual(0);



                expect(

                    Number(summary.internal),

                ).toBeGreaterThanOrEqual(0);



                expect(

                    Number(summary.training),

                ).toBeGreaterThanOrEqual(0);



                expect(

                    Number(summary.bench),

                ).toBeGreaterThanOrEqual(0);

            },

        );



        /**

         * ========================================================

         * ALL CONFIRMED PRACTICES

         * ========================================================

         */



        test(

            'URP-PR04 - Validate all confirmed practices',

            async ({ request }) => {

                const results: Array<{

                    practice: string;

                    status: number;

                    employees: number;

                    mismatches: number;

                }> = [];



                for (

                    const practice of VALID_PRACTICES

                ) {

                    const response =

                        await getPracticeReport(

                            request,

                            practice,

                        );



                    expect(

                        response.status(),

                        `${practice} should return HTTP 200`,

                    ).toBe(200);



                    const data =

                        await getJsonResponse(

                            response,

                        );



                    const employees =

                        data.employees || [];



                    const mismatches =

                        employees.filter(

                            employee =>

                                normalizeString(

                                    employee.practice,

                                ) !==

                                normalizeString(

                                    practice,

                                ),

                        );



                    results.push({

                        practice,

                        status:

                            response.status(),

                        employees:

                            employees.length,

                        mismatches:

                            mismatches.length,

                    });



                    expect(

                        mismatches,

                        `Practice mismatch found for ${practice}`,

                    ).toHaveLength(0);

                }



                console.log('\n');

                console.log(

                    '='.repeat(70),

                );

                console.log(

                    'PRACTICE API VALIDATION SUMMARY',

                );

                console.log(

                    '='.repeat(70),

                );



                for (

                    const result of results

                ) {

                    console.log(

                        `${result.practice.padEnd(30)} | ` +

                        `Status: ${result.status} | ` +

                        `Employees: ${result.employees} | ` +

                        `Mismatches: ${result.mismatches}`,

                    );

                }



                console.log(

                    '='.repeat(70),

                );

            },

        );

    },

);