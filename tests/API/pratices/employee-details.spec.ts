import { test, expect, APIRequestContext } from '@playwright/test';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const RAW_BASE_URL =
    process.env.BASE_URL || 'https://13.61.179.149';

const HOST_BASE_URL = RAW_BASE_URL
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

const BASE_URL = `${HOST_BASE_URL}/api`;

// IMPORTANT:
// Actual endpoint is /api/api/employeeDetails
const EMPLOYEE_DETAILS_URL =
    `${BASE_URL}/api/employeeDetails`;

const API_TOKEN = process.env.API_TOKEN;

const API_AS_OF_DATE =
    process.env.API_AS_OF_DATE || '2026-10-05';

const practices = [
    'Data & AI',
    'Digital Transformation',
    'Enterprise Business Planning',
    'IP & Solutions',
    'Revenue and Sales',
    'Enabling Functions',
    'Academy',
    'AI-First Lab',
];

/**
 * ============================================================
 * TYPES
 * ============================================================
 */

type IssueType =
    | 'NOT_FOUND_IN_DB'
    | 'NOT_FOUND_IN_API'
    | 'MISMATCH'
    | 'API_ONLY'
    | 'DB_ONLY'
    | 'INVALID_VALUE'
    | 'API_ERROR'
    | 'DB_ERROR'
    | 'STRUCTURE_ERROR'
    | 'DUPLICATE'
    | 'MISSING_FIELD';

type ValidationIssue = {
    type: IssueType;
    practice: string;
    employeeId?: string;
    employeeName?: string;
    field?: string;
    apiValue?: any;
    dbValue?: any;
    reason?: string;
};

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeString(value: any): string {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

function normalizeId(value: any): string {
    return String(value ?? '').trim();
}

function normalizeNumber(value: any): number | null {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isNaN(number)
        ? null
        : number;
}

function normalizeDate(value: any): string | null {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return null;
    }

    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(
            value.getMonth() + 1
        ).padStart(2, '0');

        const day = String(
            value.getDate()
        ).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    const stringValue =
        String(value).trim();

    if (
        /^\d{4}-\d{2}-\d{2}/.test(stringValue)
    ) {
        return stringValue.substring(0, 10);
    }

    // Handles values such as:
    // 5/12/2003
    // 05/12/2003
    const slashDate =
        stringValue.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
        );

    if (slashDate) {
        const day =
            slashDate[1].padStart(2, '0');

        const month =
            slashDate[2].padStart(2, '0');

        const year =
            slashDate[3];

        return `${year}-${month}-${day}`;
    }

    return stringValue;
}

function normalizeDateTime(value: any): string | null {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString()
            .substring(0, 19)
            .replace('T', ' ');
    }

    const valueString =
        String(value).trim();

    if (!valueString) {
        return null;
    }

    return valueString
        .replace('T', ' ')
        .replace(/\.\d+$/, '')
        .replace(/Z$/, '');
}

function normalizeBooleanLike(value: any): any {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value === 'boolean'
    ) {
        return value;
    }

    if (
        value === 1 ||
        value === '1'
    ) {
        return 1;
    }

    if (
        value === 0 ||
        value === '0'
    ) {
        return 0;
    }

    return normalizeString(value);
}

function addIssue(
    issues: ValidationIssue[],
    issue: ValidationIssue
): void {
    issues.push(issue);

    console.log(
        `❌ ${issue.type} | ${issue.practice}` +
        `${issue.employeeId ? ` | ${issue.employeeId}` : ''}` +
        `${issue.field ? ` | ${issue.field}` : ''}` +
        ` | ${issue.reason || ''}`
    );
}

function getApiUrl(
    practice?: string
): string {
    if (
        practice === undefined
    ) {
        return EMPLOYEE_DETAILS_URL;
    }

    return `${EMPLOYEE_DETAILS_URL}?practiceName=${encodeURIComponent(
        practice
    )}`;
}

async function getJson(
    request: APIRequestContext,
    url: string,
    token = API_TOKEN,
    retries = 3
) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await request.get(url, {
                headers: {
                    ...(token
                        ? {
                            Authorization:
                                `Bearer ${token}`,
                        }
                        : {}),
                    Accept:
                        'application/json',
                },
                timeout: 60000,
            });

            if ([502, 503, 504].includes(res.status()) && attempt < retries) {
                await new Promise(r => setTimeout(r, attempt * 1500));
                continue;
            }

            return res;
        } catch (err: any) {
            if (attempt === retries) throw err;
            const isConnReset = err.message && (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT') || err.message.includes('socket hang up'));
            if (isConnReset) {
                await new Promise(r => setTimeout(r, attempt * 1500));
            } else {
                throw err;
            }
        }
    }

    return request.get(url, {
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Accept: 'application/json',
        },
    });
}

function getArray(
    value: any
): any[] {
    if (Array.isArray(value)) {
        return value;
    }

    if (
        value &&
        typeof value === 'object'
    ) {
        return [value];
    }

    return [];
}

function findProperty(
    object: any,
    possibleNames: string[]
): any {
    if (
        !object ||
        typeof object !== 'object'
    ) {
        return undefined;
    }

    for (
        const name of possibleNames
    ) {
        if (
            Object.prototype.hasOwnProperty.call(
                object,
                name
            )
        ) {
            return object[name];
        }
    }

    return undefined;
}

function getDesignationExperience(
    employee: any
): any {
    return findProperty(
        employee,
        [
            'employeeDesignationAndExperience',
            'employeeDesignationExperience',
            'designationAndExperience',
        ]
    );
}

function getEmployeeDocuments(
    employee: any
): any {
    return employee.employeeDocuments;
}

function getCustomerOnboardings(
    employee: any
): any {
    return employee.customerOnboardings;
}

function getEmployeeStatus(
    employee: any
): any {
    return employee.employeeStatus;
}

function getEmployeeDetails(
    employee: any
): any {
    return employee.employeeDetail;
}

function getPracticeMappings(
    employee: any
): any {
    return employee.practiceSubPracticeBands;
}

function makeEmployeeMap(
    employees: any[],
    issues: ValidationIssue[],
    practice: string
): Map<string, any> {

    const map =
        new Map<string, any>();

    for (
        const employee of employees
    ) {
        const employeeId =
            normalizeId(
                employee?.employeeId
            );

        const employeeName =
            String(
                employee?.fullName ?? ''
            ).trim();

        if (!employeeId) {
            addIssue(
                issues,
                {
                    type: 'MISSING_FIELD',
                    practice,
                    employeeName,
                    field: 'employeeId',
                    reason:
                        'employeeId is missing',
                }
            );

            continue;
        }

        if (map.has(employeeId)) {
            addIssue(
                issues,
                {
                    type: 'DUPLICATE',
                    practice,
                    employeeId,
                    employeeName,
                    field: 'employeeId',
                    reason:
                        'Duplicate employeeId returned by API',
                }
            );

            continue;
        }

        map.set(
            employeeId,
            employee
        );
    }

    return map;
}

/**
 * ============================================================
 * DATABASE
 * ============================================================
 */

async function createDbConnection() {
    return mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(
            process.env.DB_PORT || 3306
        ),
        user: process.env.DB_USER,
        password:
            process.env.DB_PASSWORD,
        database:
            process.env.DB_NAME,
    });
}

