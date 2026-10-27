const { test, expect } = require('@playwright/test');

// Turn off trace recording to avoid Windows file-lock issues
test.use({ trace: 'off' });

const BASE_URL = 'http://localhost:4200';
const UPDATE_ROLE_URL = `${BASE_URL}/admin/update-role`;

const TEST_EMPLOYEE = process.env.TEST_EMPLOYEE_NAME || 'Yashwanth Sharma';
const TARGET_ROLE = process.env.TARGET_ROLE || 'User';

const ASSIGNABLE_ROLES = [
    'Admin',
    'Practice Lead',
    'Super User',
    'User',
    'OPS',
    'TA',
];

const FILTER_ROLES = [...ASSIGNABLE_ROLES, 'No Role'];

test.describe('SmartTracker Admin - Update Role', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(UPDATE_ROLE_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        await expect(
            page.getByText('Update Role', { exact: true }).first()
        ).toBeVisible({ timeout: 30000 });
    });

    // ---------------- LOCATORS ----------------

    const usersTab = (page) =>
        page.getByRole('button', { name: /users\s*&\s*roles/i });

    const updateTab = (page) =>
        page.getByRole('button', { name: /^update role$/i }).first();

    const userSearch = (page) =>
        page.getByPlaceholder('Search users...', { exact: true });

    const employeeSearch = (page) =>
        page.getByPlaceholder('Search employee by name...', {
            exact: true,
        });

    const userRows = (page) => page.locator('table tbody tr:not(:has(td.empty))');

    const userRow = (page, name) =>
        userRows(page).filter({ hasText: name });

    // Identify dropdowns by their option text
    const findSelectByOption = (page, optionText) =>
        page.locator('select').filter({
            has: page.locator('option', {
                hasText: new RegExp(optionText, 'i'),
            }),
        });

    const roleFilter = (page) =>
        findSelectByOption(page, 'All roles').first();

    const assignmentRole = (page) =>
        findSelectByOption(page, 'Select a Role').first();

    const openUsersTab = async (page) => {
        await usersTab(page).click();
        await expect(userSearch(page)).toBeVisible();
        await expect(roleFilter(page)).toBeVisible();
    };

    const openUpdateTab = async (page) => {
        await updateTab(page).click();
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(employeeSearch(page)).toBeVisible();
        await expect(assignmentRole(page)).toBeVisible();
    };

    const chooseFilter = async (page, role) => {
        const filter = roleFilter(page);

        if (role === 'All roles') {
            await filter.selectOption({ label: 'All roles' });
        } else {
            await filter.selectOption({ label: role });
        }
        await page.waitForTimeout(300);
    };

    const chooseAssignmentRole = async (page, role) => {
        await assignmentRole(page).selectOption({ label: role });
    };

    const selectEmployeeSuggestion = async (page, employeeName) => {
        const input = employeeSearch(page);
        await input.click();
        await input.fill(employeeName);
        await page.waitForTimeout(300);

        const suggestion = page.locator('#ac div', {
            hasText: new RegExp(employeeName, 'i'),
        }).first();

        await expect(suggestion).toBeVisible({ timeout: 10000 });
        await suggestion.click();
        await expect(page.locator('#sel')).toBeVisible();
    };

    const updateButton = (page) =>
        page.getByRole('button', { name: /^update role$/i }).last();

    const readCurrentRole = async (page, employeeName) => {
        await openUsersTab(page);
        await userSearch(page).fill(employeeName);
        await page.waitForTimeout(300);

        const row = userRow(page, employeeName);
        await expect(row).toHaveCount(1, { timeout: 15000 });

        return (await row.locator('td').nth(2).innerText()).trim();
    };

    const assignRole = async (page, employeeName, role) => {
        await openUpdateTab(page);
        await selectEmployeeSuggestion(page, employeeName);
        await chooseAssignmentRole(page, role);
        await updateButton(page).click();

        // Dismiss popup modal
        const okButton = page.locator('button.modal-btn', { hasText: 'OK' });
        try {
            await okButton.waitFor({ state: 'visible', timeout: 5000 });
            await okButton.click();
            await page.waitForTimeout(300);
        } catch (e) {
            // Modal may not appear or may close automatically
        }
    };

    const verifyRoleFilter = async (page, role) => {
        const rows = userRows(page);
        const count = await rows.count();

        if (count === 0) {
            await expect(page.locator('td.empty')).toContainText('No users found');
            return;
        }

        for (let i = 0; i < count; i++) {
            const actual = (
                await rows.nth(i).locator('td').nth(2).innerText()
            ).trim();

            expect(
                actual,
                `Row ${i + 1} should have role "${role}", got "${actual}".`
            ).toBe(role);
        }
    };

    // ---------------- USERS & ROLES TAB ----------------

    test('UR-01 - Users & Roles tab loads with expected columns', async ({
        page,
    }) => {
        await openUsersTab(page);

        await expect(page.locator('thead th', { hasText: /User Name/i })).toBeVisible();
        await expect(page.locator('thead th', { hasText: /Email \/ ID/i })).toBeVisible();
        await expect(page.locator('thead th', { hasText: /Current Role/i })).toBeVisible();
        await expect(page.locator('thead th', { hasText: /Action/i })).toBeVisible();

        await expect(userRows(page).first()).toBeVisible();
    });

    test('UR-02 - Each displayed user has a Change role action', async ({
        page,
    }) => {
        await openUsersTab(page);

        const firstRow = userRows(page).first();
        await expect(firstRow.getByText('Change role')).toBeVisible();
    });

    test('UR-03 - Search by full user name', async ({ page }) => {
        await openUsersTab(page);

        await userSearch(page).fill('Yashwanth Sharma');

        await expect(userRow(page, 'Yashwanth Sharma')).toBeVisible();
    });

    test('UR-04 - Search by partial user name', async ({ page }) => {
        await openUsersTab(page);

        await userSearch(page).fill('Yashwanth');

        await expect(userRow(page, 'Yashwanth Sharma')).toBeVisible();
    });

    test('UR-05 - Search by email', async ({ page }) => {
        await openUsersTab(page);

        await userSearch(page).fill('abhatt@relanto.ai');

        await expect(userRow(page, 'Abhijit Bhatt')).toBeVisible();
    });

    test('UR-06 - Nonexistent search returns no rows', async ({ page }) => {
        await openUsersTab(page);

        await userSearch(page).fill(`NoSuchUser_${Date.now()}`);

        await expect(userRows(page)).toHaveCount(0);
        await expect(page.locator('td.empty')).toContainText('No users found');
    });

    test('UR-07 - Clearing search restores rows', async ({ page }) => {
        await openUsersTab(page);

        await userSearch(page).fill(`NoSuchUser_${Date.now()}`);
        await expect(userRows(page)).toHaveCount(0);

        await userSearch(page).fill('');
        await expect(userRows(page).first()).toBeVisible();
    });

    test('UR-08 - Filter by every available role', async ({ page }) => {
        await openUsersTab(page);

        for (const role of FILTER_ROLES) {
            await chooseFilter(page, role);
            await verifyRoleFilter(page, role);
        }

        await chooseFilter(page, 'All roles');
        await expect(userRows(page).first()).toBeVisible();
    });

    test('UR-09 - Search by name while role filter is active', async ({
        page,
    }) => {
        await openUsersTab(page);

        await chooseFilter(page, 'Practice Lead');
        await userSearch(page).fill('Abhijit');

        const row = userRow(page, 'Abhijit Bhatt');
        await expect(row).toBeVisible();
        await expect(row.locator('td').nth(2)).toHaveText('Practice Lead');
    });

    test('UR-10 - Search by email while role filter is active', async ({
        page,
    }) => {
        await openUsersTab(page);

        await chooseFilter(page, 'Practice Lead');
        await userSearch(page).fill('abhatt@relanto.ai');

        const row = userRow(page, 'Abhijit Bhatt');
        await expect(row).toBeVisible();
        await expect(row.locator('td').nth(2)).toHaveText('Practice Lead');
    });

    test('UR-11 - No result when search and role filter do not match', async ({
        page,
    }) => {
        await openUsersTab(page);

        await chooseFilter(page, 'Admin');
        await userSearch(page).fill(`NoMatchingUser_${Date.now()}`);

        await expect(userRows(page)).toHaveCount(0);
        await expect(page.locator('td.empty')).toContainText('No users found');
    });

    test('UR-12 - Clear search while retaining the selected role filter', async ({
        page,
    }) => {
        await openUsersTab(page);

        await chooseFilter(page, 'Admin');
        await userSearch(page).fill('NoMatchingUser');
        await expect(userRows(page)).toHaveCount(0);

        await userSearch(page).fill('');
        await verifyRoleFilter(page, 'Admin');
    });

    test('UR-13 - Switch filters repeatedly without breaking the page', async ({
        page,
    }) => {
        await openUsersTab(page);

        for (const role of [
            'Admin',
            'User',
            'TA',
            'No Role',
            'Practice Lead',
            'All roles',
        ]) {
            await chooseFilter(page, role);
            await expect(roleFilter(page)).toBeVisible();
            await expect(userSearch(page)).toBeVisible();
        }
    });

    test('UR-14 - Whitespace-only search keeps controls usable', async ({
        page,
    }) => {
        await openUsersTab(page);

        await userSearch(page).fill('   ');

        await expect(userSearch(page)).toBeVisible();
        await expect(roleFilter(page)).toBeVisible();
    });

    // ---------------- UPDATE ROLE TAB ----------------

    test('UR-15 - Update Role form loads', async ({ page }) => {
        await openUpdateTab(page);

        await expect(employeeSearch(page)).toBeVisible();
        await expect(assignmentRole(page)).toBeVisible();
        await expect(updateButton(page)).toBeVisible();
    });

    test('UR-16 - Cannot submit without selecting an employee', async ({
        page,
    }) => {
        await openUpdateTab(page);
        await expect(updateButton(page)).toBeDisabled();
    });

    test('UR-17 - Nonexistent employee cannot be selected', async ({
        page,
    }) => {
        await openUpdateTab(page);

        const input = employeeSearch(page);
        await input.click();
        await input.fill(`NoEmployee_${Date.now()}`);
        await page.waitForTimeout(500);

        await expect(page.locator('#ac div')).toHaveCount(0);
        await expect(updateButton(page)).toBeDisabled();
    });

    test('UR-18 - Employee search accepts partial text', async ({ page }) => {
        await openUpdateTab(page);

        const input = employeeSearch(page);
        await input.click();
        await input.fill('Yashwanth');
        await page.waitForTimeout(300);

        const suggestion = page.locator('#ac div', {
            hasText: /Yashwanth Sharma/i,
        }).first();
        await expect(suggestion).toBeVisible({ timeout: 10000 });
    });

    test('UR-19 - Role dropdown has expected options', async ({ page }) => {
        await openUpdateTab(page);

        const options = (
            await assignmentRole(page).locator('option').allTextContents()
        ).map((option) => option.trim());

        expect(options).toContain('-- Select a Role --');

        for (const role of ASSIGNABLE_ROLES) {
            expect(options).toContain(role);
        }
    });

    test('UR-20 - Cannot submit without selecting a role', async ({ page }) => {
        test.skip(
            !TEST_EMPLOYEE,
            'Set TEST_EMPLOYEE_NAME to a dedicated test employee.'
        );

        await openUpdateTab(page);
        await selectEmployeeSuggestion(page, TEST_EMPLOYEE);

        await expect(updateButton(page)).toBeDisabled();
    });

    // ---------------- END-TO-END ROLE CHANGE ----------------

    test('UR-21 - Change role, verify it, and restore original role', async ({
        page,
    }) => {
        test.skip(
            !TEST_EMPLOYEE,
            'Set TEST_EMPLOYEE_NAME to a dedicated test employee.'
        );

        test.skip(
            !ASSIGNABLE_ROLES.includes(TARGET_ROLE),
            `TARGET_ROLE must be one of: ${ASSIGNABLE_ROLES.join(', ')}`
        );

        const originalRole = await readCurrentRole(page, TEST_EMPLOYEE);

        expect(
            [...ASSIGNABLE_ROLES, 'No Role']
        ).toContain(originalRole);

        test.skip(
            originalRole === 'No Role',
            'Select a test employee with an assignable original role so restoration is possible.'
        );

        const newRole =
            originalRole === TARGET_ROLE
                ? ASSIGNABLE_ROLES.find((role) => role !== originalRole)
                : TARGET_ROLE;

        try {
            await assignRole(page, TEST_EMPLOYEE, newRole);

            const updatedRole = await readCurrentRole(page, TEST_EMPLOYEE);
            expect(updatedRole).toBe(newRole);
        } finally {
            // Restore the original role even if the verification assertion fails.
            await assignRole(page, TEST_EMPLOYEE, originalRole);

            const restoredRole = await readCurrentRole(page, TEST_EMPLOYEE);
            expect(restoredRole).toBe(originalRole);
        }
    });

    test('UR-22 - Repeated tab switching leaves the form usable', async ({
        page,
    }) => {
        await openUsersTab(page);
        await openUpdateTab(page);
        await openUsersTab(page);
        await openUpdateTab(page);

        await expect(employeeSearch(page)).toBeVisible();
        await expect(assignmentRole(page)).toBeVisible();
    });
});
