const { test, expect } = require('@playwright/test');
const { executeQuery } = require('../../../utils/dbUtils');
const fs = require('fs');
const path = require('path');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:4200/').replace(/\/$/, '');
const ALLOCATION_URL = `${BASE_URL}/employee/employee-allocation`;

// =============================================================================
// DATABASE QUERY
// =============================================================================
const EMPLOYEE_ALLOCATION_QUERY = `
SELECT
    e.emp_id AS employee_id,
    e.full_name AS employee_name,
    e.is_deleted,
    ea.allocation_id,
    p.client_name AS client,
    p.project_name AS project,
    ea.project_manager,
    p.project_type AS type,
    ea.start_date,
    ea.end_date,
    ea.project_role AS role,
    ea.project_location AS city,
    ea.practice,
    ea.allocation_percentage,
    ea.is_billable,
    ea.billing_rate,
    p.project_code,
    p.is_valid AS project_is_valid
FROM emp_details e
LEFT JOIN employee_allocation ea
    ON ea.emp_id = e.emp_id
LEFT JOIN project p
    ON p.id = ea.project_id
WHERE COALESCE(e.is_deleted, 0) = 0
ORDER BY
    e.emp_id,
    ea.start_date,
    ea.allocation_id;
`;

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

function normalizeDate(value) {
    if (value === null || value === undefined) return '';

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '';

        return [
            value.getFullYear(),
            String(value.getMonth() + 1).padStart(2, '0'),
            String(value.getDate()).padStart(2, '0')
        ].join('-');
    }

    const valueString = String(value).trim();

    if (
        !valueString ||
        ['null', 'undefined', '0000-00-00'].includes(
            valueString.toLowerCase()
        )
    ) {
        return '';
    }

    // ISO date or timestamp.
    let match = valueString.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})/
    );

    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }

    // UI format: MM/DD/YYYY.
    // If the first component exceeds 12, treat it as DD/MM/YYYY.
    match = valueString.match(
        /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/
    );

    if (match) {
        const first = Number(match[1]);
        const second = Number(match[2]);
        const year = match[3];

        let month;
        let day;

        if (first > 12) {
            day = first;
            month = second;
        } else if (second > 12) {
            month = first;
            day = second;
        } else {
            // Assumes MM/DD/YYYY when both components are <= 12.
            month = first;
            day = second;
        }

        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return valueString;
}

function formatDbDate(value) {
    return normalizeDate(value);
}

function getTodayDateString() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;

    return new Date(now.getTime() + istOffset)
        .toISOString()
        .slice(0, 10);
}

function classifyPeriod(startDate, endDate) {
    const today = getTodayDateString();
    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);

    if (end && end < today) return 'PREVIOUS';
    if (start && start > today) return 'FUTURE';

    return 'ACTIVE';
}

function normalizeText(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeNumber(value) {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ''
    ) {
        return null;
    }

    const number = Number(
        String(value).replace(/[%,\s$]/g, '')
    );

    return Number.isFinite(number) ? number : null;
}

function normalizeBillable(value) {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ''
    ) {
        return null;
    }

    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;

    const normalized = String(value).trim().toLowerCase();

    if (
        ['1', 'y', 'yes', 'true', 'billable'].includes(normalized)
    ) {
        return true;
    }

    if (
        ['0', 'n', 'no', 'false', 'non-billable', 'non billable']
            .includes(normalized)
    ) {
        return false;
    }

    return null;
}