async function fetchDbData(
    connection: mysql.Connection
) {
    const [
        empDetailsResult,
        projectResult,
        statusResult,
        documentsResult,
        onboardingResult,
        practiceResult,
        designationResult,
    ] = await Promise.all([
        connection.execute(`
            SELECT
                emp_id,
                blood_group,
                contact_no,
                current_address,
                date_of_birth,
                emergency_contact_no,
                full_name,
                gender,
                image_data,
                marital_status,
                official_email_id,
                permanent_address,
                personal_email_id,
                is_deleted,
                sub_practice_id,
                created_by,
                created_date,
                updated_by,
                updated_date
            FROM emp_details
        `),

        connection.execute(`
            SELECT
                employee_project_id,
                employee_id,
                assigned_project,
                project_start_date,
                project_end_date,
                reporting_manager_level1,
                reporting_manager_level2,
                relantopm_offshore,
                relantopm_onsite,
                relantodm_offshore,
                relantodm_onsite,
                client,
                client_manager_level2,
                client_manager_level1,
                client_manager_level3
            FROM employee_project_and_reporting_structure
        `),

        connection.execute(`
            SELECT
                emp_status_id,
                employee_id,
                employment_status,
                category,
                work_authorization,
                base_location,
                current_location,
                last_working_day
            FROM employee_status
        `),

        connection.execute(`
            SELECT
                document_id,
                employee_id,
                adhaar,
                education_details,
                pan_card,
                previous_employee_details,
                resume
            FROM employee_documents
        `),

        connection.execute(`
            SELECT
                customer_onboardings_id,
                bgv_initiated_date,
                bgv_status,
                bgvcompleted_date,
                cisco_configuration_completed_date,
                customer_email_address,
                employee_id,
                laptop_courier_reached_date,
                laptop_courier_start_date,
                laptop_status,
                onboarding_status,
                sow_end_date,
                sow_id,
                sow_start_date
            FROM customer_onboardings
        `),

        connection.execute(`
            SELECT
                practice_id,
                employee_id,
                level,
                mapped_skill_set,
                practice,
                practice_owner,
                sub_practice,
                client_manager_level1,
                client_manager_level2,
                client_manager_level3,
                reporting_manager_level1,
                reporting_manager_level2
            FROM practice_sub_practice_band
        `),

        connection.execute(`
            SELECT
                designation_id,
                employee_id,
                base_location,
                certification_complete,
                current_location,
                date_of_joining,
                designation,
                it_relevant_experience,
                organization,
                primary_skill,
                role_asper_placement,
                total_experience,
                secondary_skill
            FROM employee_designation_and_experience
        `),
    ]);

    return {
        empDetails:
            empDetailsResult[0] as any[],

        projectDetails:
            projectResult[0] as any[],

        statuses:
            statusResult[0] as any[],

        documents:
            documentsResult[0] as any[],

        onboardings:
            onboardingResult[0] as any[],

        practiceMappings:
            practiceResult[0] as any[],

        designationExperience:
            designationResult[0] as any[],
    };
}

function groupByEmployee(
    rows: any[],
    employeeColumn = 'employee_id'
): Map<string, any[]> {

    const map =
        new Map<string, any[]>();

    for (
        const row of rows
    ) {
        const id =
            normalizeId(
                row?.[employeeColumn]
            );

        if (!id) {
            continue;
        }

        if (!map.has(id)) {
            map.set(id, []);
        }

        map.get(id)!.push(row);
    }

    return map;
}

/**
 * ============================================================
 * FIELD COMPARISON
 * ============================================================
 */

function compareField(
    issues: ValidationIssue[],
    practice: string,
    employeeId: string,
    employeeName: string,
    field: string,
    apiValue: any,
    dbValue: any
) {
    const normalizedApi =
        normalizeString(apiValue);

    const normalizedDb =
        normalizeString(dbValue);

    if (
        normalizedApi !==
        normalizedDb
    ) {
        addIssue(
            issues,
            {
                type: 'MISMATCH',
                practice,
                employeeId,
                employeeName,
                field,
                apiValue,
                dbValue,
                reason:
                    `${field} mismatch`,
            }
        );
    }
}

function compareNumberField(
    issues: ValidationIssue[],
    practice: string,
    employeeId: string,
    employeeName: string,
    field: string,
    apiValue: any,
    dbValue: any
) {
    const api =
        normalizeNumber(apiValue);

    const db =
        normalizeNumber(dbValue);

    if (api !== db) {
        addIssue(
            issues,
            {
                type: 'MISMATCH',
                practice,
                employeeId,
                employeeName,
                field,
                apiValue,
                dbValue,
                reason:
                    `${field} mismatch`,
            }
        );
    }
}

function compareDateField(
    issues: ValidationIssue[],
    practice: string,
    employeeId: string,
    employeeName: string,
    field: string,
    apiValue: any,
    dbValue: any
) {
    const api =
        normalizeDate(apiValue);

    const db =
        normalizeDate(dbValue);

    if (api !== db) {
        addIssue(
            issues,
            {
                type: 'MISMATCH',
                practice,
                employeeId,
                employeeName,
                field,
                apiValue,
                dbValue,
                reason:
                    `${field} date mismatch`,
            }
        );
    }
}

/**
 * ============================================================
 * MAIN EMPLOYEE VALIDATION
 * ============================================================
 */

function validateMainEmployee(
    employee: any,
    db: any,
    practice: string,
    issues: ValidationIssue[]
) {
    const employeeId =
        normalizeId(
            employee.employeeId
        );

    const employeeName =
        String(
            employee.fullName ?? ''
        ).trim();

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'employeeId',
        employee.employeeId,
        db.emp_id
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'fullName',
        employee.fullName,
        db.full_name
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'gender',
        employee.gender,
        db.gender
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'maritalStatus',
        employee.maritalStatus,
        db.marital_status
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'officialEmailId',
        employee.officialEmailId,
        db.official_email_id
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'personalEmailId',
        employee.personalEmailId,
        db.personal_email_id
    );

    compareNumberField(
        issues,
        practice,
        employeeId,
        employeeName,
        'contactNo',
        employee.contactNo,
        db.contact_no
    );

    compareNumberField(
        issues,
        practice,
        employeeId,
        employeeName,
        'emergencyContactNo',
        employee.emergencyContactNo,
        db.emergency_contact_no
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'bloodGroup',
        employee.bloodGroup,
        db.blood_group
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'currentAddress',
        employee.currentAddress,
        db.current_address
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'permanentAddress',
        employee.permanentAddress,
        db.permanent_address
    );

    compareDateField(
        issues,
        practice,
        employeeId,
        employeeName,
        'dateOfBirth',
        employee.dateOfBirth,
        db.date_of_birth
    );

    compareDateField(
        issues,
        practice,
        employeeId,
        employeeName,
        'createdDate',
        employee.createdDate,
        db.created_date
    );

    compareDateField(
        issues,
        practice,
        employeeId,
        employeeName,
        'updatedDate',
        employee.updatedDate,
        db.updated_date
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'createdBy',
        employee.createdBy,
        db.created_by
    );

    compareField(
        issues,
        practice,
        employeeId,
        employeeName,
        'updatedBy',
        employee.updatedBy,
        db.updated_by
    );

    /**
     * image vs image_data
     *
     * Do not compare binary/string representation directly.
     * Only validate null/presence compatibility.
     */
    const apiImage =
        employee.image;

    const dbImage =
        db.image_data;

    if (
        (apiImage === null) !==
        (dbImage === null)
    ) {
        addIssue(
            issues,
            {
                type: 'MISMATCH',
                practice,
                employeeId,
                employeeName,
                field: 'image',
                apiValue:
                    apiImage === null
                        ? null
                        : '[PRESENT]',
                dbValue:
                    dbImage === null
                        ? null
                        : '[PRESENT]',
                reason:
                    'Image null/presence mismatch',
            }
        );
    }

    if (
        employee.isDeleted !== null
    ) {
        compareNumberField(
            issues,
            practice,
            employeeId,
            employeeName,
            'isDeleted',
            employee.isDeleted,
            db.is_deleted
        );
    }
}

/**
 * ============================================================
 * employeeDetail VALIDATION
 * ============================================================
 */

