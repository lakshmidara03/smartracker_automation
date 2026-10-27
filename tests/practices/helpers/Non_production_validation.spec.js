const { test, expect } = require('@playwright/test');
const { executeQuery } = require('../../../utils/dbUtils');

const query = `
SELECT
    'DEPARTMENT' AS type,
    psb.practice AS name,
    NULL AS parent_name,
    COUNT(DISTINCT psb.employee_id) AS employee_count
FROM hrportal.practice_sub_practice_band AS psb

INNER JOIN hrportal.emp_details AS e
    ON psb.employee_id = e.emp_id

WHERE
    psb.practice IN (
        'Academy',
        'Enabling Functions',
        'AI-First Lab'
    )
    AND e.is_deleted = 0

GROUP BY
    psb.practice

UNION ALL

SELECT
    'SUB_PRACTICE' AS type,
    psb.sub_practice AS name,
    psb.practice AS parent_name,
    COUNT(DISTINCT psb.employee_id) AS employee_count
FROM hrportal.practice_sub_practice_band AS psb

INNER JOIN hrportal.emp_details AS e
    ON psb.employee_id = e.emp_id

WHERE
    psb.practice = 'Enabling Functions'
    AND e.is_deleted = 0

GROUP BY
    psb.practice,
    psb.sub_practice

ORDER BY
    CASE
        WHEN type = 'DEPARTMENT' THEN 1
        ELSE 2
    END,

    CASE
        WHEN type = 'DEPARTMENT'
             AND name = 'Academy' THEN 1

        WHEN type = 'DEPARTMENT'
             AND name = 'Enabling Functions' THEN 2

        WHEN type = 'DEPARTMENT'
             AND name = 'AI-First Lab' THEN 3

        ELSE 4
    END,

    employee_count DESC;
`;


test.describe('Non-Production UI vs Database Validation', () => {

    test('Validate Non-Production departments and sub-practices', async ({ page }) => {

        // ================================
        // 1. Execute DB Query
        // ================================

        const dbData = await executeQuery(query);

        console.log('\n========== DATABASE DATA ==========');
        console.table(dbData);


        // ================================
        // 2. Separate Departments
        // ================================

        const dbDepartments = dbData.filter(
            row => row.type === 'DEPARTMENT'
        );

        const dbSubPractices = dbData.filter(
            row => row.type === 'SUB_PRACTICE'
        );


        console.log('\n========== DEPARTMENTS ==========');
        console.table(dbDepartments);

        console.log('\n========== SUB-PRACTICES ==========');
        console.table(dbSubPractices);


        // ================================
        // 3. Login
        // ================================

        // Add your login code here
        // Example:
        //
        // const practicesPage = new PracticesPage(page);
        // await practicesPage.login();


        // ================================
        // 4. Navigate to Practices
        // ================================

        // Add your navigation code here
        //
        // await practicesPage.navigateToPractices();


        // ================================
        // 5. UI Validation
        // ================================

        // We will add the actual UI selectors
        // after confirming the DB query works.


        // ================================
        // 6. Basic DB Validation
        // ================================

        expect(dbDepartments.length).toBe(3);

        expect(dbSubPractices.length).toBeGreaterThan(0);


        console.log('\nDatabase validation completed successfully.');
    });
});