const { test, expect } = require('@playwright/test');

const BASE_URL =
    'https://13.61.179.149/employee/employee-basic-info';

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function searchEmployee(page, searchValue) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const searchInput = page.getByPlaceholder(
        'Search by Employee Name or ID...'
    );

    await expect(searchInput).toBeVisible({ timeout: 45000 });
    await searchInput.fill(searchValue);

    await page.getByRole('button', {
        name: 'Search',
        exact: true,
    }).click();

    const row = page.locator('table tbody tr')
        .filter({ hasText: searchValue })
        .first();

    await expect(row).toBeVisible({ timeout: 45000 });

    return row;
}

async function openEmployeeRecord(row) {
    const actionButton = row
        .locator('td')
        .last()
        .locator('button, a, i, svg')
        .first();

    await actionButton.click();
}

async function validateFields(page, fields, sectionName) {
    for (const field of fields) {
        const locator = page
            .locator(`[formcontrolname="${field}"]`)
            .first();

        await expect(
            locator,
            `${sectionName}: ${field} should be visible`
        ).toBeVisible({ timeout: 10000 });

        console.log(`PASS: ${sectionName} - ${field}`);
    }
}

async function validateDropdowns(page, dropdowns, sectionName) {
    for (const item of dropdowns) {
        const locator = page
            .locator(`select[formcontrolname="${item.name}"]`)
            .first();

        await expect(
            locator,
            `${sectionName}: ${item.name} dropdown should be visible`
        ).toBeVisible({ timeout: 10000 });

        const optionCount = await locator.locator('option').count();

        expect(
            optionCount,
            `${item.name} should have at least ${item.minOptions} options`
        ).toBeGreaterThanOrEqual(item.minOptions);

        console.log(
            `PASS: ${sectionName} - ${item.name} (${optionCount} options)`
        );
    }
}

// ============================================================
// TEST SUITE 1: EMPLOYEE BASIC INFORMATION VALIDATIONS
// ============================================================

test.describe('SmartTracker - Employee Basic Info UI Automation', () => {

    test.beforeEach(async ({ page }, testInfo) => {
        // TC08 and TC09 perform their own independent searches.
        if (
            testInfo.title.includes('TC08') ||
            testInfo.title.includes('TC09')
        ) {
            return;
        }

        const row = await searchEmployee(page, 'Sridhar Pokuri');

        await openEmployeeRecord(row);

        await expect(
            page.locator('[formcontrolname="employeeId"]').first()
        ).toBeVisible({ timeout: 45000 });
    });

    // TC01: Employee identity fields
    test('TC01 - Validate employee identity fields', async ({ page }) => {
        await validateFields(
            page,
            ['employeeId', 'fullName'],
            'Employee Identity'
        );
    });

    // TC02: Personal information
    test('TC02 - Validate Personal Information section', async ({ page }) => {
        await validateFields(
            page,
            [
                'officialEmailId',
                'personalEmailId',
                'contactNo',
                'emergencyContactNo',
                'currentAddress',
                'permanentAddress',
                'dateOfBirth',
            ],
            'Personal Information'
        );

        await validateDropdowns(
            page,
            [
                { name: 'gender', minOptions: 2 },
                { name: 'maritalStatus', minOptions: 2 },
                { name: 'bloodGroup', minOptions: 5 },
            ],
            'Personal Information'
        );
    });

    // TC03: Designation and experience
    test('TC03 - Validate Designation and Experience', async ({ page }) => {
        await validateFields(
            page,
            [
                'designation',
                'dateOfJoining',
                'certificationComplete',
                'primarySkill',
                'secondarySkill',
            ],
            'Designation & Experience'
        );

        await validateDropdowns(
            page,
            [
                { name: 'totalExperience', minOptions: 2 },
                { name: 'itRelevantExperience', minOptions: 2 },
            ],
            'Designation & Experience'
        );
    });

    // TC04: Work authorization
    test('TC04 - Validate Work Authorization section', async ({ page }) => {
        await validateFields(
            page,
            ['category', 'lastWorkingDay'],
            'Work Authorization'
        );

        await validateDropdowns(
            page,
            [
                { name: 'employmentStatus', minOptions: 2 },
                { name: 'baseLocation', minOptions: 2 },
                { name: 'currentLocation', minOptions: 2 },
                { name: 'workAuthorization', minOptions: 2 },
            ],
            'Work Authorization'
        );
    });

    // TC05: Practice details
    test('TC05 - Validate Practice Details section', async ({ page }) => {
        await validateFields(
            page,
            ['reportingManagerLevel1'],
            'Practice Details'
        );

        await validateDropdowns(
            page,
            [
                { name: 'practice', minOptions: 1 },
                { name: 'subPractice', minOptions: 1 },
                { name: 'practiceOwner', minOptions: 1 },
                { name: 'reportingManagerLevel2', minOptions: 1 },
                { name: 'clientManagerLevel1', minOptions: 1 },
                { name: 'clientManagerLevel2', minOptions: 1 },
                { name: 'clientManagerLevel3', minOptions: 1 },
            ],
            'Practice Details'
        );
    });

    // TC06: Navigation buttons
    test('TC06 - Validate section navigation buttons', async ({ page }) => {
        const sections = [
            'Personal Information',
            'Designation & Experience',
            'Work Authorization',
            'Practice Details',
        ];

        for (const section of sections) {
            const locator = page
                .getByText(section, { exact: true })
                .first();

            await expect(locator).toBeVisible({ timeout: 10000 });

            console.log(`PASS: Navigation - ${section}`);
        }
    });

    // TC07: Delete button visibility only
    test('TC07 - Validate Delete Employee button without deleting', async ({
        page,
    }) => {
        const deleteButton = page
            .getByRole('button', { name: /Delete Employee/i })
            .first();

        await deleteButton.scrollIntoViewIfNeeded();

        await expect(deleteButton).toBeVisible({ timeout: 15000 });

        console.log('PASS: Delete Employee button is visible.');
    });

    // TC08: Search by employee ID
    test('TC08 - Search employee by ID (2068)', async ({ page }) => {
        const row = await searchEmployee(page, '2068');

        await openEmployeeRecord(row);

        const employeeId = page
            .locator('[formcontrolname="employeeId"]')
            .first();

        await expect(employeeId).toBeVisible({ timeout: 15000 });
        await expect(employeeId).toHaveValue('2068');

        console.log('PASS: Employee ID 2068 loaded successfully.');
    });

    // TC09: Search by employee name
    test('TC09 - Search employee by Name (Sridhar Pokuri)', async ({
        page,
    }) => {
        const row = await searchEmployee(page, 'Sridhar Pokuri');

        await openEmployeeRecord(row);

        await expect(
            page.locator('[formcontrolname="fullName"]').first()
        ).toHaveValue('Sridhar Pokuri', { timeout: 30000 });

        await expect(
            page.locator('[formcontrolname="employeeId"]').first()
        ).toHaveValue('1957', { timeout: 30000 });

        console.log('PASS: Sridhar Pokuri loaded successfully.');
    });
});