function validateEmployeeDetails(
    apiEmployee: any,
    dbRows: any[],
    practice: string,
    issues: ValidationIssue[]
) {
    const employeeId =
        normalizeId(
            apiEmployee.employeeId
        );

    const employeeName =
        String(
            apiEmployee.fullName ?? ''
        ).trim();

    const apiRows =
        getArray(
            getEmployeeDetails(
                apiEmployee
            )
        );

    const apiMap =
        new Map<string, any>();

    for (
        const row of apiRows
    ) {
        const id =
            normalizeId(
                row.employeeProjectId
            );

        if (!id) {
            addIssue(
                issues,
                {
                    type: 'MISSING_FIELD',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeDetail.employeeProjectId',
                    reason:
                        'employeeProjectId missing',
                }
            );

            continue;
        }

        if (apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DUPLICATE',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeDetail.employeeProjectId',
                    reason:
                        `Duplicate employeeProjectId ${id}`,
                }
            );
        }

        apiMap.set(
            id,
            row
        );
    }

    const dbMap =
        new Map<string, any>();

    for (
        const row of dbRows
    ) {
        const id =
            normalizeId(
                row.employee_project_id
            );

        dbMap.set(
            id,
            row
        );
    }

    for (
        const [id, apiRow]
        of apiMap
    ) {
        const dbRow =
            dbMap.get(id);

        if (!dbRow) {
            addIssue(
                issues,
                {
                    type: 'API_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeDetail',
                    apiValue:
                        apiRow,
                    reason:
                        `employeeProjectId ${id} exists in API but not DB`,
                }
            );

            continue;
        }

        const mappings = [
            [
                'employee_id',
                'employee_id',
            ],
            [
                'assignedProject',
                'assigned_project',
            ],
            [
                'projectStartDate',
                'project_start_date',
            ],
            [
                'projectEndDate',
                'project_end_date',
            ],
            [
                'reportingManagerLevel1',
                'reporting_manager_level1',
            ],
            [
                'reportingManagerLevel2',
                'reporting_manager_level2',
            ],
            [
                'relantoPM_Offshore',
                'relantopm_offshore',
            ],
            [
                'relantoPM_Onsite',
                'relantopm_onsite',
            ],
            [
                'relantoDM_Offshore',
                'relantodm_offshore',
            ],
            [
                'relantoDM_Onsite',
                'relantodm_onsite',
            ],
            [
                'client',
                'client',
            ],
            [
                'clientManagerLevel2',
                'client_manager_level2',
            ],
            [
                'clientManagerLevel1',
                'client_manager_level1',
            ],
            [
                'clientManagerLevel3',
                'client_manager_level3',
            ],
        ];

        for (
            const [apiField, dbField]
            of mappings
        ) {
            if (
                String(apiField)
                    .toLowerCase()
                    .includes('date')
            ) {
                compareDateField(
                    issues,
                    practice,
                    employeeId,
                    employeeName,
                    `employeeDetail.${apiField}`,
                    apiRow[apiField],
                    dbRow[dbField]
                );
            } else {
                compareField(
                    issues,
                    practice,
                    employeeId,
                    employeeName,
                    `employeeDetail.${apiField}`,
                    apiRow[apiField],
                    dbRow[dbField]
                );
            }
        }
    }

    for (
        const [id]
        of dbMap
    ) {
        if (!apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DB_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeDetail',
                    reason:
                        `employeeProjectId ${id} exists in DB but not API`,
                }
            );
        }
    }
}

/**
 * ============================================================
 * employeeStatus VALIDATION
 * ============================================================
 */

function validateEmployeeStatus(
    apiEmployee: any,
    dbRows: any[],
    practice: string,
    issues: ValidationIssue[]
) {
    const employeeId =
        normalizeId(
            apiEmployee.employeeId
        );

    const employeeName =
        String(
            apiEmployee.fullName ?? ''
        ).trim();

    const apiRows =
        getArray(
            getEmployeeStatus(
                apiEmployee
            )
        );

    const dbMap =
        new Map<string, any>();

    for (
        const row of dbRows
    ) {
        dbMap.set(
            normalizeId(
                row.emp_status_id
            ),
            row
        );
    }

    const apiMap =
        new Map<string, any>();

    for (
        const row of apiRows
    ) {
        const id =
            normalizeId(
                row.empStatusId
            );

        if (!id) {
            addIssue(
                issues,
                {
                    type: 'MISSING_FIELD',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeStatus.empStatusId',
                    reason:
                        'empStatusId missing',
                }
            );

            continue;
        }

        if (apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DUPLICATE',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeStatus.empStatusId',
                    reason:
                        `Duplicate empStatusId ${id}`,
                }
            );
        }

        apiMap.set(
            id,
            row
        );
    }

    for (
        const [id, apiRow]
        of apiMap
    ) {
        const dbRow =
            dbMap.get(id);

        if (!dbRow) {
            addIssue(
                issues,
                {
                    type: 'API_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeStatus',
                    reason:
                        `empStatusId ${id} exists in API but not DB`,
                }
            );

            continue;
        }

        compareField(
            issues,
            practice,
            employeeId,
            employeeName,
            'employeeStatus.employee_id',
            apiRow.employee_id,
            dbRow.employee_id
        );

        compareField(
            issues,
            practice,
            employeeId,
            employeeName,
            'employeeStatus.employmentStatus',
            apiRow.employmentStatus,
            dbRow.employment_status
        );

        compareField(
            issues,
            practice,
            employeeId,
            employeeName,
            'employeeStatus.category',
            apiRow.category,
            dbRow.category
        );

        compareField(
            issues,
            practice,
            employeeId,
            employeeName,
            'employeeStatus.workAuthorization',
            apiRow.workAuthorization,
            dbRow.work_authorization
        );

        compareField(
            issues,
            practice,
            employeeId,
            employeeName,
            'employeeStatus.baseLocation',
            apiRow.baseLocation,
            dbRow.base_location
        );

        compareField(
            issues,
            practice,
            employeeId,
            employeeName,
            'employeeStatus.currentLocation',
            apiRow.currentLocation,
            dbRow.current_location
        );

        compareDateField(
            issues,
            practice,
            employeeId,
            employeeName,
            'employeeStatus.lastWorkingDay',
            apiRow.lastWorkingDay,
            dbRow.last_working_day
        );
    }

    for (
        const [id]
        of dbMap
    ) {
        if (!apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DB_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeStatus',
                    reason:
                        `empStatusId ${id} exists in DB but not API`,
                }
            );
        }
    }
}

/**
 * ============================================================
 * customerOnboardings VALIDATION
 * ============================================================
 */

