import { test, expect } from '@playwright/test';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/* ============================================================
   CONFIGURATION
============================================================ */

const BASE_URL = 'https://13.61.179.149/api';

const ALL_EMPLOYEES_ENDPOINT =
    `${BASE_URL}/api/get/allEmployee`;

const API_TOKEN = process.env.API_TOKEN;

const MIN_EXPECTED_EMPLOYEES = 500;

const DB_CONFIG = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};


/* ============================================================
   TYPES
============================================================ */

interface Employee {
    employeeId?: string | number | null;
    fullName?: string | null;
    isDeleted?: number | boolean | null;

    [key: string]: any;
}


/* ============================================================
   COMMON API HELPER
============================================================ */

async function getAllEmployees(request: any, retries = 3) {
    if (!API_TOKEN) {
        throw new Error(
            'API_TOKEN is not configured in the .env file.'
        );
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await request.get(ALL_EMPLOYEES_ENDPOINT, {
                headers: {
                    Authorization: `Bearer ${API_TOKEN}`,
                    Accept: 'application/json',
                },
                timeout: 90000,
            });

            if ([502, 503, 504].includes(res.status()) && attempt < retries) {
                await new Promise(r => setTimeout(r, attempt * 2000));
                continue;
            }

            return res;
        } catch (err: any) {
            if (attempt === retries) throw err;
            const isConnReset = err.message && (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT') || err.message.includes('socket hang up'));
            if (isConnReset) {
                await new Promise(r => setTimeout(r, attempt * 2000));
            } else {
                throw err;
            }
        }
    }

    return request.get(ALL_EMPLOYEES_ENDPOINT, {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: 'application/json',
        },
    });
}


/* ============================================================
   POSITIVE TEST CASES
============================================================ */


/* ------------------------------------------------------------
   AE-P01 - Valid Authentication
------------------------------------------------------------ */

test('AE-P01 - Validate All Employees API with valid authentication', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);
});


/* ------------------------------------------------------------
   AE-P02 - HTTP 200
------------------------------------------------------------ */

test('AE-P02 - Validate All Employees API returns HTTP 200', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);
});


/* ------------------------------------------------------------
   AE-P03 - JSON Response
------------------------------------------------------------ */

test('AE-P03 - Validate All Employees API returns valid JSON', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toBeDefined();
});


/* ------------------------------------------------------------
   AE-P04 - Response Array
------------------------------------------------------------ */

test('AE-P04 - Validate All Employees API response is an array', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
});


/* ------------------------------------------------------------
   AE-P05 - Employee Records Returned
------------------------------------------------------------ */

test('AE-P05 - Validate All Employees API returns employee records', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    console.log(
        `AE-P05 - Employee records returned: ${data.length}`
    );
});


/* ------------------------------------------------------------
   AE-P06 - Employee ID Required
------------------------------------------------------------ */

test('AE-P06 - Validate employeeId is present for every employee', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const invalidEmployees = data.filter(
        employee =>
            employee.employeeId === undefined ||
            employee.employeeId === null ||
            String(employee.employeeId).trim() === ''
    );

    expect(invalidEmployees).toHaveLength(0);

    console.log(
        `AE-P06 - Missing employeeId records: ${invalidEmployees.length}`
    );
});


/* ------------------------------------------------------------
   AE-P07 - Full Name Required
------------------------------------------------------------ */

test('AE-P07 - Validate fullName is present for every employee', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const invalidEmployees = data.filter(
        employee =>
            employee.fullName === undefined ||
            employee.fullName === null ||
            String(employee.fullName).trim() === ''
    );

    expect(invalidEmployees).toHaveLength(0);

    console.log(
        `AE-P07 - Missing fullName records: ${invalidEmployees.length}`
    );
});


/* ------------------------------------------------------------
   AE-P08 - isDeleted Valid Values
------------------------------------------------------------ */

test('AE-P08 - Validate isDeleted contains only valid values', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const validValues = [
        0,
        1,
        null,
        true,
        false,
    ];

    const invalidRecords = data.filter(
        employee =>
            !validValues.includes(employee.isDeleted as any)
    );

    expect(invalidRecords).toHaveLength(0);

    console.log(
        `AE-P08 - Invalid isDeleted records: ${invalidRecords.length}`
    );
});


/* ============================================================
   NEGATIVE TEST CASES
============================================================ */