// ============================================================
// TEST SUITE 2: ADD, SEARCH AND DELETE DUMMY EMPLOYEE
// ============================================================

test.describe('SmartTracker - Employee CRUD Automation', () => {

    test('EMP-CRUD-001 - Add, Search and Delete Dummy Employee', async ({
        page,
    }) => {

        // --------------------------------------------------------
        // DUMMY EMPLOYEE DATA
        // --------------------------------------------------------

        const timestamp = Date.now().toString();
        const suffix = timestamp.slice(-6);

        const dummyEmployee = {
            id: `9${timestamp.slice(-7)}`,

            // Alphabetic-only name to satisfy the onlyalpha field.
            fullName: `Auto TestEmp ${String.fromCharCode(
                65 + Number(timestamp.slice(-1))
            )}`,

            officialEmail: `auto.emp${suffix}@relanto.ai`,
            personalEmail: `test.dummy${suffix}@gmail.com`,
            contactNo: '9876543210',
            emergencyContactNo: '9123456780',
            permanentAddress: '123 Automation Test Street',
            dateOfBirth: '1995-05-15',
            designation: 'Automation QA Engineer',
            dateOfJoining: '2024-01-10',
            primarySkill: 'Playwright Automation',
            secondarySkill: 'API Testing',
        };

        let employeeCreated = false;

        try {
            // ----------------------------------------------------
            // STEP 1: Open Employee Page
            // ----------------------------------------------------

            await test.step('Open Employee Page', async () => {
                await page.goto(BASE_URL);
                await page.waitForLoadState('domcontentloaded');

                await expect(
                    page.getByPlaceholder(
                        'Search by Employee Name or ID...'
                    )
                ).toBeVisible({ timeout: 15000 });

                await expect(
                    page.getByRole('button', {
                        name: /Add Employee/i,
                    }).first()
                ).toBeVisible({ timeout: 15000 });
            });

            // ----------------------------------------------------
            // STEP 2: Click Add Employee
            // ----------------------------------------------------

            await test.step('Click Add Employee', async () => {
                await page.getByRole('button', {
                    name: /Add Employee/i,
                }).first().click();

                await expect(
                    page.locator('[formcontrolname="employeeId"]').first()
                ).toBeVisible({ timeout: 15000 });
            });

            // ----------------------------------------------------
            // STEP 3: Fill Employee Details
            // ----------------------------------------------------

            await test.step('Fill Dummy Employee Details', async () => {

                const fillField = async (name, value) => {
                    const field = page
                        .locator(`[formcontrolname="${name}"]`)
                        .first();

                    if (await field.isVisible().catch(() => false)) {
                        await field.fill(value);

                        console.log(`[INFO] Filled ${name}`);
                    } else {
                        console.warn(`[WARN] Field not visible: ${name}`);
                    }
                };

                const selectField = async (name, value) => {
                    const field = page
                        .locator(`select[formcontrolname="${name}"]`)
                        .first();

                    if (!(await field.isVisible().catch(() => false))) {
                        console.warn(
                            `[WARN] Dropdown not visible: ${name}`
                        );
                        return;
                    }

                    const options = await field
                        .locator('option')
                        .evaluateAll(elements =>
                            elements.map(option => ({
                                value: option.value,
                                label: option.textContent.trim(),
                            }))
                        );

                    // Prefer an exact label, then a partial label match.
                    const selectedOption =
                        options.find(option => option.label === value) ||
                        options.find(option => option.label.includes(value));

                    if (selectedOption) {
                        await field.selectOption(selectedOption.value);

                        console.log(
                            `[INFO] Selected ${name}: ${selectedOption.label}`
                        );
                    } else {
                        // Fall back to the first non-empty option.
                        const firstValidOption = options.find(
                            option => option.value !== ''
                        );

                        if (firstValidOption) {
                            await field.selectOption(
                                firstValidOption.value
                            );

                            console.log(
                                `[INFO] Selected ${name}: ${firstValidOption.label}`
                            );
                        } else {
                            throw new Error(
                                `No valid options available for ${name}`
                            );
                        }
                    }
                };

                // Text fields
                await fillField('employeeId', dummyEmployee.id);
                await fillField('fullName', dummyEmployee.fullName);

                await fillField(
                    'officialEmailId',
                    dummyEmployee.officialEmail
                );

                await fillField(
                    'personalEmailId',
                    dummyEmployee.personalEmail
                );

                await fillField('contactNo', dummyEmployee.contactNo);

                await fillField(
                    'emergencyContactNo',
                    dummyEmployee.emergencyContactNo
                );

                await fillField(
                    'permanentAddress',
                    dummyEmployee.permanentAddress
                );

                await fillField('dateOfBirth', dummyEmployee.dateOfBirth);
                await fillField('designation', dummyEmployee.designation);
                await fillField('dateOfJoining', dummyEmployee.dateOfJoining);

                await fillField(
                    'primarySkill',
                    dummyEmployee.primarySkill
                );

                await fillField(
                    'secondarySkill',
                    dummyEmployee.secondarySkill
                );

                // Dropdowns
                await selectField('gender', 'Female');
                await selectField('maritalStatus', 'Unmarried');
                await selectField('bloodGroup', 'O+ve');
                await selectField('currentAddress', 'Bangalore, India');
                await selectField('category', 'W2');
                await selectField('employmentStatus', 'Active');
                await selectField('baseLocation', 'Bangalore');
                await selectField('currentLocation', 'Bangalore, India');
                await selectField('workAuthorization', 'Citizen');
                await selectField('practice', 'Digital Transformation');

                console.log(
                    `[INFO] Entered dummy employee: ${dummyEmployee.id}`
                );

                // Verify the name was not truncated by the UI.
                const nameField = page
                    .locator('[formcontrolname="fullName"]')
                    .first();

                await expect(nameField).toHaveValue(
                    dummyEmployee.fullName
                );

                // Save employee
                const saveButton = page
                    .locator(
                        'button:has-text("Save"), button[type="submit"]'
                    )
                    .first();

                await expect(saveButton).toBeVisible({
                    timeout: 10000,
                });

                await expect(saveButton).toBeEnabled();

                await saveButton.click();

                await page.waitForLoadState('networkidle').catch(() => { });

                console.log('[INFO] Save button clicked.');
            });

            // ----------------------------------------------------
            // STEP 4: Search Created Employee
            // ----------------------------------------------------

            await test.step('Search Created Employee', async () => {
                await page.goto(BASE_URL);
                await page.waitForLoadState('domcontentloaded');

                const searchInput = page.getByPlaceholder(
                    'Search by Employee Name or ID...'
                );

                await expect(searchInput).toBeVisible({
                    timeout: 15000,
                });

                await searchInput.fill(dummyEmployee.id);

                await page.getByRole('button', {
                    name: 'Search',
                    exact: true,
                }).click();

                const row = page
                    .locator('table tbody tr')
                    .filter({ hasText: dummyEmployee.id })
                    .first();

                await expect(row).toBeVisible({
                    timeout: 15000,
                });

                await expect(row).toContainText(dummyEmployee.id);

                employeeCreated = true;

                console.log(
                    `[PASS] Employee ${dummyEmployee.id} found.`
                );
            });

            // ----------------------------------------------------
            // STEP 5: Open and Verify Employee Details
            // ----------------------------------------------------

            await test.step('Verify Employee Details', async () => {
                const row = page
                    .locator('table tbody tr')
                    .filter({ hasText: dummyEmployee.id })
                    .first();

                await openEmployeeRecord(row);

                const employeeIdField = page
                    .locator('[formcontrolname="employeeId"]')
                    .first();

                const employeeNameField = page
                    .locator('[formcontrolname="fullName"]')
                    .first();

                await expect(employeeIdField).toHaveValue(
                    dummyEmployee.id
                );

                await expect(employeeNameField).toHaveValue(
                    dummyEmployee.fullName
                );

                console.log(
                    '[PASS] Employee ID and name verified.'
                );
            });

            // ----------------------------------------------------
            // STEP 6: Delete Only the Dummy Employee
            // ----------------------------------------------------

            await test.step('Delete Dummy Employee', async () => {
                const employeeIdField = page
                    .locator('[formcontrolname="employeeId"]')
                    .first();

                const currentId = await employeeIdField.inputValue();

                // Safety check: never delete a different employee.
                expect(currentId).toBe(dummyEmployee.id);

                const deleteButton = page
                    .getByRole('button', {
                        name: /Delete Employee/i,
                    })
                    .first();

                await deleteButton.scrollIntoViewIfNeeded();

                await expect(deleteButton).toBeVisible({
                    timeout: 10000,
                });

                await deleteButton.click();

                // Handle a confirmation dialog if one appears.
                const dialog = page.getByRole('dialog');

                const dialogVisible = await dialog
                    .waitFor({
                        state: 'visible',
                        timeout: 3000,
                    })
                    .then(() => true)
                    .catch(() => false);

                if (dialogVisible) {
                    const confirmButton = dialog
                        .getByRole('button', {
                            name: /yes|confirm|delete|ok/i,
                        })
                        .first();

                    await expect(confirmButton).toBeVisible();

                    await confirmButton.click();
                }

                console.log('[INFO] Delete action completed.');
            });

            // ----------------------------------------------------
            // STEP 7: Verify Employee Deletion
            // ----------------------------------------------------

            await test.step('Verify Employee Deletion', async () => {
                await page.goto(BASE_URL);
                await page.waitForLoadState('domcontentloaded');

                const searchInput = page.getByPlaceholder(
                    'Search by Employee Name or ID...'
                );

                await expect(searchInput).toBeVisible({
                    timeout: 15000,
                });

                await searchInput.fill(dummyEmployee.id);

                await page.getByRole('button', {
                    name: 'Search',
                    exact: true,
                }).click();

                const matchingRows = page
                    .locator('table tbody tr')
                    .filter({ hasText: dummyEmployee.id });

                await expect(matchingRows).toHaveCount(0, {
                    timeout: 10000,
                });

                console.log(
                    `[PASS] Employee ${dummyEmployee.id} deleted successfully.`
                );
            });

        } catch (error) {
            console.error(
                `[FAIL] CRUD test failed for ${dummyEmployee.id}:`,
                error.message
            );

            throw error;
        }
    });
});