function validateCustomerOnboardings(
    apiEmployee: any,
    dbRows: any[],
    practice: string,
    issues: ValidationIssue[]
) {
    const employeeId =
        normalizeId(
            apiEmployee.employeeId
        );

    const employeeName =
        String(
            apiEmployee.fullName ?? ''
        ).trim();

    const apiValue =
        getCustomerOnboardings(
            apiEmployee
        );

    const apiRows =
        getArray(apiValue);

    /*
     * If API returns null and DB has no records,
     * that is valid.
     */
    if (
        apiValue === null ||
        apiValue === undefined
    ) {
        if (dbRows.length === 0) {
            return;
        }

        addIssue(
            issues,
            {
                type: 'NOT_FOUND_IN_API',
                practice,
                employeeId,
                employeeName,
                field:
                    'customerOnboardings',
                reason:
                    'DB has customer onboarding records but API returned null/undefined',
            }
        );

        return;
    }

    const apiMap =
        new Map<string, any>();

    for (
        const row of apiRows
    ) {
        const id =
            normalizeId(
                row.customerOnboardingsId ??
                row.customer_onboardings_id
            );

        if (!id) {
            addIssue(
                issues,
                {
                    type: 'MISSING_FIELD',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'customerOnboardings.customerOnboardingsId',
                    reason:
                        'Customer onboarding ID missing',
                }
            );

            continue;
        }

        apiMap.set(id, row);
    }

    const dbMap =
        new Map<string, any>();

    for (
        const row of dbRows
    ) {
        dbMap.set(
            normalizeId(
                row.customer_onboardings_id
            ),
            row
        );
    }

    const mappings: [
        string,
        string
    ][] = [
            [
                'customerEmailAddress',
                'customer_email_address',
            ],
            [
                'bgvStatus',
                'bgv_status',
            ],
            [
                'laptopStatus',
                'laptop_status',
            ],
            [
                'onboardingStatus',
                'onboarding_status',
            ],
            [
                'sowId',
                'sow_id',
            ],
        ];

    const dateMappings: [
        string,
        string
    ][] = [
            [
                'bgvInitiatedDate',
                'bgv_initiated_date',
            ],
            [
                'bgvCompletedDate',
                'bgvcompleted_date',
            ],
            [
                'ciscoConfigurationCompletedDate',
                'cisco_configuration_completed_date',
            ],
            [
                'laptopCourierReachedDate',
                'laptop_courier_reached_date',
            ],
            [
                'laptopCourierStartDate',
                'laptop_courier_start_date',
            ],
            [
                'sowEndDate',
                'sow_end_date',
            ],
            [
                'sowStartDate',
                'sow_start_date',
            ],
        ];

    for (
        const [id, apiRow]
        of apiMap
    ) {
        const dbRow =
            dbMap.get(id);

        if (!dbRow) {
            addIssue(
                issues,
                {
                    type: 'API_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'customerOnboardings',
                    reason:
                        `Customer onboarding ${id} exists in API but not DB`,
                }
            );

            continue;
        }

        for (
            const [apiField, dbField]
            of mappings
        ) {
            compareField(
                issues,
                practice,
                employeeId,
                employeeName,
                `customerOnboardings.${apiField}`,
                apiRow[apiField],
                dbRow[dbField]
            );
        }

        for (
            const [apiField, dbField]
            of dateMappings
        ) {
            compareDateField(
                issues,
                practice,
                employeeId,
                employeeName,
                `customerOnboardings.${apiField}`,
                apiRow[apiField],
                dbRow[dbField]
            );
        }
    }

    for (
        const [id]
        of dbMap
    ) {
        if (!apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DB_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'customerOnboardings',
                    reason:
                        `Customer onboarding ${id} exists in DB but not API`,
                }
            );
        }
    }
}

/**
 * ============================================================
 * employeeDocuments VALIDATION
 * ============================================================
 */

function validateEmployeeDocuments(
    apiEmployee: any,
    dbRows: any[],
    practice: string,
    issues: ValidationIssue[]
) {
    const employeeId =
        normalizeId(
            apiEmployee.employeeId
        );

    const employeeName =
        String(
            apiEmployee.fullName ?? ''
        ).trim();

    const apiValue =
        getEmployeeDocuments(
            apiEmployee
        );

    const apiRows =
        getArray(apiValue);

    if (
        apiValue === null ||
        apiValue === undefined
    ) {
        if (dbRows.length === 0) {
            return;
        }

        addIssue(
            issues,
            {
                type: 'NOT_FOUND_IN_API',
                practice,
                employeeId,
                employeeName,
                field:
                    'employeeDocuments',
                reason:
                    'DB has document record but API returned null/undefined',
            }
        );

        return;
    }

    const apiMap =
        new Map<string, any>();

    for (
        const row of apiRows
    ) {
        const id =
            normalizeId(
                row.documentId ??
                row.document_id
            );

        if (!id) {
            addIssue(
                issues,
                {
                    type: 'MISSING_FIELD',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeDocuments.documentId',
                    reason:
                        'documentId missing',
                }
            );

            continue;
        }

        apiMap.set(id, row);
    }

    const dbMap =
        new Map<string, any>();

    for (
        const row of dbRows
    ) {
        dbMap.set(
            normalizeId(
                row.document_id
            ),
            row
        );
    }

    for (
        const [id, apiRow]
        of apiMap
    ) {
        const dbRow =
            dbMap.get(id);

        if (!dbRow) {
            addIssue(
                issues,
                {
                    type: 'API_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeDocuments',
                    reason:
                        `Document ${id} exists in API but not DB`,
                }
            );

            continue;
        }

        compareField(
            issues,
            practice,
            employeeId,
            employeeName,
            'employeeDocuments.employeeId',
            apiRow.employeeId ??
            apiRow.employee_id,
            dbRow.employee_id
        );

        /**
         * LONGBLOB:
         * Compare presence rather than raw representation.
         */
        const blobMappings: [
            string,
            string
        ][] = [
                ['adhaar', 'adhaar'],
                [
                    'educationDetails',
                    'education_details',
                ],
                ['panCard', 'pan_card'],
                [
                    'previousEmployeeDetails',
                    'previous_employee_details',
                ],
                ['resume', 'resume'],
            ];

        for (
            const [apiField, dbField]
            of blobMappings
        ) {
            const apiPresent =
                apiRow[apiField] !== null &&
                apiRow[apiField] !== undefined;

            const dbPresent =
                dbRow[dbField] !== null &&
                dbRow[dbField] !== undefined;

            if (
                apiPresent !== dbPresent
            ) {
                addIssue(
                    issues,
                    {
                        type: 'MISMATCH',
                        practice,
                        employeeId,
                        employeeName,
                        field:
                            `employeeDocuments.${apiField}`,
                        apiValue:
                            apiPresent
                                ? '[PRESENT]'
                                : null,
                        dbValue:
                            dbPresent
                                ? '[PRESENT]'
                                : null,
                        reason:
                            'Document presence mismatch',
                    }
                );
            }
        }
    }

    for (
        const [id]
        of dbMap
    ) {
        if (!apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DB_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeDocuments',
                    reason:
                        `Document ${id} exists in DB but not API`,
                }
            );
        }
    }
}

/**
 * ============================================================
 * PRACTICE MAPPING VALIDATION
 * ============================================================
 */