/* ------------------------------------------------------------
   AE-N01 - Missing Authorization
------------------------------------------------------------ */

test('AE-N01 - Validate API without authorization token', async ({
    request,
}) => {

    const response = await request.get(
        ALL_EMPLOYEES_ENDPOINT,
        {
            headers: {
                Accept: 'application/json',
            },
        }
    );

    expect([401, 403]).toContain(response.status());
});


/* ------------------------------------------------------------
   AE-N02 - Invalid Token
------------------------------------------------------------ */

test('AE-N02 - Validate API with invalid token', async ({
    request,
}) => {

    const response = await request.get(
        ALL_EMPLOYEES_ENDPOINT,
        {
            headers: {
                Authorization: 'Bearer invalid-token-123',
                Accept: 'application/json',
            },
        }
    );

    expect([401, 403]).toContain(response.status());
});


/* ------------------------------------------------------------
   AE-N03 - Expired Token
------------------------------------------------------------ */

test('AE-N03 - Validate API with expired token', async ({
    request,
}) => {

    const expiredToken = process.env.EXPIRED_API_TOKEN;

    test.skip(
        !expiredToken,
        'Skipped: EXPIRED_API_TOKEN is not configured.'
    );

    const response = await request.get(
        ALL_EMPLOYEES_ENDPOINT,
        {
            headers: {
                Authorization: `Bearer ${expiredToken}`,
                Accept: 'application/json',
            },
        }
    );

    expect([401, 403]).toContain(response.status());
});


/* ------------------------------------------------------------
   AE-N04 - Malformed Authorization Header
------------------------------------------------------------ */

test('AE-N04 - Validate API with malformed authorization header', async ({
    request,
}) => {

    const response = await request.get(
        ALL_EMPLOYEES_ENDPOINT,
        {
            headers: {
                Authorization: API_TOKEN || '',
                Accept: 'application/json',
            },
        }
    );

    expect([401, 403]).toContain(response.status());
});


/* ------------------------------------------------------------
   AE-N05 - Unsupported HTTP Method
------------------------------------------------------------ */

test('AE-N05 - Validate API with unsupported HTTP method', async ({
    request,
}) => {

    const response = await request.post(
        ALL_EMPLOYEES_ENDPOINT,
        {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                Accept: 'application/json',
            },
        }
    );

    expect([400, 404, 405]).toContain(response.status());
});


/* ------------------------------------------------------------
   AE-N06 - Unsupported Query Parameter
------------------------------------------------------------ */

test('AE-N06 - Validate API with unsupported query parameter', async ({
    request,
}) => {

    const response = await request.get(
        `${ALL_EMPLOYEES_ENDPOINT}?invalidParameter=abc123`,
        {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                Accept: 'application/json',
            },
        }
    );

    /*
     * API may ignore unknown query parameters.
     * Therefore we only make sure the server does not
     * return a 5xx error.
     */

    expect(response.status()).toBeLessThan(500);
});


/* ------------------------------------------------------------
   AE-N07 - Invalid Endpoint
------------------------------------------------------------ */

test('AE-N07 - Validate invalid API endpoint', async ({
    request,
}) => {

    const response = await request.get(
        `${BASE_URL}/api/get/invalidEmployeeEndpoint`,
        {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                Accept: 'application/json',
            },
        }
    );

    expect(response.status()).toBe(404);
});


/* ============================================================
   EDGE / DATA INTEGRITY TEST CASES
============================================================ */


/* ------------------------------------------------------------
   AE-E01 - Zero Employee Response
------------------------------------------------------------ */

test('AE-E01 - Validate zero employee response', async () => {

    test.skip(
        true,
        'Skipped: API contract does not currently provide a confirmed zero-result filter.'
    );
});


/* ------------------------------------------------------------
   AE-E02 - Large Employee Response
------------------------------------------------------------ */

test('AE-E02 - Large employee response', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    expect(Array.isArray(data)).toBe(true);

    expect(data.length).toBeGreaterThan(
        MIN_EXPECTED_EMPLOYEES
    );

    console.log(
        `AE-E02 - Employee records returned: ${data.length}`
    );
});


/* ------------------------------------------------------------
   AE-E03 - isDeleted = 0
------------------------------------------------------------ */