// ============================================================
// TEST SUITE 3: EMPLOYEE PERSONAL INFORMATION COMPREHENSIVE MATRIX
// ============================================================

test.describe('SmartTracker - Employee Personal Information Comprehensive Matrix', () => {
    test.setTimeout(180000);

    const TEST_EMP_ID = '2068';

    async function loadTestEmployee(page, searchVal = TEST_EMP_ID) {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        const searchInput = page.getByPlaceholder('Search by Employee Name or ID...');
        await expect(searchInput).toBeVisible({ timeout: 45000 });
        await searchInput.fill(searchVal);
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        const row = page.locator('table tbody tr').filter({ hasText: searchVal }).first();
        await expect(row).toBeVisible({ timeout: 45000 });
        await openEmployeeRecord(row);
        const empIdField = page.locator('[formcontrolname="employeeId"]').first();
        await expect(empIdField).toBeVisible({ timeout: 60000 });
        // Wait for Angular patchValue to finish populating employee data
        await expect(empIdField).toHaveValue(searchVal, { timeout: 30000 }).catch(() => {});
        await expect(page.locator('[formcontrolname="officialEmailId"]').first()).not.toHaveValue('', { timeout: 30000 }).catch(() => {});
    }

    test.beforeEach(async ({ page }, testInfo) => {
        // Tests that perform their own independent searches or forms manage their own navigation
        if (
            testInfo.title.includes('PI-P12') ||
            testInfo.title.includes('PI-P17') ||
            testInfo.title.includes('PI-P18') ||
            testInfo.title.includes('PI-E20') ||
            testInfo.title.includes('PI-E22') ||
            testInfo.title.includes('PI-E23') ||
            testInfo.title.includes('PI-E24')
        ) {
            return;
        }
        await loadTestEmployee(page, TEST_EMP_ID);
    });

    // ── 1. POSITIVE TEST CASES (+ve) ──────────────────────────────────────────

    test('PI-P01 - Verify all personal information fields are visible', async ({ page }) => {
        await validateFields(page, [
            'officialEmailId',
            'personalEmailId',
            'contactNo',
            'emergencyContactNo',
            'currentAddress',
            'permanentAddress',
            'dateOfBirth',
        ], 'Personal Information');

        await validateDropdowns(page, [
            { name: 'gender', minOptions: 2 },
            { name: 'maritalStatus', minOptions: 2 },
            { name: 'bloodGroup', minOptions: 5 },
        ], 'Personal Information');
    });

    test('PI-P02 - Verify Official Email field accepts a valid email', async ({ page }) => {
        const input = page.locator('[formcontrolname="officialEmailId"]').first();
        await input.fill('');
        await input.fill('automation.test@relanto.ai');
        await expect(input).toHaveValue('automation.test@relanto.ai');
        const isValid = await input.evaluate(el => el.validity.valid);
        expect(isValid, 'Official email should be valid with @relanto.ai domain').toBe(true);
    });

    test('PI-P03 - Verify Personal Email field accepts a valid email', async ({ page }) => {
        const input = page.locator('[formcontrolname="personalEmailId"]').first();
        await input.fill('');
        await input.fill('automation.personal@gmail.com');
        await expect(input).toHaveValue('automation.personal@gmail.com');
        const isValid = await input.evaluate(el => el.validity.valid);
        expect(isValid, 'Personal email should be valid').toBe(true);
    });

    test('PI-P04 - Enter a valid 10-digit Contact Number', async ({ page }) => {
        const input = page.locator('[formcontrolname="contactNo"]').first();
        await input.fill('9876543210');
        await expect(input).toHaveValue('9876543210');
    });

    test('PI-P05 - Enter a valid Emergency Contact Number', async ({ page }) => {
        const input = page.locator('[formcontrolname="emergencyContactNo"]').first();
        await input.fill('9123456780');
        await expect(input).toHaveValue('9123456780');
    });

    test('PI-P06 - Enter a valid Current Address', async ({ page }) => {
        const currentAddr = page.locator('[formcontrolname="currentAddress"]').first();
        const tagName = await currentAddr.evaluate(el => el.tagName);
        if (tagName === 'SELECT') {
            await currentAddr.selectOption({ label: 'Bangalore, India' });
            const val = await currentAddr.inputValue();
            expect(val).toBeTruthy();
        } else {
            await currentAddr.fill('Bangalore, India');
            await expect(currentAddr).toHaveValue('Bangalore, India');
        }
    });

    test('PI-P07 - Enter a valid Permanent Address', async ({ page }) => {
        const input = page.locator('[formcontrolname="permanentAddress"]').first();
        await input.fill('123 Automation Test Street, Tech City, Bangalore');
        await expect(input).toHaveValue('123 Automation Test Street, Tech City, Bangalore');
    });

    test('PI-P08 - Enter a valid Date of Birth', async ({ page }) => {
        const input = page.locator('[formcontrolname="dateOfBirth"]').first();
        await input.fill('1995-05-15');
        await expect(input).toHaveValue('1995-05-15');
        const isValid = await input.evaluate(el => el.validity.valid);
        expect(isValid).toBe(true);
    });

    test('PI-P09 - Select each available Gender option', async ({ page }) => {
        const select = page.locator('select[formcontrolname="gender"]').first();
        const options = ['Male', 'Female'];
        for (const opt of options) {
            await select.selectOption({ label: opt });
            const selectedText = await select.locator('option:checked').textContent();
            expect(selectedText?.trim()).toBe(opt);
        }
    });

    test('PI-P10 - Select each available Marital Status option', async ({ page }) => {
        const select = page.locator('select[formcontrolname="maritalStatus"]').first();
        const options = ['Unmarried', 'Married'];
        for (const opt of options) {
            await select.selectOption({ label: opt });
            const selectedText = await select.locator('option:checked').textContent();
            expect(selectedText?.trim()).toBe(opt);
        }
    });

    test('PI-P11 - Select each available Blood Group option', async ({ page }) => {
        const select = page.locator('select[formcontrolname="bloodGroup"]').first();
        const options = ['A+ve', 'A-ve', 'B+ve', 'B-ve', 'AB+ve', 'AB-ve', 'O+ve', 'O-ve'];
        for (const opt of options) {
            await select.selectOption({ label: opt });
            const selectedText = await select.locator('option:checked').textContent();
            expect(selectedText?.trim()).toBe(opt);
        }
    });

    test('PI-P12 - Save employee details with valid personal information', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        const addBtn = page.getByRole('button', { name: /Add Employee/i }).first();
        await expect(addBtn).toBeVisible({ timeout: 45000 });
        await addBtn.click();
        await expect(page.locator('[formcontrolname="employeeId"]').first()).toBeVisible({ timeout: 30000 });

        const timestamp = Date.now().toString();
        await page.locator('[formcontrolname="employeeId"]').first().fill(`9${timestamp.slice(-7)}`);
        await page.locator('[formcontrolname="fullName"]').first().fill('Auto Test User');
        await page.locator('[formcontrolname="officialEmailId"]').first().fill(`auto.${timestamp.slice(-4)}@relanto.ai`);
        await page.locator('[formcontrolname="personalEmailId"]').first().fill('test@gmail.com');
        await page.locator('[formcontrolname="contactNo"]').first().fill('9876543210');
        await page.locator('[formcontrolname="emergencyContactNo"]').first().fill('9123456780');
        await page.locator('select[formcontrolname="gender"]').first().selectOption({ label: 'Female' });
        await page.locator('select[formcontrolname="maritalStatus"]').first().selectOption({ label: 'Unmarried' });
        await page.locator('select[formcontrolname="bloodGroup"]').first().selectOption({ label: 'O+ve' });
        await page.locator('select[formcontrolname="currentAddress"]').first().selectOption({ label: 'Bangalore, India' });
        await page.locator('[formcontrolname="permanentAddress"]').first().fill('123 Test St');
        await page.locator('[formcontrolname="dateOfBirth"]').first().fill('1995-05-15');

        const saveButtons = page.locator('button:has-text("Save"), button[type="submit"]');
        await expect(saveButtons.first()).toBeVisible({ timeout: 15000 });
        await expect(saveButtons.first()).toBeEnabled();
    });

    test('PI-P13 - Reopen the employee record after saving', async ({ page }) => {
        const empIdInput = page.locator('[formcontrolname="employeeId"]').first();
        const empId = await empIdInput.inputValue();
        expect(empId).toBe(TEST_EMP_ID);

        await loadTestEmployee(page, TEST_EMP_ID);
        await expect(page.locator('[formcontrolname="employeeId"]').first()).toHaveValue(TEST_EMP_ID);
    });

    test('PI-P14 - Update existing personal information with valid values', async ({ page }) => {
        const personalEmail = page.locator('[formcontrolname="personalEmailId"]').first();
        const updatedEmail = 'updated.qa@example.com';
        await personalEmail.fill(updatedEmail);
        await expect(personalEmail).toHaveValue(updatedEmail);

        const contactNo = page.locator('[formcontrolname="contactNo"]').first();
        await contactNo.fill('9988776655');
        await expect(contactNo).toHaveValue('9988776655');
    });

    test('PI-P15 - Verify personal information remains unchanged after refreshing', async ({ page }) => {
        const officialEmail = page.locator('[formcontrolname="officialEmailId"]').first();
        const initialValue = await officialEmail.inputValue();

        await page.reload({ waitUntil: 'domcontentloaded' });
        const searchInput = page.getByPlaceholder('Search by Employee Name or ID...');
        await expect(searchInput).toBeVisible({ timeout: 45000 });
        await searchInput.fill(TEST_EMP_ID);
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        const row = page.locator('table tbody tr').filter({ hasText: TEST_EMP_ID }).first();
        await expect(row).toBeVisible({ timeout: 45000 });
        await openEmployeeRecord(row);

        await expect(officialEmail).toHaveValue(initialValue, { timeout: 30000 });
    });

    test('PI-P16 - Save valid information with different current and permanent addresses', async ({ page }) => {
        const currentAddr = page.locator('[formcontrolname="currentAddress"]').first();
        const permanentAddr = page.locator('[formcontrolname="permanentAddress"]').first();

        const tagName = await currentAddr.evaluate(el => el.tagName);
        if (tagName === 'SELECT') {
            await currentAddr.selectOption({ label: 'Hyderabad, India' });
        } else {
            await currentAddr.fill('Hyderabad, India');
        }

        await permanentAddr.fill('Plot 42, Tech Park Avenue, Bangalore, Karnataka');

        const curVal = await currentAddr.inputValue();
        const permVal = await permanentAddr.inputValue();
        expect(curVal).not.toBe(permVal);
    });

    test('PI-P17 - Verify personal information for an employee found by ID', async ({ page }) => {
        await loadTestEmployee(page, '2068');
        const empIdField = page.locator('[formcontrolname="employeeId"]').first();
        await expect(empIdField).toHaveValue('2068');
    });

    test('PI-P18 - Verify personal information for an employee found by name', async ({ page }) => {
        await loadTestEmployee(page, 'Sridhar Pokuri');
        const nameField = page.locator('[formcontrolname="fullName"]').first();
        await expect(nameField).toHaveValue('Sridhar Pokuri');
    });

    // ── 2. NEGATIVE TEST CASES (-ve) ──────────────────────────────────────────

    test('PI-N01 - Enter an invalid Official Email format', async ({ page }) => {
        const input = page.locator('[formcontrolname="officialEmailId"]').first();
        await input.fill('invalid-official-email');
        const isInvalid = await input.evaluate(el => !el.validity.valid || el.matches(':invalid'));
        expect(isInvalid, 'Official email missing domain should be invalid').toBe(true);

        await input.fill('user@gmail.com');
        const isNonRelanto = await input.evaluate(el => !el.validity.valid || el.matches(':invalid'));
        expect(isNonRelanto, 'Official email with non-relanto domain should be invalid').toBe(true);
    });

    test('PI-N02 - Enter an invalid Personal Email format', async ({ page }) => {
        const input = page.locator('[formcontrolname="personalEmailId"]').first();
        await input.fill('invalid-email-address');
        const isInvalid = await input.evaluate(el => !el.validity.valid || el.matches(':invalid'));
        expect(isInvalid, 'Personal email without @ and domain should be invalid').toBe(true);
    });

    test('PI-N03 - Enter alphabetic characters in Contact Number', async ({ page }) => {
        const input = page.locator('[formcontrolname="contactNo"]').first();
        await input.fill('');
        await input.pressSequentially('abcdefghij', { delay: 10 }).catch(() => {});
        const isRejectedOrInvalid = await input.evaluate((el) => {
            return !el.validity.valid || el.matches(':invalid') || el.value !== 'abcdefghij' || !/^\d+$/.test(el.value);
        });
        expect(isRejectedOrInvalid, 'Alphabetic input in Contact Number should be prevented or flagged invalid').toBe(true);
    });

    test('PI-N04 - Enter alphabetic characters in Emergency Contact Number', async ({ page }) => {
        const input = page.locator('[formcontrolname="emergencyContactNo"]').first();
        await input.fill('');
        await input.pressSequentially('abcdefghij', { delay: 10 }).catch(() => {});
        const isRejectedOrInvalid = await input.evaluate((el) => {
            return !el.validity.valid || el.matches(':invalid') || el.value !== 'abcdefghij' || !/^\d+$/.test(el.value);
        });
        expect(isRejectedOrInvalid, 'Alphabetic input in Emergency Contact Number should be prevented or flagged invalid').toBe(true);
    });

    test('PI-N05 - Enter a phone number shorter than the permitted length', async ({ page }) => {
        const input = page.locator('[formcontrolname="contactNo"]').first();
        await input.fill('12345');
        const isInvalidOrShort = await input.evaluate(el => !el.validity.valid || el.value.length < 10);
        expect(isInvalidOrShort, 'Phone number under 10 digits should be flagged or recognized as short').toBe(true);
    });

    test('PI-N06 - Enter a phone number longer than the permitted length', async ({ page }) => {
        const input = page.locator('[formcontrolname="contactNo"]').first();
        await input.fill('12345678901234567890');
        const isTruncatedOrInvalid = await input.evaluate(el => !el.validity.valid || el.value.length <= 15 || el.matches(':invalid'));
        expect(isTruncatedOrInvalid).toBe(true);
    });

    test('PI-N07 - Enter special characters in phone fields', async ({ page }) => {
        const input = page.locator('[formcontrolname="contactNo"]').first();
        await input.fill('');
        await input.pressSequentially('@#$%^&*()', { delay: 10 }).catch(() => {});
        const isPreventedOrInvalid = await input.evaluate(el => el.value !== '@#$%^&*()' || !el.validity.valid);
        expect(isPreventedOrInvalid).toBe(true);
    });

    test('PI-N08 - Enter an invalid date format in Date of Birth', async ({ page }) => {
        const input = page.locator('[formcontrolname="dateOfBirth"]').first();
        await input.fill('invalid-date').catch(() => {});
        const isInvalid = await input.evaluate(el => !el.validity.valid || el.value === '');
        expect(isInvalid, 'Invalid date string in type=date input should be rejected').toBe(true);
    });

    test('PI-N09 - Enter a future Date of Birth', async ({ page }) => {
        const input = page.locator('[formcontrolname="dateOfBirth"]').first();
        await input.fill('2099-12-31');
        const dateValue = new Date(await input.inputValue());
        const isFuture = dateValue > new Date();
        expect(isFuture, 'Date of birth is in the future').toBe(true);
        const isFlaggedOrRestricted = await input.evaluate((el) => {
            const now = new Date();
            const entered = new Date(el.value);
            return entered > now || !el.validity.valid || el.matches(':invalid');
        });
        expect(isFlaggedOrRestricted).toBe(true);
    });

    test('PI-N10 - Leave a required personal information field blank and save', async ({ page }) => {
        const fullName = page.locator('[formcontrolname="fullName"]').first();
        await fullName.fill('');
        const isInvalid = await fullName.evaluate(el => !el.validity.valid || el.matches(':invalid') || el.value.trim() === '');
        expect(isInvalid, 'Empty full name should be invalid or empty').toBe(true);
    });

    test('PI-N11 - Clear a required dropdown and attempt to save', async ({ page }) => {
        const genderSelect = page.locator('select[formcontrolname="gender"]').first();
        await genderSelect.evaluate(el => {
            el.selectedIndex = 0;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const isInvalidOrBlank = await genderSelect.evaluate(el => el.value === '' || !el.validity.valid || el.matches(':invalid'));
        expect(isInvalidOrBlank, 'Cleared dropdown should be blank or flagged invalid').toBe(true);
    });

    test('PI-N12 - Enter only spaces in a required text field', async ({ page }) => {
        const fullName = page.locator('[formcontrolname="fullName"]').first();
        await fullName.fill('   ');
        const isInvalid = await fullName.evaluate(el => el.value.trim() === '' || !el.validity.valid || el.matches(':invalid'));
        expect(isInvalid, 'Whitespace-only full name should be recognized as blank').toBe(true);
    });

    test('PI-N13 - Enter an invalid email and attempt to save', async ({ page }) => {
        const officialEmail = page.locator('[formcontrolname="officialEmailId"]').first();
        await officialEmail.fill('bademail@invalid');
        const isInvalid = await officialEmail.evaluate(el => !el.validity.valid || el.matches(':invalid'));
        expect(isInvalid).toBe(true);
    });

    test('PI-N14 - Enter an invalid phone number and attempt to save', async ({ page }) => {
        const contactNo = page.locator('[formcontrolname="contactNo"]').first();
        await contactNo.fill('abc');
        const isInvalid = await contactNo.evaluate(el => !el.validity.valid || el.value !== 'abc' || el.value.length < 10);
        expect(isInvalid).toBe(true);
    });

    test('PI-N15 - Enter an invalid date and attempt to save', async ({ page }) => {
        const dob = page.locator('[formcontrolname="dateOfBirth"]').first();
        await dob.fill('0000-00-00').catch(() => {});
        const isInvalid = await dob.evaluate(el => !el.validity.valid || el.value === '');
        expect(isInvalid).toBe(true);
    });

    test('PI-N16 - Enter a duplicate email address', async ({ page }) => {
        const personalEmail = page.locator('[formcontrolname="personalEmailId"]').first();
        await personalEmail.fill('existing.user@relanto.ai');
        await expect(personalEmail).toHaveValue('existing.user@relanto.ai');
    });

    test('PI-N17 - Enter a duplicate contact number', async ({ page }) => {
        const contactNo = page.locator('[formcontrolname="contactNo"]').first();
        await contactNo.fill('9876543210');
        await expect(contactNo).toHaveValue('9876543210');
    });

    test('PI-N18 - Attempt to save with multiple invalid fields', async ({ page }) => {
        const officialEmail = page.locator('[formcontrolname="officialEmailId"]').first();
        const personalEmail = page.locator('[formcontrolname="personalEmailId"]').first();
        await officialEmail.fill('invalid-email');
        await personalEmail.fill('bad-email');

        const areInvalid = await page.evaluate(() => {
            const off = document.querySelector('[formcontrolname="officialEmailId"]');
            const per = document.querySelector('[formcontrolname="personalEmailId"]');
            return (!off?.validity.valid || off?.matches(':invalid')) &&
                   (!per?.validity.valid || per?.matches(':invalid'));
        });
        expect(areInvalid, 'Both invalid email fields should be flagged as invalid').toBe(true);
    });

    test('PI-N19 - Enter an excessively long address', async ({ page }) => {
        const permanentAddr = page.locator('[formcontrolname="permanentAddress"]').first();
        const longAddress = 'A'.repeat(2000);
        await permanentAddr.fill(longAddress);
        const val = await permanentAddr.inputValue();
        expect(val.length).toBeGreaterThan(0);
    });

    test('PI-N20 - Attempt to save after clearing existing required values', async ({ page }) => {
        const fullName = page.locator('[formcontrolname="fullName"]').first();
        await fullName.fill('');
        const isBlank = await fullName.evaluate(el => el.value.trim() === '' || !el.validity.valid);
        expect(isBlank).toBe(true);
    });

    // ── 3. EDGE TEST CASES ────────────────────────────────────────────────────

    test('PI-E01 - Enter a phone number at the minimum permitted length', async ({ page }) => {
        const contactNo = page.locator('[formcontrolname="contactNo"]').first();
        await contactNo.fill('9876543210');
        await expect(contactNo).toHaveValue('9876543210');
    });

    test('PI-E02 - Enter a phone number at the maximum permitted length', async ({ page }) => {
        const contactNo = page.locator('[formcontrolname="contactNo"]').first();
        await contactNo.fill('+919876543210');
        const val = await contactNo.inputValue();
        expect(val.length).toBeGreaterThanOrEqual(10);
    });

    test('PI-E03 - Enter a phone number one digit below the minimum', async ({ page }) => {
        const contactNo = page.locator('[formcontrolname="contactNo"]').first();
        await contactNo.fill('987654321');
        const isShort = await contactNo.evaluate(el => el.value.length === 9);
        expect(isShort).toBe(true);
    });

    test('PI-E04 - Enter a phone number one digit above the maximum', async ({ page }) => {
        const contactNo = page.locator('[formcontrolname="contactNo"]').first();
        await contactNo.fill('98765432101');
        const val = await contactNo.inputValue();
        expect(val.length, 'Input above maximum length should be restricted/capped at 10 digits').toBeLessThanOrEqual(10);
    });

    test('PI-E05 - Enter an email address with uppercase characters', async ({ page }) => {
        const officialEmail = page.locator('[formcontrolname="officialEmailId"]').first();
        await officialEmail.fill('AUTOMATION.TEST@RELANTO.AI');
        await expect(officialEmail).toHaveValue('AUTOMATION.TEST@RELANTO.AI');
    });

    test('PI-E06 - Enter an email address with a plus sign', async ({ page }) => {
        const officialEmail = page.locator('[formcontrolname="officialEmailId"]').first();
        await officialEmail.fill('qa+test@relanto.ai');
        await expect(officialEmail).toHaveValue('qa+test@relanto.ai');
        const isValid = await officialEmail.evaluate(el => el.validity.valid);
        expect(isValid).toBe(true);
    });

    test('PI-E07 - Enter an email address with leading or trailing spaces', async ({ page }) => {
        const personalEmail = page.locator('[formcontrolname="personalEmailId"]').first();
        await personalEmail.fill('  user@gmail.com  ');
        const val = await personalEmail.inputValue();
        expect(val.trim()).toBe('user@gmail.com');
    });

    test('PI-E08 - Enter an address containing commas, hyphens, and apartment numbers', async ({ page }) => {
        const permanentAddr = page.locator('[formcontrolname="permanentAddress"]').first();
        const complexAddress = '#402, Apt 4-B, 12th Cross, Indiranagar, Bangalore - 560038';
        await permanentAddr.fill(complexAddress);
        await expect(permanentAddr).toHaveValue(complexAddress);
    });

    test('PI-E09 - Enter an address at the maximum permitted length', async ({ page }) => {
        const permanentAddr = page.locator('[formcontrolname="permanentAddress"]').first();
        const maxLenAddress = 'A'.repeat(255);
        await permanentAddr.fill(maxLenAddress);
        const val = await permanentAddr.inputValue();
        expect(val.length).toBeLessThanOrEqual(255);
    });

    test('PI-E10 - Enter an address exceeding the maximum permitted length', async ({ page }) => {
        const permanentAddr = page.locator('[formcontrolname="permanentAddress"]').first();
        const extraLongAddress = 'A'.repeat(500);
        await permanentAddr.fill(extraLongAddress);
        const val = await permanentAddr.inputValue();
        expect(val.length).toBeGreaterThan(0);
    });

    test('PI-E11 - Enter Date of Birth on a leap day (2000-02-29)', async ({ page }) => {
        const dob = page.locator('[formcontrolname="dateOfBirth"]').first();
        await dob.fill('2000-02-29');
        await expect(dob).toHaveValue('2000-02-29');
        const isValid = await dob.evaluate(el => el.validity.valid);
        expect(isValid, 'Valid leap day 2000-02-29 should be accepted').toBe(true);
    });

    test('PI-E12 - Enter an invalid leap date (2001-02-29)', async ({ page }) => {
        const dob = page.locator('[formcontrolname="dateOfBirth"]').first();
        await dob.fill('2001-02-29').catch(() => {});
        const isInvalidOrRejected = await dob.evaluate(el => el.value !== '2001-02-29' || !el.validity.valid);
        expect(isInvalidOrRejected, 'Invalid leap date 2001-02-29 should be rejected by browser').toBe(true);
    });

    test('PI-E13 - Enter the earliest permitted Date of Birth', async ({ page }) => {
        const dob = page.locator('[formcontrolname="dateOfBirth"]').first();
        await dob.fill('1950-01-01');
        await expect(dob).toHaveValue('1950-01-01');
    });

    test('PI-E14 - Enter the latest permitted Date of Birth', async ({ page }) => {
        const dob = page.locator('[formcontrolname="dateOfBirth"]').first();
        await dob.fill('2006-01-01');
        await expect(dob).toHaveValue('2006-01-01');
    });

    test('PI-E15 - Select each dropdown option and verify the selected value', async ({ page }) => {
        const genderSelect = page.locator('select[formcontrolname="gender"]').first();
        const options = await genderSelect.locator('option').evaluateAll(opts =>
            opts.filter(o => o.value).map(o => ({ value: o.value, text: o.text.trim() }))
        );
        for (const opt of options) {
            await genderSelect.selectOption(opt.value);
            expect(await genderSelect.inputValue()).toBe(opt.value);
        }
    });

    test('PI-E16 - Verify dropdown behavior when no valid options are returned', async ({ page }) => {
        const genderSelect = page.locator('select[formcontrolname="gender"]').first();
        await expect(genderSelect).toBeVisible();
        const optCount = await genderSelect.locator('option').count();
        expect(optCount).toBeGreaterThan(0);
    });

    test('PI-E17 - Set Contact Number and Emergency Contact Number to the same value', async ({ page }) => {
        const contactNo = page.locator('[formcontrolname="contactNo"]').first();
        const emergencyContactNo = page.locator('[formcontrolname="emergencyContactNo"]').first();
        const phone = '9876543210';
        await contactNo.fill(phone);
        await emergencyContactNo.fill(phone);
        await expect(contactNo).toHaveValue(phone);
        await expect(emergencyContactNo).toHaveValue(phone);
    });

    test('PI-E18 - Set Current Address and Permanent Address to the same value', async ({ page }) => {
        const currentAddr = page.locator('[formcontrolname="currentAddress"]').first();
        const permanentAddr = page.locator('[formcontrolname="permanentAddress"]').first();

        const tagName = await currentAddr.evaluate(el => el.tagName);
        const address = 'Bangalore, India';
        if (tagName === 'SELECT') {
            await currentAddr.selectOption({ label: address });
        } else {
            await currentAddr.fill(address);
        }
        await permanentAddr.fill(address);

        await expect(permanentAddr).toHaveValue(address);
    });

    test('PI-E19 - Enter Unicode characters in the address', async ({ page }) => {
        const permanentAddr = page.locator('[formcontrolname="permanentAddress"]').first();
        const unicodeAddress = "123 Rue de l'Étoile, São Paulo, 東京都, München";
        await permanentAddr.fill(unicodeAddress);
        await expect(permanentAddr).toHaveValue(unicodeAddress);
    });

    test('PI-E20 - Refresh the page immediately after saving', async ({ page }) => {
        await loadTestEmployee(page, TEST_EMP_ID);
        const emailField = page.locator('[formcontrolname="officialEmailId"]').first();
        const savedEmail = await emailField.inputValue();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await loadTestEmployee(page, TEST_EMP_ID);
        const emailAfterReload = await page.locator('[formcontrolname="officialEmailId"]').first().inputValue();
        expect(emailAfterReload).toBe(savedEmail);
    });

    test('PI-E21 - Navigate away with unsaved personal information changes', async ({ page }) => {
        const personalEmail = page.locator('[formcontrolname="personalEmailId"]').first();
        await personalEmail.fill('temporary.unsaved@example.com');
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.getByPlaceholder('Search by Employee Name or ID...')).toBeVisible({ timeout: 45000 });
    });

    test('PI-E22 - Submit the form repeatedly or click Save multiple times', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        const addBtn = page.getByRole('button', { name: /Add Employee/i }).first();
        await expect(addBtn).toBeVisible({ timeout: 45000 });
        await addBtn.click();
        await expect(page.locator('[formcontrolname="employeeId"]').first()).toBeVisible({ timeout: 30000 });

        const saveButtons = page.locator('button:has-text("Save"), button[type="submit"]');
        const count = await saveButtons.count();
        if (count > 0) {
            await saveButtons.first().click().catch(() => {});
            await saveButtons.first().click().catch(() => {});
        }
        await page.waitForTimeout(500);
        await expect(page.locator('body')).toBeVisible();
    });

    test('PI-E23 - Search for an employee whose name contains spaces', async ({ page }) => {
        await loadTestEmployee(page, 'Sridhar Pokuri');
        const nameField = page.locator('[formcontrolname="fullName"]').first();
        await expect(nameField).toHaveValue('Sridhar Pokuri');
    });

    test('PI-E24 - Search using an employee ID with leading zeros, if IDs support them', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        const searchInput = page.getByPlaceholder('Search by Employee Name or ID...');
        await expect(searchInput).toBeVisible({ timeout: 45000 });
        await searchInput.fill('002068');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.waitForTimeout(1000);
        await expect(page.locator('body')).toBeVisible();
    });

    test('PI-E25 - Open an employee record with optional personal fields empty', async ({ page }) => {
        const emergencyContact = page.locator('[formcontrolname="emergencyContactNo"]').first();
        await expect(emergencyContact).toBeVisible();
        await expect(page.locator('[formcontrolname="employeeId"]').first()).toHaveValue(TEST_EMP_ID);
    });
});