function validatePracticeMappings(
    apiEmployee: any,
    dbRows: any[],
    requestedPractice: string,
    issues: ValidationIssue[]
) {
    const employeeId =
        normalizeId(
            apiEmployee.employeeId
        );

    const employeeName =
        String(
            apiEmployee.fullName ?? ''
        ).trim();

    const apiRows =
        getArray(
            getPracticeMappings(
                apiEmployee
            )
        );

    if (
        !Array.isArray(
            apiEmployee.practiceSubPracticeBands
        )
    ) {
        addIssue(
            issues,
            {
                type: 'STRUCTURE_ERROR',
                practice:
                    requestedPractice,
                employeeId,
                employeeName,
                field:
                    'practiceSubPracticeBands',
                reason:
                    'practiceSubPracticeBands is not an array',
            }
        );

        return;
    }

    const apiMap =
        new Map<string, any>();

    for (
        const row of apiRows
    ) {
        const id =
            normalizeId(
                row.practiceId ??
                row.practice_id
            );

        if (!id) {
            addIssue(
                issues,
                {
                    type: 'MISSING_FIELD',
                    practice:
                        requestedPractice,
                    employeeId,
                    employeeName,
                    field:
                        'practiceId',
                    reason:
                        'practiceId missing',
                }
            );

            continue;
        }

        if (apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DUPLICATE',
                    practice:
                        requestedPractice,
                    employeeId,
                    employeeName,
                    field:
                        'practiceId',
                    reason:
                        `Duplicate practiceId ${id}`,
                }
            );
        }

        apiMap.set(id, row);
    }

    const dbMap =
        new Map<string, any>();

    for (
        const row of dbRows
    ) {
        dbMap.set(
            normalizeId(
                row.practice_id
            ),
            row
        );
    }

    for (
        const [id, apiRow]
        of apiMap
    ) {
        const dbRow =
            dbMap.get(id);

        if (!dbRow) {
            addIssue(
                issues,
                {
                    type: 'API_ONLY',
                    practice:
                        requestedPractice,
                    employeeId,
                    employeeName,
                    field:
                        'practiceSubPracticeBands',
                    reason:
                        `practiceId ${id} exists in API but not DB`,
                }
            );

            continue;
        }

        const mappings: [
            string,
            string
        ][] = [
                ['employee_id', 'employee_id'],
                ['level', 'level'],
                [
                    'mappedSkillSet',
                    'mapped_skill_set',
                ],
                ['practice', 'practice'],
                [
                    'practiceOwner',
                    'practice_owner',
                ],
                [
                    'subPractice',
                    'sub_practice',
                ],
                [
                    'clientManagerLevel1',
                    'client_manager_level1',
                ],
                [
                    'clientManagerLevel2',
                    'client_manager_level2',
                ],
                [
                    'clientManagerLevel3',
                    'client_manager_level3',
                ],
                [
                    'reportingManagerLevel1',
                    'reporting_manager_level1',
                ],
                [
                    'reportingManagerLevel2',
                    'reporting_manager_level2',
                ],
            ];

        for (
            const [apiField, dbField]
            of mappings
        ) {
            compareField(
                issues,
                requestedPractice,
                employeeId,
                employeeName,
                `practiceSubPracticeBands.${apiField}`,
                apiRow[apiField],
                dbRow[dbField]
            );
        }
    }

    for (
        const [id]
        of dbMap
    ) {
        if (!apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DB_ONLY',
                    practice:
                        requestedPractice,
                    employeeId,
                    employeeName,
                    field:
                        'practiceSubPracticeBands',
                    reason:
                        `practiceId ${id} exists in DB but not API`,
                }
            );
        }
    }

    const hasRequestedPractice =
        apiRows.some(
            row =>
                normalizeString(
                    row.practice
                ) ===
                normalizeString(
                    requestedPractice
                )
        );

    if (!hasRequestedPractice) {
        addIssue(
            issues,
            {
                type: 'MISMATCH',
                practice:
                    requestedPractice,
                employeeId,
                employeeName,
                field:
                    'practice',
                apiValue:
                    apiRows.map(
                        row => row.practice
                    ),
                reason:
                    `Requested practice '${requestedPractice}' not found in API mapping`,
            }
        );
    }
}

/**
 * ============================================================
 * DESIGNATION / EXPERIENCE VALIDATION
 * ============================================================
 */

function validateDesignationExperience(
    apiEmployee: any,
    dbRows: any[],
    practice: string,
    issues: ValidationIssue[]
) {
    const employeeId =
        normalizeId(
            apiEmployee.employeeId
        );

    const employeeName =
        String(
            apiEmployee.fullName ?? ''
        ).trim();

    const raw =
        getDesignationExperience(
            apiEmployee
        );

    /*
     * If API does not expose this section,
     * we don't automatically fail the test.
     *
     * The exact JSON property was not present
     * in the supplied source response.
     */
    if (
        raw === undefined
    ) {
        return;
    }

    const apiRows =
        getArray(raw);

    const apiMap =
        new Map<string, any>();

    for (
        const row of apiRows
    ) {
        const id =
            normalizeId(
                row.designationId ??
                row.designation_id
            );

        if (!id) {
            continue;
        }

        apiMap.set(id, row);
    }

    const dbMap =
        new Map<string, any>();

    for (
        const row of dbRows
    ) {
        dbMap.set(
            normalizeId(
                row.designation_id
            ),
            row
        );
    }

    const mappings: [
        string,
        string
    ][] = [
            ['employee_id', 'employee_id'],
            ['baseLocation', 'base_location'],
            [
                'certificationComplete',
                'certification_complete',
            ],
            [
                'currentLocation',
                'current_location',
            ],
            ['designation', 'designation'],
            [
                'itRelevantExperience',
                'it_relevant_experience',
            ],
            ['organization', 'organization'],
            ['primarySkill', 'primary_skill'],
            [
                'roleAsPerPlacement',
                'role_asper_placement',
            ],
            [
                'totalExperience',
                'total_experience',
            ],
            [
                'secondarySkill',
                'secondary_skill',
            ],
        ];

    for (
        const [id, apiRow]
        of apiMap
    ) {
        const dbRow =
            dbMap.get(id);

        if (!dbRow) {
            addIssue(
                issues,
                {
                    type: 'API_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'designationAndExperience',
                    reason:
                        `designationId ${id} exists in API but not DB`,
                }
            );

            continue;
        }

        for (
            const [apiField, dbField]
            of mappings
        ) {
            compareField(
                issues,
                practice,
                employeeId,
                employeeName,
                `designationAndExperience.${apiField}`,
                apiRow[apiField],
                dbRow[dbField]
            );
        }

        compareDateField(
            issues,
            practice,
            employeeId,
            employeeName,
            'designationAndExperience.dateOfJoining',
            apiRow.dateOfJoining,
            dbRow.date_of_joining
        );
    }

    for (
        const [id]
        of dbMap
    ) {
        if (!apiMap.has(id)) {
            addIssue(
                issues,
                {
                    type: 'DB_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'designationAndExperience',
                    reason:
                        `designationId ${id} exists in DB but not API`,
                }
            );
        }
    }
}

/**
 * ============================================================
 * API RESPONSE STRUCTURE
 * ============================================================
 */

function validateApiStructure(
    employees: any[],
    practice: string,
    issues: ValidationIssue[]
) {
    for (
        const employee of employees
    ) {
        const employeeId =
            normalizeId(
                employee?.employeeId
            );

        const employeeName =
            String(
                employee?.fullName ?? ''
            ).trim();

        const requiredFields = [
            'employeeId',
            'fullName',
            'gender',
            'maritalStatus',
            'officialEmailId',
            'personalEmailId',
            'contactNo',
            'emergencyContactNo',
            'bloodGroup',
            'currentAddress',
            'permanentAddress',
            'dateOfBirth',
            'isDeleted',
            'employeeDetail',
            'employeeStatus',
            'practiceSubPracticeBands',
        ];

        for (
            const field
            of requiredFields
        ) {
            if (
                !Object.prototype.hasOwnProperty.call(
                    employee,
                    field
                )
            ) {
                addIssue(
                    issues,
                    {
                        type:
                            'MISSING_FIELD',
                        practice,
                        employeeId,
                        employeeName,
                        field,
                        reason:
                            `Required field '${field}' is missing`,
                    }
                );
            }
        }

        if (
            employee.isDeleted !== 0 &&
            employee.isDeleted !== 1 &&
            employee.isDeleted !== null
        ) {
            addIssue(
                issues,
                {
                    type:
                        'INVALID_VALUE',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'isDeleted',
                    apiValue:
                        employee.isDeleted,
                    reason:
                        'isDeleted must be 0, 1 or null',
                }
            );
        }

        if (
            employee.employeeDetail !== null &&
            !Array.isArray(
                employee.employeeDetail
            )
        ) {
            addIssue(
                issues,
                {
                    type:
                        'STRUCTURE_ERROR',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeDetail',
                    reason:
                        'employeeDetail must be array or null',
                }
            );
        }

        if (
            employee.employeeStatus !== null &&
            !Array.isArray(
                employee.employeeStatus
            )
        ) {
            addIssue(
                issues,
                {
                    type:
                        'STRUCTURE_ERROR',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'employeeStatus',
                    reason:
                        'employeeStatus must be array or null',
                }
            );
        }

        if (
            !Array.isArray(
                employee.practiceSubPracticeBands
            )
        ) {
            addIssue(
                issues,
                {
                    type:
                        'STRUCTURE_ERROR',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'practiceSubPracticeBands',
                    reason:
                        'practiceSubPracticeBands must be an array',
                }
            );
        }
    }
}