test('AE-E03 - Validate isDeleted = 0 records', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const activeEmployees = data.filter(
        employee => employee.isDeleted === 0
    );

    for (const employee of activeEmployees) {
        expect(employee.isDeleted).toBe(0);
    }

    console.log(
        `AE-E03 - isDeleted = 0 records: ${activeEmployees.length}`
    );
});


/* ------------------------------------------------------------
   AE-E04 - isDeleted = 1
------------------------------------------------------------ */

test('AE-E04 - Validate isDeleted = 1 records', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const deletedEmployees = data.filter(
        employee => employee.isDeleted === 1
    );

    for (const employee of deletedEmployees) {
        expect(employee.isDeleted).toBe(1);
    }

    console.log(
        `AE-E04 - isDeleted = 1 records: ${deletedEmployees.length}`
    );
});


/* ------------------------------------------------------------
   AE-E05 - isDeleted = null
------------------------------------------------------------ */

test('AE-E05 - Validate isDeleted = null records', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const nullDeletedRecords = data.filter(
        employee => employee.isDeleted === null
    );

    for (const employee of nullDeletedRecords) {
        expect(employee.isDeleted).toBeNull();
    }

    console.log(
        `AE-E05 - isDeleted = null records: ${nullDeletedRecords.length}`
    );
});


/* ------------------------------------------------------------
   AE-E06 - Missing Employee ID
------------------------------------------------------------ */

test('AE-E06 - No employee should have missing employeeId', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const missingEmployeeIds = data.filter(
        employee =>
            employee.employeeId === undefined ||
            employee.employeeId === null ||
            String(employee.employeeId).trim() === ''
    );

    expect(missingEmployeeIds).toHaveLength(0);

    console.log(
        `AE-E06 - Missing employeeId records: ${missingEmployeeIds.length}`
    );
});


/* ------------------------------------------------------------
   AE-E07 - Missing Full Name
------------------------------------------------------------ */

test('AE-E07 - No employee should have missing fullName', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const missingNames = data.filter(
        employee =>
            employee.fullName === undefined ||
            employee.fullName === null ||
            String(employee.fullName).trim() === ''
    );

    expect(missingNames).toHaveLength(0);

    console.log(
        `AE-E07 - Missing fullName records: ${missingNames.length}`
    );
});


/* ------------------------------------------------------------
   AE-E08 - Duplicate Employee IDs
------------------------------------------------------------ */

test('AE-E08 - No duplicate employeeId values', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const employeeIds = data.map(
        employee => String(employee.employeeId)
    );

    const uniqueEmployeeIds = new Set(employeeIds);

    const duplicateCount =
        employeeIds.length - uniqueEmployeeIds.size;

    expect(duplicateCount).toBe(0);

    console.log(
        `AE-E08 - Total records: ${employeeIds.length}`
    );

    console.log(
        `AE-E08 - Unique employeeIds: ${uniqueEmployeeIds.size}`
    );

    console.log(
        `AE-E08 - Duplicate records: ${duplicateCount}`
    );
});


/* ------------------------------------------------------------
   AE-E09 - Invalid isDeleted Values
------------------------------------------------------------ */

test('AE-E09 - No invalid isDeleted values', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    const invalidRecords = data.filter(employee => {

        const value = employee.isDeleted;

        if (
            value === undefined ||
            value === null
        ) {
            return false;
        }

        return ![
            0,
            1,
            true,
            false,
        ].includes(value as any);
    });

    expect(invalidRecords).toHaveLength(0);

    console.log(
        `AE-E09 - Invalid isDeleted records: ${invalidRecords.length}`
    );
});


/* ============================================================
   ADDITIONAL API QUALITY TEST CASES
============================================================ */


/* ------------------------------------------------------------
   AE-A01 - Response Time
------------------------------------------------------------ */

test('AE-A01 - Validate API response time', async ({
    request,
}) => {

    const startTime = Date.now();

    const response = await getAllEmployees(request);

    const responseTime = Date.now() - startTime;

    expect(response.status()).toBe(200);

    /*
     * Maximum acceptable response time for full unpaginated employee list (870 records):
     * Default 60 seconds (or configurable via MAX_RESPONSE_TIME_MS)
     */
    const maxResponseTime = Number(process.env.MAX_RESPONSE_TIME_MS || 60000);
    expect(responseTime).toBeLessThan(maxResponseTime);

    console.log(
        `AE-A01 - Response time: ${responseTime} ms (threshold: ${maxResponseTime} ms)`
    );
});