function determineEmployeeStatus(
    totalCount,
    activeCount,
    activePercentage
) {
    if (totalCount === 0) {
        return 'BENCH (No Allocations)';
    }

    if (activeCount === 0) {
        return 'BENCH (Previously Allocated)';
    }

    if (activePercentage >= 100) {
        return `FULLY ALLOCATED (${activePercentage}%)`;
    }

    return `PARTIALLY ALLOCATED (${activePercentage}%)`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

// =============================================================================
// FIELD-BY-FIELD COMPARISON
// =============================================================================

function compareAllocation(db, ui, employeeId) {
    const allocationKey = [
        db.client,
        db.project,
        db.startDate,
        db.endDate,
        db.role
    ].join(' | ');

    const comparisons = [
        {
            field: 'Client',
            dbValue: db.client,
            uiValue: ui.client,
            normalize: normalizeText
        },
        {
            field: 'Project',
            dbValue: db.project,
            uiValue: ui.project,
            normalize: normalizeText
        },
        {
            field: 'Project Manager',
            dbValue: db.projectManager,
            uiValue: ui.projectManager,
            normalize: normalizeText
        },
        {
            field: 'Project Type',
            dbValue: db.type,
            uiValue: ui.type,
            normalize: normalizeText
        },
        {
            field: 'Start Date',
            dbValue: db.startDate,
            uiValue: ui.startDate,
            normalize: normalizeDate
        },
        {
            field: 'End Date',
            dbValue: db.endDate,
            uiValue: ui.endDate,
            normalize: normalizeDate
        },
        {
            field: 'Role',
            dbValue: db.role,
            uiValue: ui.role,
            normalize: normalizeText
        },
        {
            field: 'City',
            dbValue: db.city,
            uiValue: ui.city,
            normalize: normalizeText
        },
        {
            field: 'Allocation Percentage',
            dbValue: db.allocationPercentage,
            uiValue: ui.allocationPercentage,
            normalize: normalizeNumber
        },
        {
            field: 'Billable Status',
            dbValue: db.isBillable,
            uiValue: ui.isBillable,
            normalize: normalizeBillable
        },
        {
            field: 'Allocation Period',
            dbValue: db.period,
            uiValue: ui.period,
            normalize: normalizeText
        }
    ];

    const mismatches = [];

    for (const comparison of comparisons) {
        const expected = comparison.normalize(comparison.dbValue);
        const actual = comparison.normalize(comparison.uiValue);

        // Null values are compared explicitly, not silently ignored.
        if (expected !== actual) {
            mismatches.push({
                employeeId: String(employeeId),
                allocationKey,
                field: comparison.field,
                dbValue: comparison.dbValue ?? '(NULL)',
                uiValue: comparison.uiValue ?? '(NULL)'
            });
        }
    }

    return mismatches;
}

// Match on stable descriptive fields first. The matching logic below
// also uses a looser fallback so differences in dates or role can be
// reported as field mismatches instead of only as missing rows.
function allocationMatchKey(allocation) {
    return [
        normalizeText(allocation.client),
        normalizeText(allocation.project),
        normalizeDate(allocation.startDate),
        normalizeDate(allocation.endDate),
        normalizeText(allocation.role)
    ].join('|');
}

// =============================================================================
// HTML REPORT
// =============================================================================

function writeHtmlReport(results) {
    const reportsDirectory = path.join(process.cwd(), 'reports');

    if (!fs.existsSync(reportsDirectory)) {
        fs.mkdirSync(reportsDirectory, { recursive: true });
    }

    const reportPath = path.join(
        reportsDirectory,
        'employee_allocation_report.html'
    );

    const totalEmployees = results.length;

    const matched = results.filter(
        result => result.validationStatus === 'MATCH ✅'
    ).length;

    const mismatched = totalEmployees - matched;

    const fullyAllocated = results.filter(
        result => (result.employeeStatus || '').includes('FULLY ALLOCATED')
    ).length;

    const partiallyAllocated = results.filter(
        result => (result.employeeStatus || '').includes('PARTIALLY ALLOCATED')
    ).length;

    const bench = results.filter(
        result => (result.employeeStatus || '').includes('BENCH')
    ).length;

    const details = results.flatMap(result =>
        (result.fieldMismatches || []).map(mismatch => ({
            ...mismatch,
            employeeId: result.employeeId,
            employeeName: result.employeeName
        }))
    );

    const summaryRows = results.map((result, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(result.employeeId)}</td>
            <td>${escapeHtml(result.employeeName)}</td>
            <td>${result.dbTotal ?? 0}</td>
            <td>${result.dbActive ?? 0}</td>
            <td>${result.dbPrevious ?? 0}</td>
            <td>${result.dbFuture ?? 0}</td>
            <td>${result.uiTotal ?? 0}</td>
            <td>${result.uiActive ?? 0}</td>
            <td>${result.uiPrevious ?? 0}</td>
            <td>${result.uiFuture ?? 0}</td>
            <td>${result.activePercentage ?? 0}%</td>
            <td>${escapeHtml(result.employeeStatus)}</td>
            <td class="${result.validationStatus === 'MATCH ✅' ? 'pass' : 'fail'}">
                ${escapeHtml(result.validationStatus)}
            </td>
            <td>${(result.fieldMismatches || []).length}</td>
        </tr>
    `).join('');

    const detailRows = details.length
        ? details.map((mismatch, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(mismatch.employeeId)}</td>
                <td>${escapeHtml(mismatch.employeeName)}</td>
                <td>${escapeHtml(mismatch.allocationKey)}</td>
                <td>${escapeHtml(mismatch.field)}</td>
                <td>${escapeHtml(mismatch.dbValue)}</td>
                <td>${escapeHtml(mismatch.uiValue)}</td>
                <td class="fail">FAIL</td>
            </tr>
        `).join('')
        : '<tr><td colspan="8">No field mismatches recorded.</td></tr>';

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Employee Allocation DB vs UI</title>
<style>
body {
    font-family: Arial, sans-serif;
    background: #0f172a;
    color: #f8fafc;
    margin: 0;
    padding: 24px;
}
h1, h2 { color: #38bdf8; }
.subtitle { color: #94a3b8; margin-bottom: 20px; }
.cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin: 20px 0;
}
.card {
    background: #1e293b;
    padding: 16px;
    border: 1px solid #334155;
    border-radius: 8px;
}
.number { font-size: 26px; font-weight: bold; margin-top: 6px; }
.pass { color: #34d399; font-weight: bold; }
.fail { color: #f87171; font-weight: bold; }
input {
    width: 100%;
    box-sizing: border-box;
    padding: 11px;
    margin: 8px 0 16px;
    background: #1e293b;
    color: white;
    border: 1px solid #475569;
    border-radius: 6px;
}
.table-wrap { overflow: auto; margin-bottom: 28px; }
table {
    border-collapse: collapse;
    width: 100%;
    background: #1e293b;
    min-width: 1000px;
}
th, td {
    padding: 9px 11px;
    border: 1px solid #334155;
    text-align: left;
    font-size: 12px;
    vertical-align: top;
}
th {
    background: #111827;
    color: #cbd5e1;
    position: sticky;
    top: 0;
}
</style>
</head>
<body>
<h1>SmartTracker — Employee Allocation Field-by-Field Validation</h1>
<div class="subtitle">
Generated ${escapeHtml(new Date().toLocaleString())}.
Compared fields: client, project, project manager, type, start date,
end date, role, city, allocation percentage, billable status and period.
Country is extracted from the UI but is not compared because its DB source
is not established in the current query. Practice and billing rate are
not displayed in the allocation table and are excluded.
</div>

<div class="cards">
    <div class="card">Employees checked<div class="number">${totalEmployees}</div></div>
    <div class="card">Fully matched<div class="number pass">${matched}</div></div>
    <div class="card">Mismatch / not found<div class="number fail">${mismatched}</div></div>
    <div class="card">Fully allocated<div class="number">${fullyAllocated}</div></div>
    <div class="card">Partially allocated<div class="number">${partiallyAllocated}</div></div>
    <div class="card">Bench<div class="number">${bench}</div></div>
    <div class="card">Field mismatches<div class="number fail">${details.length}</div></div>
</div>

<h2>Employee Summary</h2>
<input id="summarySearch"
       placeholder="Filter by employee ID, name, or status"
       oninput="filterTable('summarySearch','summaryTable')">

<div class="table-wrap">
<table id="summaryTable">
<thead>
<tr>
<th>#</th><th>ID</th><th>Name</th>
<th>DB Total</th><th>DB Active</th><th>DB Previous</th><th>DB Future</th>
<th>UI Total</th><th>UI Active</th><th>UI Previous</th><th>UI Future</th>
<th>Active % (DB)</th><th>Status</th><th>Validation</th><th>Field mismatches</th>
</tr>
</thead>
<tbody>${summaryRows}</tbody>
</table>
</div>

<h2>Field-by-Field Mismatches</h2>
<input id="detailSearch"
       placeholder="Filter by employee, allocation, or field"
       oninput="filterTable('detailSearch','detailTable')">

<div class="table-wrap">
<table id="detailTable">
<thead>
<tr>
<th>#</th><th>ID</th><th>Name</th><th>Allocation key</th>
<th>Field</th><th>DB value</th><th>UI value</th><th>Result</th>
</tr>
</thead>
<tbody>${detailRows}</tbody>
</table>
</div>

<script>
function filterTable(inputId, tableId) {
    const query = document.getElementById(inputId).value.toLowerCase();
    document.querySelectorAll('#' + tableId + ' tbody tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query)
            ? ''
            : 'none';
    });
}
</script>
</body>
</html>`;

    fs.writeFileSync(reportPath, html, 'utf8');

    console.log(`\n[HTML Report] Generated: ${reportPath}`);
}

// =============================================================================
// TEST SUITE
// =============================================================================

test.describe('SmartTracker - Employee Allocation DB vs UI Validation', () => {
    test.setTimeout(1800000);

    let allDbRecords = [];
    let dbEmployeeMap = new Map();
    let allValidationResults = [];

    test.beforeAll(async () => {
        console.log('\n[DB Setup] Executing allocation query...');

        allDbRecords = await executeQuery(EMPLOYEE_ALLOCATION_QUERY);

        console.log(
            `[DB Setup] Fetched ${allDbRecords.length} DB records.`
        );

        dbEmployeeMap = new Map();

        for (const row of allDbRecords) {
            const employeeId = String(row.employee_id).trim();

            if (!dbEmployeeMap.has(employeeId)) {
                dbEmployeeMap.set(employeeId, {
                    employeeId,
                    employeeName: String(row.employee_name ?? '').trim(),
                    allocations: []
                });
            }

            if (
                row.allocation_id !== null &&
                row.allocation_id !== undefined
            ) {
                const startDate = formatDbDate(row.start_date);
                const endDate = formatDbDate(row.end_date);

                dbEmployeeMap.get(employeeId).allocations.push({
                    allocationId: row.allocation_id,
                    client: String(row.client ?? '').trim(),
                    project: String(row.project ?? '').trim(),
                    projectManager: String(row.project_manager ?? '').trim(),
                    type: String(row.type ?? '').trim(),
                    startDate,
                    endDate,
                    period: classifyPeriod(startDate, endDate),
                    role: String(row.role ?? '').trim(),
                    city: String(row.city ?? '').trim(),
                    practice: String(row.practice ?? '').trim(),
                    allocationPercentage: normalizeNumber(
                        row.allocation_percentage
                    ) ?? 0,
                    isBillable: normalizeBillable(row.is_billable),
                    billingRate: row.billing_rate,
                    projectCode: row.project_code,
                    projectIsValid: row.project_is_valid
                });
            }
        }

        console.log(
            `[DB Setup] Active employee records loaded: ${dbEmployeeMap.size}`
        );
    });

    test.afterAll(async () => {
        if (allValidationResults.length > 0) {
            writeHtmlReport(allValidationResults);
        }
    });

    // =========================================================================
    // SEARCH AND OPEN EMPLOYEE
    // =========================================================================

    async function searchAndOpenEmployee(page, employeeId) {
        const searchSelector =
            'input[formcontrolname="employeeNameOrId"]';

        const searchInput = page.locator(searchSelector);
        const cancelButton = page.getByRole('button', {
            name: /cancel/i
        });

        if (await cancelButton.isVisible().catch(() => false)) {
            await cancelButton.click();
            await page.waitForTimeout(400);

            await searchInput.waitFor({
                state: 'visible',
                timeout: 15000
            }).catch(() => { });
        }

        if (!await searchInput.isVisible().catch(() => false)) {
            await page.goto(ALLOCATION_URL, {
                waitUntil: 'domcontentloaded',
                timeout: 45000
            });

            await searchInput.waitFor({
                state: 'visible',
                timeout: 30000
            });
        }

        await searchInput.fill(String(employeeId));
        await page.waitForTimeout(300);

        await page.getByRole('button', {
            name: /^search$/i
        }).click();

        const employeeRow = page
            .locator('tr.mat-mdc-row')
            .filter({ hasText: String(employeeId) })
            .first();

        const rowFound = await employeeRow
            .waitFor({ state: 'visible', timeout: 8000 })
            .then(() => true)
            .catch(() => false);

        if (!rowFound) {
            return false;
        }

        await employeeRow.locator('button, a').last().click();

        await page.locator('table.allocations-table').waitFor({
            state: 'visible',
            timeout: 15000
        });

        return true;
    }

    // =========================================================================
    // EXTRACT ALL DISPLAYED ALLOCATION FIELDS FROM UI
    // =========================================================================

    async function getUiAllocations(page) {
        const rows = page.locator(
            'table.allocations-table tbody tr'
        );

        const rowCount = await rows.count();
        const allocations = [];

        for (let index = 0; index < rowCount; index++) {
            const row = rows.nth(index);
            const cells = row.locator('td');
            const cellCount = await cells.count();

            // Columns:
            // #, Client, Project, Manager, Type, Start, End,
            // Role, Country, City, Alloc %, Billable, Actions
            if (cellCount < 12) continue;

            async function getCellValue(cellIndex) {
                const cell = cells.nth(cellIndex);
                const control = cell.locator(
                    'input, select, textarea'
                );

                if (await control.count() > 0) {
                    const element = control.first();

                    const tagName = await element.evaluate(
                        el => el.tagName.toLowerCase()
                    );

                    if (tagName === 'select') {
                        return (
                            await element.locator('option:checked')
                                .textContent()
                        )?.trim() ?? '';
                    }

                    return (
                        await element.inputValue().catch(() => '')
                    ).trim();
                }

                return (
                    await cell.innerText().catch(() => '')
                ).trim();
            }

            const allocation = {
                client: await getCellValue(1),
                project: await getCellValue(2),
                projectManager: await getCellValue(3),
                type: await getCellValue(4),
                startDate: normalizeDate(
                    await getCellValue(5)
                ),
                endDate: normalizeDate(
                    await getCellValue(6)
                ),
                role: await getCellValue(7),
                country: await getCellValue(8),
                city: await getCellValue(9),
                allocationPercentage: normalizeNumber(
                    await getCellValue(10)
                ),
                isBillable: normalizeBillable(
                    await getCellValue(11)
                )
            };

            // Skip an empty template row.
            if (!allocation.client && !allocation.project) {
                continue;
            }

            allocation.period = classifyPeriod(
                allocation.startDate,
                allocation.endDate
            );

            allocations.push(allocation);
        }

        return allocations;
    }

    // =========================================================================
    // VALIDATE ONE EMPLOYEE
    // =========================================================================

    async function validateEmployee(page, employeeId) {
        const empId = String(employeeId);
        const dbData = dbEmployeeMap.get(empId);

        if (!dbData) return null;

        const opened = await searchAndOpenEmployee(page, empId);

        if (!opened) {
            const dbActive = dbData.allocations.filter(
                allocation => allocation.period === 'ACTIVE'
            );

            const dbPrevious = dbData.allocations.filter(
                allocation => allocation.period === 'PREVIOUS'
            );

            const dbFuture = dbData.allocations.filter(
                allocation => allocation.period === 'FUTURE'
            );

            const record = {
                employeeId: empId,
                employeeName: dbData.employeeName,
                dbTotal: dbData.allocations.length,
                dbActive: dbActive.length,
                dbPrevious: dbPrevious.length,
                dbFuture: dbFuture.length,
                uiTotal: 0,
                uiActive: 0,
                uiPrevious: 0,
                uiFuture: 0,
                activePercentage: dbActive.reduce(
                    (sum, allocation) =>
                        sum + (allocation.allocationPercentage || 0),
                    0
                ),
                employeeStatus: determineEmployeeStatus(
                    dbData.allocations.length,
                    dbActive.length,
                    0
                ),
                validationStatus: 'NOT FOUND IN UI ❌',
                fieldMismatches: [{
                    employeeId: empId,
                    allocationKey: '',
                    field: 'Employee Search',
                    dbValue: 'Employee exists in DB',
                    uiValue: 'Employee row not found'
                }]
            };

            allValidationResults.push(record);

            return {
                record,
                dbData,
                uiAllocations: [],
                isMatch: false,
                fieldMismatches: record.fieldMismatches
            };
        }

        const uiAllocations = await getUiAllocations(page);

        const dbActiveRows = dbData.allocations.filter(
            allocation => allocation.period === 'ACTIVE'
        );

        const dbPreviousRows = dbData.allocations.filter(
            allocation => allocation.period === 'PREVIOUS'
        );

        const dbFutureRows = dbData.allocations.filter(
            allocation => allocation.period === 'FUTURE'
        );

        const uiActiveRows = uiAllocations.filter(
            allocation => allocation.period === 'ACTIVE'
        );

        const uiPreviousRows = uiAllocations.filter(
            allocation => allocation.period === 'PREVIOUS'
        );

        const uiFutureRows = uiAllocations.filter(
            allocation => allocation.period === 'FUTURE'
        );

        const dbActivePercentage = dbActiveRows.reduce(
            (sum, allocation) =>
                sum + (allocation.allocationPercentage || 0),
            0
        );

        const uiActivePercentage = uiActiveRows.reduce(
            (sum, allocation) =>
                sum + (allocation.allocationPercentage || 0),
            0
        );

        const fieldMismatches = [];
        const matchedUiIndexes = new Set();

        // Match DB allocation records with UI records.
        for (const dbAllocation of dbData.allocations) {
            const exactKey = allocationMatchKey(dbAllocation);

            let uiIndex = uiAllocations.findIndex(
                (uiAllocation, index) =>
                    !matchedUiIndexes.has(index) &&
                    allocationMatchKey(uiAllocation) === exactKey
            );

            // Fallback to client/project to identify field differences
            // such as date or role mismatches.
            if (uiIndex === -1) {
                const dbLooseKey = [
                    normalizeText(dbAllocation.client),
                    normalizeText(dbAllocation.project)
                ].join('|');

                uiIndex = uiAllocations.findIndex(
                    (uiAllocation, index) =>
                        !matchedUiIndexes.has(index) &&
                        [
                            normalizeText(uiAllocation.client),
                            normalizeText(uiAllocation.project)
                        ].join('|') === dbLooseKey
                );
            }

            if (uiIndex === -1) {
                fieldMismatches.push({
                    employeeId: empId,
                    allocationKey: [
                        dbAllocation.client,
                        dbAllocation.project,
                        dbAllocation.startDate,
                        dbAllocation.endDate,
                        dbAllocation.role
                    ].join(' | '),
                    field: 'Allocation Record',
                    dbValue: 'Allocation exists in DB',
                    uiValue: 'Allocation row missing in UI'
                });

                continue;
            }

            matchedUiIndexes.add(uiIndex);

            fieldMismatches.push(
                ...compareAllocation(
                    dbAllocation,
                    uiAllocations[uiIndex],
                    empId
                )
            );
        }

        // Find unexpected UI records.
        uiAllocations.forEach((uiAllocation, index) => {
            if (!matchedUiIndexes.has(index)) {
                fieldMismatches.push({
                    employeeId: empId,
                    allocationKey: [
                        uiAllocation.client,
                        uiAllocation.project,
                        uiAllocation.startDate,
                        uiAllocation.endDate,
                        uiAllocation.role
                    ].join(' | '),
                    field: 'Unexpected UI Allocation',
                    dbValue: 'No matching DB allocation',
                    uiValue: 'Allocation row exists in UI'
                });
            }
        });

        // Aggregate checks.
        const aggregateComparisons = [
            {
                field: 'Total Allocation Count',
                dbValue: dbData.allocations.length,
                uiValue: uiAllocations.length
            },
            {
                field: 'Active Allocation Count',
                dbValue: dbActiveRows.length,
                uiValue: uiActiveRows.length
            },
            {
                field: 'Previous Allocation Count',
                dbValue: dbPreviousRows.length,
                uiValue: uiPreviousRows.length
            },
            {
                field: 'Future Allocation Count',
                dbValue: dbFutureRows.length,
                uiValue: uiFutureRows.length
            },
            {
                field: 'Total Active Allocation Percentage',
                dbValue: dbActivePercentage,
                uiValue: uiActivePercentage
            }
        ];

        for (const comparison of aggregateComparisons) {
            const differs =
                comparison.field === 'Total Active Allocation Percentage'
                    ? Math.abs(
                        comparison.dbValue - comparison.uiValue
                    ) > 0.001
                    : comparison.dbValue !== comparison.uiValue;

            if (differs) {
                fieldMismatches.push({
                    employeeId: empId,
                    allocationKey: 'Employee aggregate',
                    field: comparison.field,
                    dbValue: comparison.dbValue,
                    uiValue: comparison.uiValue
                });
            }
        }

        // Return to employee search.
        const cancelButton = page.getByRole('button', {
            name: /cancel/i
        });

        if (await cancelButton.isVisible().catch(() => false)) {
            await cancelButton.click();

            await page.locator(
                'input[formcontrolname="employeeNameOrId"]'
            ).waitFor({
                state: 'visible',
                timeout: 10000
            }).catch(() => { });
        }

        const employeeStatus = determineEmployeeStatus(
            dbData.allocations.length,
            dbActiveRows.length,
            dbActivePercentage
        );

        const isMatch = fieldMismatches.length === 0;

        const record = {
            employeeId: empId,
            employeeName: dbData.employeeName,

            dbTotal: dbData.allocations.length,
            dbActive: dbActiveRows.length,
            dbPrevious: dbPreviousRows.length,
            dbFuture: dbFutureRows.length,

            uiTotal: uiAllocations.length,
            uiActive: uiActiveRows.length,
            uiPrevious: uiPreviousRows.length,
            uiFuture: uiFutureRows.length,

            activePercentage: dbActivePercentage,
            employeeStatus,

            validationStatus: isMatch
                ? 'MATCH ✅'
                : 'MISMATCH ❌',

            fieldMismatches
        };

        console.log(
            `[TC-AL01] Employee ${empId}: ` +
            (isMatch
                ? 'PASS'
                : `FAIL — ${fieldMismatches.length} mismatches`)
        );

        for (const mismatch of fieldMismatches) {
            console.log(
                `  FAIL | ${mismatch.field} | ` +
                `DB=${mismatch.dbValue} | UI=${mismatch.uiValue}`
            );
        }

        allValidationResults.push(record);

        return {
            record,
            dbData,
            uiAllocations,
            isMatch,
            fieldMismatches
        };
    }

    // =========================================================================
    // TEST 1: DATABASE AUDIT
    // =========================================================================

    test(
        'TC-DB01 - Complete Database Audit: Active vs Previous vs Future Allocations',
        async () => {
            expect(allDbRecords.length).toBeGreaterThan(0);
            expect(dbEmployeeMap.size).toBeGreaterThan(0);

            let total = 0;
            let active = 0;
            let previous = 0;
            let future = 0;

            let fullyAllocated = 0;
            let partiallyAllocated = 0;
            let benchPreviouslyAllocated = 0;
            let benchNeverAllocated = 0;

            for (const data of dbEmployeeMap.values()) {
                total += data.allocations.length;

                const activeRows = data.allocations.filter(
                    allocation => allocation.period === 'ACTIVE'
                );

                const previousRows = data.allocations.filter(
                    allocation => allocation.period === 'PREVIOUS'
                );

                const futureRows = data.allocations.filter(
                    allocation => allocation.period === 'FUTURE'
                );

                active += activeRows.length;
                previous += previousRows.length;
                future += futureRows.length;

                const activePercentage = activeRows.reduce(
                    (sum, allocation) =>
                        sum + (allocation.allocationPercentage || 0),
                    0
                );

                if (data.allocations.length === 0) {
                    benchNeverAllocated++;
                } else if (activeRows.length === 0) {
                    benchPreviouslyAllocated++;
                } else if (activePercentage >= 100) {
                    fullyAllocated++;
                } else {
                    partiallyAllocated++;
                }
            }

            console.log('\n==============================================');
            console.log('DATABASE ALLOCATION AUDIT');
            console.log('==============================================');
            console.log(`Employees: ${dbEmployeeMap.size}`);
            console.log(`Total allocations: ${total}`);
            console.log(`Active allocations: ${active}`);
            console.log(`Previous allocations: ${previous}`);
            console.log(`Future allocations: ${future}`);
            console.log(`Fully allocated employees: ${fullyAllocated}`);
            console.log(`Partially allocated employees: ${partiallyAllocated}`);
            console.log(`Bench, previously allocated: ${benchPreviouslyAllocated}`);
            console.log(`Bench, never allocated: ${benchNeverAllocated}`);
            console.log('==============================================\n');

            expect(total).toBeGreaterThan(0);
        }
    );

    // =========================================================================
    // TEST 2: FIELD-BY-FIELD VALIDATION FOR ALL EMPLOYEES
    // =========================================================================

    test(
        'TC-AL01 - Field-by-Field Validation: All Employee Allocations DB vs UI',
        async ({ page }) => {
            test.setTimeout(1800000);

            // Clear results in case the test is rerun in the same worker.
            allValidationResults = [];

            const allEmployeeIds = Array.from(dbEmployeeMap.keys());

            const configuredLimit = Number.parseInt(
                process.env.EMPLOYEE_LIMIT ||
                String(allEmployeeIds.length),
                10
            );

            const limit =
                Number.isFinite(configuredLimit) && configuredLimit > 0
                    ? configuredLimit
                    : allEmployeeIds.length;

            const targetIds = allEmployeeIds.slice(0, limit);

            console.log(
                `\n[TC-AL01] Starting field-by-field validation for ` +
                `${targetIds.length} employees.`
            );

            await page.goto(ALLOCATION_URL, {
                waitUntil: 'domcontentloaded',
                timeout: 45000
            });

            await page.locator(
                'input[formcontrolname="employeeNameOrId"]'
            ).waitFor({
                state: 'visible',
                timeout: 30000
            });

            let processed = 0;

            for (const employeeId of targetIds) {
                processed++;

                const result = await validateEmployee(
                    page,
                    employeeId
                );

                if (!result) {
                    console.log(
                        `[${processed}/${targetIds.length}] ` +
                        `Employee ${employeeId}: NOT FOUND IN DB`
                    );

                    continue;
                }

                console.log(
                    `[${processed}/${targetIds.length}] ` +
                    `Employee ${employeeId}: ` +
                    (result.isMatch
                        ? 'PASS'
                        : `FAIL (${result.fieldMismatches.length} mismatches)`)
                );
            }

            const matchedCount = allValidationResults.filter(
                result => result.validationStatus === 'MATCH ✅'
            ).length;

            const failedCount =
                allValidationResults.length - matchedCount;

            const totalFieldMismatches = allValidationResults.reduce(
                (sum, result) =>
                    sum + (result.fieldMismatches || []).length,
                0
            );

            console.log('\n==============================================');
            console.log('FIELD-BY-FIELD VALIDATION COMPLETE');
            console.log('==============================================');
            console.log(`Employees processed: ${processed}/${targetIds.length}`);
            console.log(`Matched: ${matchedCount}`);
            console.log(`Failed: ${failedCount}`);
            console.log(`Total field mismatches: ${totalFieldMismatches}`);
            console.log(
                'HTML report: reports/employee_allocation_report.html'
            );
            console.log('==============================================\n');

            expect(processed).toBe(targetIds.length);

            // Construct detailed array of all failed employees and their exact field discrepancies & reasons
            const failureDetailsArray = allValidationResults
                .filter(result => result.validationStatus !== 'MATCH ✅')
                .map(result => ({
                    employeeId: result.employeeId,
                    employeeName: result.employeeName,
                    failingFields: Array.from(new Set((result.fieldMismatches || []).map(m => m.field))),
                    totalMismatches: (result.fieldMismatches || []).length,
                    discrepancies: (result.fieldMismatches || []).map(m => ({
                        field: m.field,
                        dbValue: m.dbValue,
                        uiValue: m.uiValue,
                        reason: `Field '${m.field}' value mismatch: DB has "${m.dbValue}" but UI displays "${m.uiValue}"`
                    }))
                }));

            expect(
                failureDetailsArray,
                `${failureDetailsArray.length} employee(s) failed field-by-field validation. Check reports/employee_allocation_report.html.`
            ).toHaveLength(0);
        }
    );
});