/**
 * ============================================================
 * COMPLETE API ↔ DB VALIDATION
 * ============================================================
 */

async function validatePracticeAgainstDb(
    request: APIRequestContext,
    connection: mysql.Connection,
    practice: string
): Promise<ValidationIssue[]> {

    const issues:
        ValidationIssue[] = [];

    console.log('\n');
    console.log(
        '============================================================'
    );
    console.log(
        `PRACTICE: ${practice}`
    );
    console.log(
        '============================================================'
    );

    /**
     * --------------------------------------------------------
     * API
     * --------------------------------------------------------
     */

    const response =
        await getJson(
            request,
            getApiUrl(practice)
        );

    const status =
        response.status();

    if (status !== 200) {
        addIssue(
            issues,
            {
                type: 'API_ERROR',
                practice,
                reason:
                    `Expected HTTP 200 but received ${status}`,
            }
        );

        return issues;
    }

    let apiData: any;

    try {
        apiData =
            await response.json();
    } catch {
        addIssue(
            issues,
            {
                type:
                    'STRUCTURE_ERROR',
                practice,
                reason:
                    'Response is not valid JSON',
            }
        );

        return issues;
    }

    if (
        !Array.isArray(apiData)
    ) {
        addIssue(
            issues,
            {
                type:
                    'STRUCTURE_ERROR',
                practice,
                reason:
                    'API response is not an array',
            }
        );

        return issues;
    }

    console.log(
        `API Employee Records: ${apiData.length}`
    );

    validateApiStructure(
        apiData,
        practice,
        issues
    );

    const apiEmployees =
        makeEmployeeMap(
            apiData,
            issues,
            practice
        );

    /**
     * --------------------------------------------------------
     * DB
     * --------------------------------------------------------
     */

    let dbData: any;

    try {
        dbData =
            await fetchDbData(
                connection
            );
    } catch (error) {
        addIssue(
            issues,
            {
                type: 'DB_ERROR',
                practice,
                reason:
                    `DB query failed: ${error instanceof Error
                        ? error.message
                        : String(error)
                    }`,
            }
        );

        return issues;
    }

    const dbEmployees =
        new Map<string, any>();

    for (
        const row
        of dbData.empDetails
    ) {
        const id =
            normalizeId(
                row.emp_id
            );

        if (id) {
            dbEmployees.set(
                id,
                row
            );
        }
    }

    const projectByEmployee =
        groupByEmployee(
            dbData.projectDetails
        );

    const statusByEmployee =
        groupByEmployee(
            dbData.statuses
        );

    const documentsByEmployee =
        groupByEmployee(
            dbData.documents
        );

    const onboardingByEmployee =
        groupByEmployee(
            dbData.onboardings
        );

    const practiceByEmployee =
        groupByEmployee(
            dbData.practiceMappings
        );

    const designationByEmployee =
        groupByEmployee(
            dbData.designationExperience
        );

    /**
     * --------------------------------------------------------
     * Determine DB employees for requested practice
     *
     * IMPORTANT:
     * Employee Details practice mapping comes from
     * practice_sub_practice_band.
     * --------------------------------------------------------
     */

    const dbPracticeEmployeeIds =
        new Set<string>();

    for (
        const row
        of dbData.practiceMappings
    ) {
        if (
            normalizeString(
                row.practice
            ) ===
            normalizeString(
                practice
            )
        ) {
            const id =
                normalizeId(
                    row.employee_id
                );

            if (id) {
                dbPracticeEmployeeIds.add(
                    id
                );
            }
        }
    }

    console.log(
        `API Unique Employees: ${apiEmployees.size}`
    );

    console.log(
        `DB Practice Employees: ${dbPracticeEmployeeIds.size}`
    );

    /**
     * --------------------------------------------------------
     * API → DB
     * --------------------------------------------------------
     */

    console.log(
        '\nAPI → DB VALIDATION'
    );

    for (
        const [
            employeeId,
            apiEmployee,
        ]
        of apiEmployees
    ) {
        const employeeName =
            String(
                apiEmployee.fullName ?? ''
            ).trim();

        const dbEmployee =
            dbEmployees.get(
                employeeId
            );

        if (!dbEmployee) {
            addIssue(
                issues,
                {
                    type:
                        'API_ONLY',
                    practice,
                    employeeId,
                    employeeName,
                    reason:
                        'Employee exists in API but not emp_details',
                }
            );

            continue;
        }

        /**
         * Main employee
         */

        validateMainEmployee(
            apiEmployee,
            dbEmployee,
            practice,
            issues
        );

        /**
         * Employee project/reporting
         */

        validateEmployeeDetails(
            apiEmployee,
            projectByEmployee.get(
                employeeId
            ) || [],
            practice,
            issues
        );

        /**
         * Employee status
         */

        validateEmployeeStatus(
            apiEmployee,
            statusByEmployee.get(
                employeeId
            ) || [],
            practice,
            issues
        );

        /**
         * Customer onboarding
         */

        validateCustomerOnboardings(
            apiEmployee,
            onboardingByEmployee.get(
                employeeId
            ) || [],
            practice,
            issues
        );

        /**
         * Documents
         */

        validateEmployeeDocuments(
            apiEmployee,
            documentsByEmployee.get(
                employeeId
            ) || [],
            practice,
            issues
        );

        /**
         * Practice mapping
         */

        validatePracticeMappings(
            apiEmployee,
            practiceByEmployee.get(
                employeeId
            ) || [],
            practice,
            issues
        );

        /**
         * Designation / experience
         */

        validateDesignationExperience(
            apiEmployee,
            designationByEmployee.get(
                employeeId
            ) || [],
            practice,
            issues
        );

        /**
         * Employee must belong to
         * requested practice in DB.
         */

        if (
            !dbPracticeEmployeeIds.has(
                employeeId
            )
        ) {
            addIssue(
                issues,
                {
                    type:
                        'MISMATCH',
                    practice,
                    employeeId,
                    employeeName,
                    field:
                        'practice',
                    reason:
                        'Employee returned by API is not mapped to requested practice in practice_sub_practice_band',
                }
            );
        }
    }

    /**
     * --------------------------------------------------------
     * DB → API
     * --------------------------------------------------------
     */

    console.log(
        '\nDB → API VALIDATION'
    );

    for (
        const employeeId
        of dbPracticeEmployeeIds
    ) {
        if (
            !apiEmployees.has(
                employeeId
            )
        ) {
            const dbEmployee =
                dbEmployees.get(
                    employeeId
                );

            addIssue(
                issues,
                {
                    type:
                        'DB_ONLY',
                    practice,
                    employeeId,
                    employeeName:
                        dbEmployee?.full_name,
                    reason:
                        'Employee is mapped to requested practice in DB but missing from API',
                }
            );
        }
    }

    return issues;
}

/**
 * ============================================================
 * TEST SUITE
 * ============================================================
 */