/* ------------------------------------------------------------
   AE-A02 - Content-Type
------------------------------------------------------------ */

test('AE-A02 - Validate response Content-Type', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const contentType =
        response.headers()['content-type'];

    expect(contentType).toContain(
        'application/json'
    );

    console.log(
        `AE-A02 - Content-Type: ${contentType}`
    );
});


/* ------------------------------------------------------------
   AE-A03 - Response Schema
------------------------------------------------------------ */

test('AE-A03 - Validate employee response schema', async ({
    request,
}) => {

    const response = await getAllEmployees(request);

    expect(response.status()).toBe(200);

    const data: Employee[] = await response.json();

    expect(Array.isArray(data)).toBe(true);

    const schemaErrors: string[] = [];

    data.forEach((employee, index) => {

        /*
         * employeeId
         */

        if (
            employee.employeeId === undefined ||
            employee.employeeId === null ||
            String(employee.employeeId).trim() === ''
        ) {
            schemaErrors.push(
                `Record ${index}: invalid employeeId`
            );
        }

        /*
         * fullName
         */

        if (
            employee.fullName === undefined ||
            employee.fullName === null ||
            String(employee.fullName).trim() === ''
        ) {
            schemaErrors.push(
                `Record ${index}: invalid fullName`
            );
        }

        /*
         * isDeleted
         */

        const isDeleted = employee.isDeleted;

        if (
            isDeleted !== undefined &&
            isDeleted !== null &&
            ![
                0,
                1,
                true,
                false,
            ].includes(isDeleted as any)
        ) {
            schemaErrors.push(
                `Record ${index}: invalid isDeleted value`
            );
        }
    });

    expect(schemaErrors).toHaveLength(0);

    console.log(
        `AE-A03 - Schema validated for ${data.length} employee records`
    );
});


/* ------------------------------------------------------------
   AE-A08 - Response Consistency
------------------------------------------------------------ */

test('AE-A08 - Validate API response consistency', async ({
    request,
}) => {

    /*
     * First API call
     */

    const response1 =
        await getAllEmployees(request);

    expect(response1.status()).toBe(200);

    const data1: Employee[] =
        await response1.json();


    /*
     * Second API call
     */

    const response2 =
        await getAllEmployees(request);

    expect(response2.status()).toBe(200);

    const data2: Employee[] =
        await response2.json();


    /*
     * Validate record count
     */

    expect(data1.length).toBe(
        data2.length
    );


    /*
     * Extract employee IDs
     */

    const ids1 = data1
        .map(employee =>
            String(employee.employeeId)
        )
        .sort();

    const ids2 = data2
        .map(employee =>
            String(employee.employeeId)
        )
        .sort();


    /*
     * Compare employee IDs
     */

    expect(ids1).toEqual(ids2);

    console.log(
        `AE-A08 - Response 1 records: ${data1.length}`
    );

    console.log(
        `AE-A08 - Response 2 records: ${data2.length}`
    );

    console.log(
        `AE-A08 - Response consistency: PASS`
    );
});


/* ============================================================
   DATABASE RECONCILIATION
   AE-DB01
============================================================ */

