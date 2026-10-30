import { test, expect } from '@playwright/test';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const API_ROOT = (process.env.API_BASE_URL || (process.env.BASE_URL?.includes('localhost') ? 'http://localhost:8080/api' : 'https://13.61.179.149/api/api')).replace(/\/+$/, '');
const API_URL = `${API_ROOT}/sow/get/allSoW`;

import fs from 'fs';
import path from 'path';

let API_TOKEN = process.env.API_TOKEN || '';

if (!API_TOKEN) {
    try {
        const authPath = path.resolve(__dirname, '../../.auth/user.json');
        if (fs.existsSync(authPath)) {
            const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
            const ls = authData.origins?.[0]?.localStorage || [];
            const tokenItem = ls.find((item: any) => item.name === 'token');
            if (tokenItem) {
                let tokenStr = tokenItem.value;
                if (tokenStr.startsWith('"') && tokenStr.endsWith('"')) {
                    tokenStr = tokenStr.slice(1, -1);
                }
                API_TOKEN = tokenStr;
                console.log('Successfully loaded auth token from user.json');
            }
        } else {
            console.log('user.json not found at:', authPath);
        }
    } catch (err) {
        console.log('Could not read auth token from user.json:', err);
    }
}
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hrportal',
};

/*
 * Normalize values before comparison.
 */
function normalize(value: any): any {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return Number(value);
    }

    if (typeof value === 'string') {
        return value.trim();
    }

    return value;
}

/*
 * Normalize dates without timezone conversion.
 *
 * Important:
 * The API returns values such as:
 *     2026-05-01
 *
 * MySQL can return a Date object whose string representation may
 * appear as:
 *     Fri May 01 2026 ...
 *
 * We compare the calendar date only.
 */
function normalizeDate(value: any): string | null {
    if (!value) {
        return null;
    }

    /*
     * If the value is already an ISO/date string,
     * take the YYYY-MM-DD portion directly.
     */
    const valueString = String(value);

    const isoMatch = valueString.match(
        /^(\d{4}-\d{2}-\d{2})/
    );

    if (isoMatch) {
        return isoMatch[1];
    }

    /*
     * MySQL Date object / Date.toString() handling.
     *
     * Convert using local date components instead of
     * toISOString(), which can shift the date because of UTC.
     */
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getFullYear();
        const month = String(
            value.getMonth() + 1
        ).padStart(2, '0');

        const day = String(
            value.getDate()
        ).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    /*
     * Last fallback.
     */
    return valueString.substring(0, 10);
}

/*
 * Convert DB bit / boolean values to boolean.
 */
function normalizeBoolean(value: any): boolean | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (Buffer.isBuffer(value)) {
        return value[0] === 1;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    return Number(value) === 1;
}

test.describe.configure({ mode: 'default' });