test.describe(
    'Employee Details API - Complete Automation',
    () => {

        /**
         * ====================================================
         * POSITIVE TESTS
         * ====================================================
         */

        test(
            'P01 - Data & AI returns HTTP 200',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'P02 - Digital Transformation returns HTTP 200',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Digital Transformation'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'P03 - Enterprise Business Planning returns HTTP 200',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Enterprise Business Planning'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'P04 - IP & Solutions returns HTTP 200',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'IP & Solutions'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'P05 - Revenue and Sales returns HTTP 200',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Revenue and Sales'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'P06 - Enabling Functions returns HTTP 200',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Enabling Functions'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'P07 - Academy returns HTTP 200',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Academy'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'P08 - AI-First Lab returns HTTP 200',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'AI-First Lab'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        /**
         * ====================================================
         * POSITIVE / STRUCTURE
         * ====================================================
         */

        test(
            'P09 - Response is a JSON array',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);

                const body =
                    await response.json();

                expect(
                    Array.isArray(body)
                ).toBeTruthy();
            }
        );

        test(
            'P10 - Employees contain employeeId and fullName',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                const body =
                    await response.json();

                expect(
                    body.length
                ).toBeGreaterThan(0);

                for (
                    const employee
                    of body
                ) {
                    expect(
                        employee
                    ).toHaveProperty(
                        'employeeId'
                    );

                    expect(
                        employee
                    ).toHaveProperty(
                        'fullName'
                    );
                }
            }
        );

        test(
            'P11 - Nested Employee Details sections have correct structure',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                const body =
                    await response.json();

                for (
                    const employee
                    of body
                ) {
                    expect(
                        employee
                    ).toHaveProperty(
                        'employeeDetail'
                    );

                    expect(
                        employee
                    ).toHaveProperty(
                        'employeeStatus'
                    );

                    expect(
                        employee
                    ).toHaveProperty(
                        'practiceSubPracticeBands'
                    );
                }
            }
        );

        /**
         * ====================================================
         * NEGATIVE TESTS
         * ====================================================
         */

        test(
            'N01 - Missing Authorization token',
            async ({ request }) => {
                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        ),
                        '' // Pass empty string to bypass default API_TOKEN parameter
                    );

                expect(
                    response.status()
                ).toBe(401);
            }
        );

        test(
            'N02 - Invalid Authorization token',
            async ({ request }) => {
                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        ),
                        'INVALID_TOKEN_123'
                    );

                expect(
                    response.status()
                ).toBe(401);
            }
        );

        test(
            'N03 - Invalid practice name',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'INVALID_PRACTICE_123'
                        )
                    );

                expect(
                    [200, 400, 404]
                ).toContain(
                    response.status()
                );
            }
        );

        test(
            'N04 - Empty practiceName',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        `${EMPLOYEE_DETAILS_URL}?practiceName=`
                    );

                expect(
                    [200, 400, 404]
                ).toContain(
                    response.status()
                );
            }
        );

        test(
            'N05 - SQL injection string in practiceName',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            "' OR '1'='1"
                        )
                    );

                expect(
                    [200, 400, 404]
                ).toContain(
                    response.status()
                );
            }
        );

        test(
            'N06 - Invalid endpoint returns 404',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        `${BASE_URL}/api/employeeDetailsInvalid?practiceName=Data%20%26%20AI`
                    );

                expect(
                    response.status()
                ).toBe(404);
            }
        );

        test(
            'N07 - Unsupported POST method',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await request.post(
                        getApiUrl(
                            'Data & AI'
                        ),
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${API_TOKEN}`,
                                Accept:
                                    'application/json',
                            },
                        }
                    );

                expect(
                    [404, 405]
                ).toContain(
                    response.status()
                );
            }
        );

        test(
            'N08 - Malformed URL parameter is handled safely',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        `${EMPLOYEE_DETAILS_URL}?practiceName=%ZZ`
                    );

                expect(
                    [200, 400, 404]
                ).toContain(
                    response.status()
                );
            }
        );

        /**
         * ====================================================
         * EDGE CASES
         * ====================================================
         */

        test(
            'E01 - Practice name with URL encoded ampersand',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        `${EMPLOYEE_DETAILS_URL}?practiceName=Data%20%26%20AI`
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'E02 - Practice name with URL encoded spaces',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        `${EMPLOYEE_DETAILS_URL}?practiceName=Digital%20Transformation`
                    );

                expect(
                    response.status()
                ).toBe(200);
            }
        );

        test(
            'E03 - Practice name with leading/trailing spaces',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            ' Data & AI '
                        )
                    );

                expect(
                    [200, 400]
                ).toContain(
                    response.status()
                );
            }
        );

        test(
            'E04 - Case variation of practice',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'data & ai'
                        )
                    );

                expect(
                    [200, 400, 404]
                ).toContain(
                    response.status()
                );
            }
        );

        test(
            'E05 - Unicode/special characters in practice',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI 🚀'
                        )
                    );

                expect(
                    [200, 400, 404]
                ).toContain(
                    response.status()
                );
            }
        );

        test(
            'E06 - Duplicate employee IDs are detected',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);

                const body =
                    await response.json();

                const ids =
                    body.map(
                        (x: any) =>
                            normalizeId(
                                x.employeeId
                            )
                    );

                const uniqueIds =
                    new Set(
                        ids
                    );

                expect(
                    uniqueIds.size
                ).toBe(
                    ids.length
                );
            }
        );

        test(
            'E07 - No employee has blank employeeId',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                const body =
                    await response.json();

                for (
                    const employee
                    of body
                ) {
                    expect(
                        normalizeId(
                            employee.employeeId
                        )
                    ).not.toBe('');
                }
            }
        );

        test(
            'E08 - No employee has blank fullName',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                const body =
                    await response.json();

                for (
                    const employee
                    of body
                ) {
                    expect(
                        normalizeString(
                            employee.fullName
                        )
                    ).not.toBe('');
                }
            }
        );

        /**
         * ====================================================
         * DB TESTS
         * ====================================================
         */

        test(
            'DB01 - Complete API vs DB validation for all practices',
            async ({ request }) => {

                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                let connection:
                    mysql.Connection |
                    undefined;

                const allIssues:
                    ValidationIssue[] = [];

                try {
                    connection =
                        await createDbConnection();

                    console.log(
                        '\n============================================================'
                    );

                    console.log(
                        'COMPLETE EMPLOYEE DETAILS API ↔ DB VALIDATION'
                    );

                    console.log(
                        '============================================================'
                    );

                    for (
                        const practice
                        of practices
                    ) {
                        const issues =
                            await validatePracticeAgainstDb(
                                request,
                                connection,
                                practice
                            );

                        allIssues.push(
                            ...issues
                        );
                    }

                } finally {
                    if (
                        connection
                    ) {
                        await connection.end();
                    }
                }

                /**
                 * Summary
                 */

                const count =
                    (
                        type: IssueType
                    ) =>
                        allIssues.filter(
                            issue =>
                                issue.type ===
                                type
                        ).length;

                console.log(
                    '\n============================================================'
                );

                console.log(
                    'EMPLOYEE DETAILS API ↔ DB SUMMARY'
                );

                console.log(
                    '============================================================'
                );

                console.log(
                    `Not Found in DB : ${count(
                        'NOT_FOUND_IN_DB'
                    )}`
                );

                console.log(
                    `Not Found in API : ${count(
                        'NOT_FOUND_IN_API'
                    )}`
                );

                console.log(
                    `Mismatches : ${count(
                        'MISMATCH'
                    )}`
                );

                console.log(
                    `API Only : ${count(
                        'API_ONLY'
                    )}`
                );

                console.log(
                    `DB Only : ${count(
                        'DB_ONLY'
                    )}`
                );

                console.log(
                    `Duplicates : ${count(
                        'DUPLICATE'
                    )}`
                );

                console.log(
                    `Missing Fields : ${count(
                        'MISSING_FIELD'
                    )}`
                );

                console.log(
                    `Invalid Values : ${count(
                        'INVALID_VALUE'
                    )}`
                );

                console.log(
                    `API Errors : ${count(
                        'API_ERROR'
                    )}`
                );

                console.log(
                    `DB Errors : ${count(
                        'DB_ERROR'
                    )}`
                );

                console.log(
                    `Structure Errors : ${count(
                        'STRUCTURE_ERROR'
                    )}`
                );

                console.log(
                    `TOTAL ISSUES : ${allIssues.length}`
                );

                expect(
                    allIssues,
                    `Employee Details API ↔ DB validation failed with ${allIssues.length} issue(s)`
                ).toHaveLength(0);
            }
        );

        /**
         * ====================================================
         * DB02 - Employee IDs API vs DB
         * ====================================================
         */

        test(
            'DB02 - API employee IDs exist in emp_details',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT emp_id
                            FROM emp_details
                            `
                        );

                    const dbIds =
                        new Set(
                            (rows as any[])
                                .map(
                                    row =>
                                        normalizeId(
                                            row.emp_id
                                        )
                                )
                        );

                    for (
                        const practice
                        of practices
                    ) {
                        const response =
                            await getJson(
                                request,
                                getApiUrl(
                                    practice
                                )
                            );

                        expect(
                            response.status()
                        ).toBe(200);

                        const body =
                            await response.json();

                        for (
                            const employee
                            of body
                        ) {
                            expect(
                                dbIds.has(
                                    normalizeId(
                                        employee.employeeId
                                    )
                                )
                            ).toBeTruthy();
                        }
                    }
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB03 - DB practice mappings exist in API
         * ====================================================
         */

        test(
            'DB03 - Current practice_sub_practice_band employees exist in API',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const connection =
                    await createDbConnection();

                try {
                    for (
                        const practice
                        of practices
                    ) {
                        const [
                            rows,
                        ] =
                            await connection.execute(
                                `
                                SELECT DISTINCT
                                    employee_id
                                FROM practice_sub_practice_band
                                WHERE LOWER(TRIM(practice))
                                    = LOWER(TRIM(?))
                                `,
                                [practice]
                            );

                        const dbIds =
                            (rows as any[])
                                .map(
                                    row =>
                                        normalizeId(
                                            row.employee_id
                                        )
                                );

                        const response =
                            await getJson(
                                request,
                                getApiUrl(
                                    practice
                                )
                            );

                        expect(
                            response.status()
                        ).toBe(200);

                        const body =
                            await response.json();

                        const apiIds =
                            new Set(
                                body.map(
                                    (x: any) =>
                                        normalizeId(
                                            x.employeeId
                                        )
                                )
                            );

                        for (
                            const id
                            of dbIds
                        ) {
                            expect(
                                apiIds.has(id)
                            ).toBeTruthy();
                        }
                    }
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB04 - Employee Status consistency
         * ====================================================
         */

        test(
            'DB04 - employee_status employee IDs reference valid employees',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                es.employee_id
                            FROM employee_status es
                            LEFT JOIN emp_details e
                                ON e.emp_id = es.employee_id
                            WHERE e.emp_id IS NULL
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB05 - Documents consistency
         * ====================================================
         */

        test(
            'DB05 - employee_documents employee IDs reference valid employees',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                ed.employee_id
                            FROM employee_documents ed
                            LEFT JOIN emp_details e
                                ON e.emp_id = ed.employee_id
                            WHERE e.emp_id IS NULL
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB06 - Project structure consistency
         * ====================================================
         */

        test(
            'DB06 - employee_project_and_reporting_structure references valid employees',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                eps.employee_id
                            FROM employee_project_and_reporting_structure eps
                            LEFT JOIN emp_details e
                                ON e.emp_id = eps.employee_id
                            WHERE e.emp_id IS NULL
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB07 - Customer onboarding consistency
         * ====================================================
         */

        test(
            'DB07 - customer_onboardings employee IDs reference valid employees',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                co.employee_id
                            FROM customer_onboardings co
                            LEFT JOIN emp_details e
                                ON e.emp_id = co.employee_id
                            WHERE e.emp_id IS NULL
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB08 - Practice mapping consistency
         * ====================================================
         */

        test(
            'DB08 - practice_sub_practice_band employee IDs reference valid employees',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                psb.employee_id
                            FROM practice_sub_practice_band psb
                            LEFT JOIN emp_details e
                                ON e.emp_id = psb.employee_id
                            WHERE e.emp_id IS NULL
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB09 - Designation consistency
         * ====================================================
         */

        test(
            'DB09 - designation/experience employee IDs reference valid employees',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                de.employee_id
                            FROM employee_designation_and_experience de
                            LEFT JOIN emp_details e
                                ON e.emp_id = de.employee_id
                            WHERE e.emp_id IS NULL
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB10 - Duplicate employee IDs in main table
         * ====================================================
         */

        test(
            'DB10 - emp_details has unique employee IDs',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                emp_id,
                                COUNT(*) AS cnt
                            FROM emp_details
                            GROUP BY emp_id
                            HAVING COUNT(*) > 1
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB11 - Invalid is_deleted values
         * ====================================================
         */

        test(
            'DB11 - emp_details is_deleted contains only 0, 1 or NULL',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                emp_id,
                                is_deleted
                            FROM emp_details
                            WHERE is_deleted NOT IN (0, 1)
                              AND is_deleted IS NOT NULL
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * DB12 - Orphan practice mappings
         * ====================================================
         */

        test(
            'DB12 - No orphan practice mappings',
            async () => {
                const connection =
                    await createDbConnection();

                try {
                    const [
                        rows,
                    ] =
                        await connection.execute(
                            `
                            SELECT
                                psb.practice_id
                            FROM practice_sub_practice_band psb
                            LEFT JOIN emp_details e
                                ON e.emp_id = psb.employee_id
                            WHERE e.emp_id IS NULL
                            `
                        );

                    expect(
                        rows
                    ).toHaveLength(0);
                } finally {
                    await connection.end();
                }
            }
        );

        /**
         * ====================================================
         * API QUALITY
         * ====================================================
         */

        test(
            'A01 - API response time is below 10 seconds',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const start =
                    Date.now();

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                const duration =
                    Date.now() - start;

                expect(
                    response.status()
                ).toBe(200);

                console.log(
                    `Response time: ${duration} ms`
                );

                expect(
                    duration
                ).toBeLessThan(
                    10000
                );
            }
        );

        test(
            'A02 - API returns JSON content type',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);

                const contentType =
                    response.headers()[
                    'content-type'
                    ] || '';

                expect(
                    contentType
                        .toLowerCase()
                ).toContain(
                    'application/json'
                );
            }
        );

        test(
            'A03 - Repeated request returns consistent employee count',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response1 =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                const response2 =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                expect(
                    response1.status()
                ).toBe(200);

                expect(
                    response2.status()
                ).toBe(200);

                const body1 =
                    await response1.json();

                const body2 =
                    await response2.json();

                expect(
                    body1.length
                ).toBe(
                    body2.length
                );
            }
        );

        test(
            'A04 - Practice parameter is actually respected',
            async ({ request }) => {
                test.skip(
                    !API_TOKEN,
                    'API_TOKEN missing'
                );

                const response =
                    await getJson(
                        request,
                        getApiUrl(
                            'Data & AI'
                        )
                    );

                expect(
                    response.status()
                ).toBe(200);

                const body =
                    await response.json();

                for (
                    const employee
                    of body
                ) {
                    const mappings =
                        employee.practiceSubPracticeBands;

                    expect(
                        Array.isArray(
                            mappings
                        )
                    ).toBeTruthy();

                    const found =
                        mappings.some(
                            (mapping: any) =>
                                normalizeString(
                                    mapping.practice
                                ) ===
                                normalizeString(
                                    'Data & AI'
                                )
                        );

                    expect(
                        found
                    ).toBeTruthy();
                }
            }
        );
    }
);