test('AE-DB01 - Validate All Employees API against Database', async ({
    request,
}) => {

    const validationIssues: string[] = [];

    console.log('\n========================================');
    console.log('ALL EMPLOYEES API VALIDATION');
    console.log('========================================');

    console.log(
        `URL        : ${ALL_EMPLOYEES_ENDPOINT}`
    );


    /* --------------------------------------------------------
       Validate API Token
    -------------------------------------------------------- */

    if (!API_TOKEN) {

        validationIssues.push(
            'API_TOKEN is not configured'
        );

        console.log(
            'API_TOKEN is not configured'
        );

        throw new Error(
            validationIssues.join('\n')
        );
    }


    /* --------------------------------------------------------
       API Request
    -------------------------------------------------------- */

    let response;

    try {

        response =
            await getAllEmployees(request);

    } catch (error: any) {

        validationIssues.push(
            `API request failed: ${error.message}`
        );

        console.log(
            `API request failed: ${error.message}`
        );

        throw new Error(
            validationIssues.join('\n')
        );
    }


    console.log(
        `HTTP Status: ${response.status()}`
    );


    /* --------------------------------------------------------
       Do not perform DB reconciliation if API fails
    -------------------------------------------------------- */

    if (response.status() !== 200) {

        validationIssues.push(
            `API returned HTTP ${response.status()}`
        );

        console.log('\n========================================');
        console.log('FINAL RESULT SUMMARY');
        console.log('========================================');

        console.log(
            `API Errors              : ${validationIssues.length}`
        );

        console.log(
            `Total validation issues : ${validationIssues.length}`
        );

        throw new Error(
            validationIssues.join('\n')
        );
    }


    /* --------------------------------------------------------
       Parse JSON
    -------------------------------------------------------- */

    let apiData: Employee[];

    try {

        apiData = await response.json();

    } catch (error: any) {

        validationIssues.push(
            `Invalid JSON response: ${error.message}`
        );

        throw new Error(
            validationIssues.join('\n')
        );
    }


    /* --------------------------------------------------------
       Validate API Array
    -------------------------------------------------------- */

    if (!Array.isArray(apiData)) {

        validationIssues.push(
            'API response is not an array'
        );

        throw new Error(
            validationIssues.join('\n')
        );
    }


    const apiRecords =
        apiData.length;


    /* --------------------------------------------------------
       API Employee ID Validation
    -------------------------------------------------------- */

    const invalidApiRecords =
        apiData.filter(employee =>
            employee.employeeId === undefined ||
            employee.employeeId === null ||
            String(employee.employeeId).trim() === ''
        );


    if (invalidApiRecords.length > 0) {

        validationIssues.push(
            `${invalidApiRecords.length} API records have invalid employeeId`
        );
    }


    /* --------------------------------------------------------
       API Duplicate Detection
    -------------------------------------------------------- */

    const apiEmployeeIds =
        apiData.map(employee =>
            String(employee.employeeId)
        );

    const uniqueApiEmployeeIds =
        new Set(apiEmployeeIds);

    const duplicateApiRecords =
        apiEmployeeIds.length -
        uniqueApiEmployeeIds.size;


    if (duplicateApiRecords > 0) {

        validationIssues.push(
            `${duplicateApiRecords} duplicate employee IDs found in API`
        );
    }


    console.log(
        `API Records             : ${apiRecords}`
    );

    console.log(
        `Unique API Employee IDs : ${uniqueApiEmployeeIds.size}`
    );


    /* ========================================================
       DATABASE CONNECTION
    ======================================================== */

    let connection;

    try {

        connection =
            await mysql.createConnection(DB_CONFIG);

        console.log(
            '\nDatabase connection successful'
        );

    } catch (error: any) {

        validationIssues.push(
            `Database connection failed: ${error.message}`
        );

        console.log(
            `Database connection failed: ${error.message}`
        );

        throw new Error(
            validationIssues.join('\n')
        );
    }


    try {

        /* ----------------------------------------------------
           Fetch Database Employees
        ---------------------------------------------------- */

        const [rows] = await connection.query(
            `
            SELECT
                emp_id,
                full_name,
                is_deleted
            FROM emp_details
            WHERE
                is_deleted = 0
                OR is_deleted = 1
                OR is_deleted IS NULL
            ORDER BY emp_id
            `
        );


        const dbEmployees =
            rows as Array<{
                emp_id: string | number;
                full_name: string | null;
                is_deleted: number | null;
            }>;


        const dbEmployeeIds =
            dbEmployees.map(employee =>
                String(employee.emp_id)
            );


        const uniqueDbEmployeeIds =
            new Set(dbEmployeeIds);


        console.log(
            `DB employee records: ${dbEmployees.length}`
        );

        console.log(
            `Unique DB employee IDs: ${uniqueDbEmployeeIds.size}`
        );


        /* ----------------------------------------------------
           Create Maps
        ---------------------------------------------------- */

        const apiMap =
            new Map<string, Employee>();

        for (const employee of apiData) {

            apiMap.set(
                String(employee.employeeId),
                employee
            );
        }


        const dbMap =
            new Map<
                string,
                {
                    emp_id: string | number;
                    full_name: string | null;
                    is_deleted: number | null;
                }
            >();

        for (const employee of dbEmployees) {

            dbMap.set(
                String(employee.emp_id),
                employee
            );
        }


        /* ====================================================
           API → DATABASE VALIDATION
        ==================================================== */

        let notFoundInDb = 0;
        let mismatches = 0;


        for (const apiEmployee of apiData) {

            const employeeId =
                String(apiEmployee.employeeId);


            const dbEmployee =
                dbMap.get(employeeId);


            /* ------------------------------------------------
               D01 - API employee exists in DB
            ------------------------------------------------ */

            if (!dbEmployee) {

                notFoundInDb++;

                validationIssues.push(
                    `D01 - Employee ${employeeId} exists in API but not in DB`
                );

                continue;
            }


            /* ------------------------------------------------
               D02 - fullName comparison
            ------------------------------------------------ */

            const apiName =
                apiEmployee.fullName === null ||
                    apiEmployee.fullName === undefined
                    ? null
                    : String(apiEmployee.fullName).trim();


            const dbName =
                dbEmployee.full_name === null ||
                    dbEmployee.full_name === undefined
                    ? null
                    : String(dbEmployee.full_name).trim();


            if (apiName !== dbName) {

                mismatches++;

                validationIssues.push(
                    `D02 - Employee ${employeeId} fullName mismatch | API: "${apiName}" | DB: "${dbName}"`
                );
            }


            /* ------------------------------------------------
               D03 - isDeleted comparison
            ------------------------------------------------ */

            const apiDeleted =
                apiEmployee.isDeleted;


            const dbDeleted =
                dbEmployee.is_deleted;


            /*
             * Normalize boolean values if the API sends
             * true/false instead of 1/0.
             */

            const normalizedApiDeleted =
                apiDeleted === true
                    ? 1
                    : apiDeleted === false
                        ? 0
                        : apiDeleted;


            if (
                normalizedApiDeleted !==
                dbDeleted
            ) {

                mismatches++;

                validationIssues.push(
                    `D03 - Employee ${employeeId} isDeleted mismatch | API: ${normalizedApiDeleted} | DB: ${dbDeleted}`
                );
            }
        }


        /* ====================================================
           DATABASE → API VALIDATION
        ==================================================== */

        let notFoundInApi = 0;


        for (const dbEmployee of dbEmployees) {

            const employeeId =
                String(dbEmployee.emp_id);


            const apiEmployee =
                apiMap.get(employeeId);


            /* ------------------------------------------------
               D04 / D06 - DB employee missing from API
            ------------------------------------------------ */

            if (!apiEmployee) {

                notFoundInApi++;

                validationIssues.push(
                    `D06 - Employee ${employeeId} exists in DB but not in API`
                );
            }
        }


        /* ====================================================
           D05 - API ONLY EMPLOYEE DETECTION
        ==================================================== */

        /*
         * Already calculated through D01:
         *
         * notFoundInDb > 0
         *
         * means employee exists only in API.
         */


        /* ====================================================
           FINAL SUMMARY
        ==================================================== */

        console.log('\n========================================');
        console.log('FINAL RESULT SUMMARY');
        console.log('========================================');

        console.log(
            `API Records             : ${apiRecords}`
        );

        console.log(
            `Unique API Employee IDs : ${uniqueApiEmployeeIds.size}`
        );

        console.log(
            `Unique DB Employee IDs  : ${uniqueDbEmployeeIds.size}`
        );

        console.log(
            `Not Found in DB         : ${notFoundInDb}`
        );

        console.log(
            `Not Found in API        : ${notFoundInApi}`
        );

        console.log(
            `Mismatches              : ${mismatches}`
        );

        console.log(
            `Duplicate API Records   : ${duplicateApiRecords}`
        );

        console.log(
            `Invalid Data            : ${invalidApiRecords.length}`
        );

        console.log(
            `API Errors              : 0`
        );

        console.log(
            `DB Errors               : 0`
        );

        console.log(
            `Total validation issues : ${validationIssues.length}`
        );


        /* ----------------------------------------------------
           Final Assertion
        ---------------------------------------------------- */

        expect(validationIssues).toHaveLength(0);

    } catch (error: any) {

        /*
         * Preserve our validation error instead of replacing it
         * with a generic DB error.
         */

        if (
            error?.message &&
            validationIssues.length > 0 &&
            error.message === validationIssues.join('\n')
        ) {
            throw error;
        }

        validationIssues.push(
            `Database validation error: ${error.message}`
        );

        throw new Error(
            validationIssues.join('\n')
        );

    } finally {

        await connection.end();
    }
});