test.describe(
    'SmartTracker - SoW API vs Database Validation',
    () => {

        test(
            'Validate Get All SoWs API against Database',
            async ({ request }) => {

                console.log(
                    '\n============================================================'
                );
                console.log(
                    'SMARTTRACKER - SoW API vs DATABASE VALIDATION'
                );
                console.log(
                    '============================================================'
                );

                console.log(
                    `API URL: ${API_URL}`
                );

                /*
                 * =====================================================
                 * 1. CALL API
                 * =====================================================
                 */

                console.log('\n--- Calling SoW API ---');

                const response = await request.get(
                    API_URL,
                    {
                        headers: {
                            Authorization:
                                `Bearer ${API_TOKEN}`,
                            Accept: 'application/json',
                        },
                    }
                );

                const status = response.status();

                console.log(
                    `HTTP Status: ${status}`
                );

                expect(status).toBe(200);

                const apiData =
                    await response.json();

                expect(
                    Array.isArray(apiData)
                ).toBe(true);

                console.log(
                    `API SoW Records: ${apiData.length}`
                );

                /*
                 * =====================================================
                 * 2. CONNECT DATABASE
                 * =====================================================
                 */

                console.log(
                    '\n--- Connecting to Database ---'
                );

                const db =
                    await mysql.createConnection(
                        DB_CONFIG
                    );

                console.log(
                    'Database connection: SUCCESS'
                );

                /*
                 * =====================================================
                 * 3. FETCH MAIN SOW DATA
                 * =====================================================
                 */

                console.log(
                    '\n--- Fetching SoW Data from Database ---'
                );

                const [sowRows] =
                    await db.execute(`
                        SELECT
                            sow_id,
                            sow_name,
                            sow_number,
                            po_number,
                            sow_type,
                            sow_status,
                            financial_year,
                            sow_start_date,
                            sow_end_date,
                            created_by,
                            updated_by,
                            create_date,
                            update_date,
                            note,
                            total_budget,
                            available_budget,
                            currency,
                            relanto_sow_owner,
                            projected_revenue,
                            is_monthly,
                            is_custom_sow,
                            is_cloned,
                            client_id,
                            client_portfolio_id,
                            client_sow_owner_id,
                            financial_quarter_id,
                            financial_year_id
                        FROM sow
                    `);

                const dbSows =
                    sowRows as any[];

                console.log(
                    `DB SoW Records: ${dbSows.length}`
                );

                /*
                 * =====================================================
                 * 4. RECORD COUNT VALIDATION
                 * =====================================================
                 */

                console.log(
                    '\n--- Record Count Validation ---'
                );

                console.log(
                    `API Records: ${apiData.length} | ` +
                    `DB Records: ${dbSows.length}`
                );

                expect(
                    apiData.length,
                    'API SoW count should match DB SoW count'
                ).toBe(dbSows.length);

                /*
                 * =====================================================
                 * 5. VALIDATE EACH SOW
                 * =====================================================
                 */

                let totalFieldChecks = 0;
                let passedFieldChecks = 0;
                let failedFieldChecks = 0;

                const validationFailures: string[] = [];
                const dashboardTable: any[] = [];

                console.log(
                    '\n============================================================'
                );
                console.log(
                    'STARTING SoW FIELD VALIDATION'
                );
                console.log(
                    '============================================================'
                );

                // Check for SoWs in API but not in DB
                for (const apiSow of apiData) {
                    const sowId = Number(apiSow.sowId);
                    const dbSow = dbSows.find(db => Number(db.sow_id) === sowId);
                    if (!dbSow) {
                        const message = `SoW ${sowId}: Record exists in API but not in DB`;
                        console.error(`❌ ${message}`);
                        validationFailures.push(message);
                        dashboardTable.push({
                            'SoW ID': sowId,
                            'SoW Name': apiSow.sowName || 'Unknown',
                            Status: '❌ SKIPPED',
                            Reason: 'Not present in DB'
                        });
                        failedFieldChecks++;
                    }
                }

                for (const dbSow of dbSows) {

                    const sowId =
                        Number(dbSow.sow_id);

                    const apiSow =
                        apiData.find(
                            (item: any) =>
                                Number(item.sowId) === sowId
                        );

                    /*
                     * API record missing
                     */
                    if (!apiSow) {

                        const message =
                            `SoW ${sowId}: Record exists in DB but not in API`;

                        console.error(
                            `❌ ${message}`
                        );

                        validationFailures.push(
                            message
                        );

                        dashboardTable.push({
                            'SoW ID': sowId,
                            'SoW Name': dbSow.sow_name || 'Unknown',
                            Status: '❌ SKIPPED',
                            Reason: 'Not present in API'
                        });

                        failedFieldChecks++;

                        continue;
                    }

                    console.log(
                        `\n--- Validating SoW ID: ${sowId} ---`
                    );

                    let sowFailures = 0;
                    let firstFailureReason = '';

                    /*
                     * =================================================
                     * BASIC SOW FIELDS
                     * =================================================
                     */

                    const fieldChecks = [

                        {
                            field: 'sowName',
                            api: normalize(
                                apiSow.sowName
                            ),
                            db: normalize(
                                dbSow.sow_name
                            ),
                        },

                        {
                            field: 'sowNumber',
                            api: normalize(
                                apiSow.sowNumber
                            ),
                            db: normalize(
                                dbSow.sow_number
                            ),
                        },

                        {
                            field: 'poNumber',
                            api: normalize(
                                apiSow.poNumber
                            ),
                            db: normalize(
                                dbSow.po_number
                            ),
                        },

                        {
                            field: 'sowType',
                            api: normalize(
                                apiSow.sowType
                            ),
                            db: normalize(
                                dbSow.sow_type
                            ),
                        },

                        {
                            field: 'sowStatus',
                            api: normalize(
                                apiSow.sowStatus
                            ),
                            db: normalize(
                                dbSow.sow_status
                            ),
                        },

                        {
                            field: 'financialYear',
                            api: normalize(
                                apiSow.financialYear
                            ),
                            db: normalize(
                                dbSow.financial_year
                            ),
                        },

                        {
                            field: 'createdBy',
                            api: normalize(
                                apiSow.createdBy
                            ),
                            db: normalize(
                                dbSow.created_by
                            ),
                        },

                        {
                            field: 'updatedBy',
                            api: normalize(
                                apiSow.updatedBy
                            ),
                            db: normalize(
                                dbSow.updated_by
                            ),
                        },

                        {
                            field: 'note',
                            api: normalize(
                                apiSow.note
                            ),
                            db: normalize(
                                dbSow.note
                            ),
                        },

                        {
                            field: 'currency',
                            api: normalize(
                                apiSow.currency
                            ),
                            db: normalize(
                                dbSow.currency
                            ),
                        },

                        /*
                         * REAL API/DB validation.
                         * Do not ignore this mismatch.
                         */
                        {
                            field: 'relantoSowOwner',
                            api: normalize(
                                apiSow.relantoSowOwner
                            ),
                            db: normalize(
                                dbSow.relanto_sow_owner
                            ),
                        },

                        {
                            field: 'totalBudget',
                            api: Number(
                                apiSow.totalBudget || 0
                            ),
                            db: Number(
                                dbSow.total_budget || 0
                            ),
                        },

                        {
                            field: 'availableBudget',
                            api: Number(
                                apiSow.availableBudget || 0
                            ),
                            db: Number(
                                dbSow.available_budget || 0
                            ),
                        },

                        {
                            field: 'projectedRevenue',
                            api: Number(
                                apiSow.projectedRevenue || 0
                            ),
                            db: Number(
                                dbSow.projected_revenue || 0
                            ),
                        },

                        {
                            field: 'isMonthly',
                            api: normalizeBoolean(
                                apiSow.isMonthly
                            ),
                            db: normalizeBoolean(
                                dbSow.is_monthly
                            ),
                        },

                        {
                            field: 'isCustomSow',
                            api: normalizeBoolean(
                                apiSow.isCustomSow
                            ),
                            db: normalizeBoolean(
                                dbSow.is_custom_sow
                            ),
                        },

                        /*
                         * REAL API/DB validation.
                         * Do not ignore null vs false.
                         */
                        {
                            field: 'isCloned',
                            api: normalizeBoolean(
                                apiSow.isCloned
                            ),
                            db: normalizeBoolean(
                                dbSow.is_cloned
                            ),
                        },

                        /*
                         * Calendar-date comparison.
                         */
                        {
                            field: 'sowStartDate',
                            api: normalizeDate(
                                apiSow.sowStartDate
                            ),
                            db: normalizeDate(
                                dbSow.sow_start_date
                            ),
                        },

                        {
                            field: 'sowEndDate',
                            api: normalizeDate(
                                apiSow.sowEndDate
                            ),
                            db: normalizeDate(
                                dbSow.sow_end_date
                            ),
                        },
                    ];

                    /*
                     * =================================================
                     * FIELD COMPARISON
                     * =================================================
                     */

                    for (const check of fieldChecks) {

                        totalFieldChecks++;

                        const match =
                            check.api === check.db;

                        if (match) {

                            passedFieldChecks++;

                            console.log(
                                `✅ ${check.field.padEnd(20)} | ` +
                                `API: ${check.api} | ` +
                                `DB: ${check.db}`
                            );

                        } else {

                            failedFieldChecks++;
                            sowFailures++;
                            if (!firstFailureReason) {
                                firstFailureReason = `${check.field} mismatch`;
                            }

                            const message =
                                `SoW ${sowId} - ` +
                                `${check.field} mismatch | ` +
                                `API: ${check.api} | ` +
                                `DB: ${check.db}`;

                            console.error(
                                `❌ ${message}`
                            );

                            validationFailures.push(
                                message
                            );
                        }

                        expect.soft(
                            check.api,
                            `SoW ${sowId} - ` +
                            `${check.field} should match DB`
                        ).toBe(check.db);
                    }

                    /*
                     * =================================================
                     * CLIENT
                     * =================================================
                     */

                    if (dbSow.client_id !== null) {

                        const [clientRows] =
                            await db.execute(
                                `
                                SELECT
                                    id,
                                    name
                                FROM client
                                WHERE id = ?
                                `,
                                [dbSow.client_id]
                            );

                        const client =
                            (clientRows as any[])[0];

                        if (client) {

                            totalFieldChecks++;

                            const apiClientId =
                                apiSow.client?.id;

                            const apiClientName =
                                apiSow.client?.clientName ??
                                apiSow.client?.name;

                            const clientIdMatch =
                                Number(apiClientId) ===
                                Number(client.id);

                            const clientNameMatch =
                                apiClientName ===
                                client.name;

                            if (
                                clientIdMatch &&
                                clientNameMatch
                            ) {

                                passedFieldChecks++;

                                console.log(
                                    `✅ client | ` +
                                    `API: ${apiClientName} | ` +
                                    `DB: ${client.name}`
                                );

                            } else {

                                failedFieldChecks++;
                                sowFailures++;
                                if (!firstFailureReason) {
                                    firstFailureReason = 'client mismatch';
                                }

                                const message =
                                    `SoW ${sowId} - client mismatch | ` +
                                    `API: ${apiClientName} ` +
                                    `(${apiClientId}) | ` +
                                    `DB: ${client.name} ` +
                                    `(${client.id})`;

                                console.error(
                                    `❌ ${message}`
                                );

                                validationFailures.push(
                                    message
                                );
                            }

                            expect.soft(
                                Number(apiClientId),
                                `SoW ${sowId} client ID`
                            ).toBe(Number(client.id));

                            expect.soft(
                                apiClientName,
                                `SoW ${sowId} client name`
                            ).toBe(client.name);
                        }
                    }

                    /*
                     * =================================================
                     * CLIENT PORTFOLIO
                     * =================================================
                     */

                    if (
                        dbSow.client_portfolio_id !== null
                    ) {

                        const [portfolioRows] =
                            await db.execute(
                                `
                                SELECT
                                    id,
                                    client_portfolio
                                FROM client_portfolio
                                WHERE id = ?
                                `,
                                [
                                    dbSow.client_portfolio_id
                                ]
                            );

                        const portfolio =
                            (portfolioRows as any[])[0];

                        if (portfolio) {

                            const apiPortfolio =
                                apiSow.clientPortfolio;

                            expect.soft(
                                Number(apiPortfolio?.id),
                                `SoW ${sowId} client portfolio ID`
                            ).toBe(
                                Number(portfolio.id)
                            );

                            const apiPortfolioName =
                                apiPortfolio?.portfolioName ??
                                apiPortfolio?.clientPortfolio;

                            expect.soft(
                                apiPortfolioName,
                                `SoW ${sowId} client portfolio`
                            ).toBe(
                                portfolio.client_portfolio
                            );

                            console.log(
                                `Portfolio | ` +
                                `API: ${apiPortfolioName} | ` +
                                `DB: ${portfolio.client_portfolio}`
                            );
                        }
                    }

                    /*
                     * =================================================
                     * CLIENT SOW OWNER
                     * =================================================
                     */

                    if (
                        dbSow.client_sow_owner_id !== null
                    ) {

                        const [ownerRows] =
                            await db.execute(
                                `
                                SELECT
                                    id,
                                    client_sow_owner
                                FROM client_sow_owner
                                WHERE id = ?
                                `,
                                [
                                    dbSow.client_sow_owner_id
                                ]
                            );

                        const owner =
                            (ownerRows as any[])[0];

                        if (owner) {

                            const apiOwner =
                                apiSow.clientSowOwner;

                            expect.soft(
                                Number(apiOwner?.id),
                                `SoW ${sowId} client SoW owner ID`
                            ).toBe(
                                Number(owner.id)
                            );

                            const apiOwnerName =
                                apiOwner?.name ??
                                apiOwner?.clientSowOwner;

                            expect.soft(
                                apiOwnerName,
                                `SoW ${sowId} client SoW owner`
                            ).toBe(
                                owner.client_sow_owner
                            );

                            console.log(
                                `Client SoW Owner | ` +
                                `API: ${apiOwnerName} | ` +
                                `DB: ${owner.client_sow_owner}`
                            );
                        }
                    }

                    /*
                     * =================================================
                     * FINANCIAL YEAR
                     * =================================================
                     */

                    if (
                        dbSow.financial_year_id !== null
                    ) {

                        const [yearRows] =
                            await db.execute(
                                `
                                SELECT
                                    id,
                                    year
                                FROM financial_year
                                WHERE id = ?
                                `,
                                [
                                    dbSow.financial_year_id
                                ]
                            );

                        const year =
                            (yearRows as any[])[0];

                        if (year) {

                            const apiYear =
                                apiSow.year;

                            expect.soft(
                                Number(apiYear?.id),
                                `SoW ${sowId} financial year ID`
                            ).toBe(
                                Number(year.id)
                            );

                            const apiYearValue =
                                apiYear?.yearValue ??
                                apiYear?.year;

                            expect.soft(
                                apiYearValue,
                                `SoW ${sowId} financial year`
                            ).toBe(year.year);

                            console.log(
                                `Financial Year | ` +
                                `API: ${apiYearValue} | ` +
                                `DB: ${year.year}`
                            );
                        }
                    }

                    /*
                     * =================================================
                     * FINANCIAL QUARTER
                     * =================================================
                     */

                    if (
                        dbSow.financial_quarter_id !== null
                    ) {

                        const [quarterRows] =
                            await db.execute(
                                `
                                SELECT
                                    id,
                                    quarter
                                FROM financial_quarter
                                WHERE id = ?
                                `,
                                [
                                    dbSow.financial_quarter_id
                                ]
                            );

                        const quarter =
                            (quarterRows as any[])[0];

                        if (quarter) {

                            /*
                             * The API response structure may expose
                             * financial quarter as financialQuarters
                             * rather than financialQuarter.
                             *
                             * Support the actual returned structure
                             * without treating undefined as valid.
                             */
                            const apiQuarterCollection =
                                Array.isArray(
                                    apiSow.financialQuarters
                                )
                                    ? apiSow.financialQuarters
                                    : [];

                            const apiQuarter =
                                apiSow.financialQuarter ??
                                apiQuarterCollection.find(
                                    (q: any) =>
                                        Number(
                                            q?.id
                                        ) ===
                                        Number(
                                            quarter.id
                                        )
                                );

                            const apiQuarterId =
                                apiQuarter?.id;

                            const apiQuarterName =
                                apiQuarter?.quarterName ??
                                apiQuarter?.quarter;

                            expect.soft(
                                Number(apiQuarterId),
                                `SoW ${sowId} financial quarter ID`
                            ).toBe(
                                Number(quarter.id)
                            );

                            expect.soft(
                                apiQuarterName,
                                `SoW ${sowId} financial quarter`
                            ).toBe(
                                quarter.quarter
                            );

                            console.log(
                                `Financial Quarter | ` +
                                `API: ${apiQuarterName} | ` +
                                `DB: ${quarter.quarter}`
                            );
                        }
                    }

                    /*
                     * =================================================
                     * SOW PRACTICES
                     * =================================================
                     */

                    const [practiceRows] =
                        await db.execute(
                            `
                            SELECT
                                id,
                                practice_name,
                                sow_id
                            FROM sowpractice
                            WHERE sow_id = ?
                            `,
                            [sowId]
                        );

                    const dbPractices =
                        practiceRows as any[];

                    const apiPractices =
                        Array.isArray(
                            apiSow.soWPractices
                        )
                            ? apiSow.soWPractices
                            : [];

                    const dbPracticeNames =
                        dbPractices
                            .map((p: any) =>
                                String(
                                    p.practice_name
                                ).trim()
                            )
                            .sort();

                    const apiPracticeNames =
                        apiPractices
                            .map((p: any) =>
                                String(
                                    p.practiceName ??
                                    p.practice_name ??
                                    p.name ??
                                    p
                                ).trim()
                            )
                            .sort();

                    expect.soft(
                        apiPracticeNames,
                        `SoW ${sowId} practices`
                    ).toEqual(
                        dbPracticeNames
                    );

                    console.log(
                        `Practices | ` +
                        `API: ${JSON.stringify(apiPracticeNames)} | ` +
                        `DB: ${JSON.stringify(dbPracticeNames)}`
                    );

                    /*
                     * =================================================
                     * RESOURCES
                     * =================================================
                     */

                    const [resourceRows] =
                        await db.execute(
                            `
                            SELECT
                                id,
                                employee_id,
                                start_date,
                                end_date,
                                financial_quarter,
                                funded,
                                is_deleted,
                                month1,
                                month2,
                                month3,
                                niche_resource,
                                override,
                                percent_allocation,
                                quarter4,
                                resource,
                                system_bill_rate,
                                total_amount,
                                working_days1,
                                working_days2,
                                working_days3,
                                working_days4,
                                sow_id
                            FROM resources
                            WHERE sow_id = ?
                              AND (
                                  is_deleted = 0
                                  OR is_deleted IS NULL
                              )
                            `,
                            [sowId]
                        );

                    const dbResources =
                        resourceRows as any[];

                    const apiResources =
                        Array.isArray(apiSow.resource)
                            ? apiSow.resource
                            : [];

                    console.log(
                        `Resources | ` +
                        `API: ${apiResources.length} | ` +
                        `DB: ${dbResources.length}`
                    );

                    expect.soft(
                        apiResources.length,
                        `SoW ${sowId} resource count`
                    ).toBe(
                        dbResources.length
                    );

                    /*
                     * Validate resource employee IDs.
                     *
                     * Backend model identifies employeeId as
                     * the employee identifier. Keep employee_id
                     * as fallback for serialized naming variations.
                     */
                    const dbEmployeeIds =
                        dbResources
                            .map((r: any) =>
                                String(
                                    r.employee_id
                                ).trim()
                            )
                            .sort();

                    if (apiResources.length > 0) {
                        console.log('\nRESOURCE OBJECT DEBUG - SoW:', sowId);
                        console.log(JSON.stringify(apiResources[0], null, 2));
                    }

                    const apiEmployeeIds =
                        apiResources
                            .map((r: any) => {

                                const employeeId =
                                    r.employeeId ??
                                    r.employee_id;

                                if (employeeId === null || employeeId === undefined) {
                                    return 'null';
                                }

                                return String(
                                    employeeId
                                ).trim();
                            })
                            .sort();

                    expect.soft(
                        apiEmployeeIds,
                        `SoW ${sowId} resource employee IDs`
                    ).toEqual(
                        dbEmployeeIds
                    );

                    console.log(
                        `Resource Employee IDs | ` +
                        `API: ${JSON.stringify(apiEmployeeIds)} | ` +
                        `DB: ${JSON.stringify(dbEmployeeIds)}`
                    );

                    /*
                     * =================================================
                     * STATUS HISTORY
                     * =================================================
                     */

                    const [historyRows] =
                        await db.execute(
                            `
                            SELECT
                                id,
                                approver_full_name,
                                approver_user_name,
                                changed_by,
                                note,
                                rejection_reason,
                                status,
                                status_change_date,
                                sow_id
                            FROM sowstatus_history
                            WHERE sow_id = ?
                            ORDER BY status_change_date, id
                            `,
                            [sowId]
                        );

                    const dbHistory =
                        historyRows as any[];

                    const apiHistory =
                        Array.isArray(
                            apiSow.statusHistory
                        )
                            ? apiSow.statusHistory
                            : [];

                    console.log(
                        `Status History | ` +
                        `API: ${apiHistory.length} | ` +
                        `DB: ${dbHistory.length}`
                    );

                    expect.soft(
                        apiHistory.length,
                        `SoW ${sowId} status history count`
                    ).toBe(
                        dbHistory.length
                    );

                    const dbStatuses =
                        dbHistory.map(
                            (h: any) =>
                                String(
                                    h.status ?? ''
                                ).trim()
                        );

                    const apiStatuses =
                        apiHistory.map(
                            (h: any) =>
                                String(
                                    h.status ??
                                    h.sowStatus ??
                                    ''
                                ).trim()
                        );

                    expect.soft(
                        apiStatuses,
                        `SoW ${sowId} status history`
                    ).toEqual(
                        dbStatuses
                    );

                    console.log(
                        `Status History Values | ` +
                        `API: ${JSON.stringify(apiStatuses)} | ` +
                        `DB: ${JSON.stringify(dbStatuses)}`
                    );
                    if (sowFailures > 0) {
                        dashboardTable.push({
                            'SoW ID': sowId,
                            'SoW Name': dbSow.sow_name || 'Unknown',
                            Status: '❌ FAIL',
                            Reason: `${sowFailures} issue(s) (e.g. ${firstFailureReason})`
                        });
                    } else {
                        dashboardTable.push({
                            'SoW ID': sowId,
                            'SoW Name': dbSow.sow_name || 'Unknown',
                            Status: '✅ PASS',
                            Reason: ''
                        });
                    }
                }

                /*
                 * =====================================================
                 * 6. CLOSE DATABASE
                 * =====================================================
                 */

                await db.end();

                /*
                 * =====================================================
                 * 7. FINAL SUMMARY
                 * =====================================================
                 */

                console.log(
                    '\n============================================================'
                );

                console.log(
                    'SOW API VS DATABASE VALIDATION SUMMARY'
                );

                console.log(
                    '============================================================'
                );

                console.table(dashboardTable);

                console.log(
                    `Total Field Checks  : ${totalFieldChecks}`
                );

                console.log(
                    `Passed Field Checks : ${passedFieldChecks}`
                );

                console.log(
                    `Failed Field Checks : ${failedFieldChecks}`
                );

                console.log(
                    `Validation Failures : ${validationFailures.length}`
                );

                if (validationFailures.length > 0) {

                    console.log(
                        '\nFAILED VALIDATIONS:'
                    );

                    for (
                        const failure
                        of validationFailures
                    ) {
                        console.log(
                            `❌ ${failure}`
                        );
                    }
                }

                console.log(
                    '\n============================================================'
                );

                // ============================================================
                // NEGATIVE & EDGE CASES
                // ============================================================

                await test.step('Negative Case - Validate Get All SoWs API with Invalid Token', async () => {
                    console.log('\n--- NEGATIVE CASE: Invalid Token ---');
                    
                    const { request } = require('@playwright/test');
                    const reqContext = await request.newContext();

                    const response = await reqContext.get(`${API_ROOT}/sow/get/allSoW`, {
                        headers: {
                            'Authorization': 'Bearer INVALID_TOKEN_123',
                            'Accept': 'application/json, text/plain, */*'
                        }
                    });

                    console.log(`Response Status: ${response.status()}`);
                    
                    // Assert it fails authentication
                    expect.soft(response.status(), 'Invalid token should return 401 or 403').toBe(401);
                });

                await test.step('Edge Case - Validate API behavior with non-existent endpoint', async () => {
                    console.log('\n--- EDGE CASE: Non-existent Endpoint ---');
                    
                    const { request } = require('@playwright/test');
                    const reqContext = await request.newContext();

                    const response = await reqContext.get(`${API_ROOT}/sow/get/nonExistentSoWFilter`, {
                        headers: {
                            'Authorization': `Bearer ${API_TOKEN}`,
                            'Accept': 'application/json, text/plain, */*'
                        }
                    });

                    console.log(`Response Status: ${response.status()}`);
                    
                    // Assert it returns Not Found
                    expect.soft(response.status(), 'Non-existent endpoint should return 404').toBe(404);
                });

                /*
                 * Final hard assertion.
                 *
                 * Real API/DB mismatches must fail the test.
                 */
                expect(
                    validationFailures,
                    'SoW API and DB validation failures'
                ).toHaveLength(0);
            }
        );
    }
);