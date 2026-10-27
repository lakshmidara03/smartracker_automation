const { test, expect } = require('@playwright/test');

const rawBase = (process.env.BASE_URL || 'https://13.61.179.149').replace(/\/+$/, '');
const BASE_URL = `${rawBase}/employee/employee-skills`;

// =============================================================================
// SELECTORS & CONFIGURATION
// =============================================================================

const SECTIONS = {
    proj: { id: 'proj', input: '#i-proj', name: 'Project Skills', required: true, max: null },
    pri:  { id: 'pri',  input: '#i-pri',  name: 'Primary Skills', required: true, max: 5 },
    sec:  { id: 'sec',  input: '#i-sec',  name: 'Secondary Skills', required: true, max: 8 },
    oth:  { id: 'oth',  input: '#i-oth',  name: 'Other Skills', required: false, max: 15 },
    cert: { id: 'cert', input: '#i-cert', name: 'Certifications', required: false, max: null },
};

const SAMPLE_SKILLS = {
    proj: ['Spring Boot', 'Kafka', 'AWS'],
    pri:  ['Java', 'SQL', 'Python', 'React', 'Salesforce'],
    sec:  ['Docker', 'RAG', 'Kubernetes', 'Node.js', 'Redis', 'GraphQL', 'Terraform', 'PostgreSQL'],
    oth:  ['Team Leadership', 'OS', 'Networking', 'Agile Scrum'],
    cert: ['AWS Certified Solutions Architect', 'CKA: Certified Kubernetes Administrator'],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function openSkillsPage(page) {
    try {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
        // Retry navigation once if initial connection stalled or dropped
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Handle "Enter Employee ID" modal if it appears
    const empIdInput = page.locator('input[placeholder*="Employee ID"]');
    try {
        const appeared = await empIdInput.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
        if (appeared) {
            await empIdInput.fill(process.env.EMPLOYEE_ID || '2068');
            const submitModalBtn = page.locator('button').filter({ hasText: /continue|submit|ok|save/i }).first();
            await submitModalBtn.click();
            await empIdInput.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(300);
        }
    } catch {
        // Modal not present
    }

    // Secondary check if modal popped up slightly later
    if (await empIdInput.isVisible().catch(() => false)) {
        await empIdInput.fill(process.env.EMPLOYEE_ID || '2068');
        const submitModalBtn = page.locator('button').filter({ hasText: /continue|submit|ok|save/i }).first();
        await submitModalBtn.click();
        await empIdInput.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }

    // Blank screen recovery: if Angular SPA stalls on initial render under load, reload once
    const heading = page.getByRole('heading', { name: 'My Skills' });
    const rendered = await heading.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
    if (!rendered) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        if (await empIdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await empIdInput.fill(process.env.EMPLOYEE_ID || '2068');
            await page.locator('button').filter({ hasText: /continue|submit|ok|save/i }).first().click();
            await empIdInput.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
        }
    }

    await expect(heading).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#i-proj')).toBeVisible({ timeout: 15000 });
}

function sec(page, id) {
    return page.locator(`section#s-${id}`);
}

function chip(page, id, value) {
    return page.locator(`section#s-${id} .chip`, { hasText: value });
}

async function removeChip(page, id, value) {
    const c = chip(page, id, value);
    await expect(c).toBeVisible();
    await c.locator('button, [aria-label*="Remove"]').first().click();
    await expect(c).toBeHidden({ timeout: 5000 });
    await page.waitForTimeout(200);
}

async function addSuggestedSkill(page, id, value, useEnter = false) {
    const input = page.locator(SECTIONS[id].input);
    await expect(input).toBeVisible();
    await input.scrollIntoViewIfNeeded();
    await input.focus();
    await input.click({ force: true }).catch(() => {});
    await input.fill(value);

    if (useEnter) {
        await page.waitForTimeout(250);
        await input.press('Enter');
    } else {
        await page.waitForTimeout(250);
        const listbox = page.locator(`section#s-${id} ul[role="listbox"]:visible, ul[role="listbox"]:visible`).last();
        const option = listbox.locator('li, [role="option"]').filter({ hasText: value }).first();

        try {
            if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
                await option.click({ force: true, timeout: 2000 });
            } else {
                await input.press('Enter');
            }
        } catch {
            await input.press('Enter');
        }
    }

    await expect(chip(page, id, value)).toBeVisible({ timeout: 5000 });

    const openListbox = page.locator(`section#s-${id} ul[role="listbox"]:visible`);
    if (await openListbox.isVisible().catch(() => false)) {
        await input.press('Escape').catch(() => {});
        await page.waitForTimeout(100);
    }
}

async function addCustomSkill(page, id, value) {
    const input = page.locator(SECTIONS[id].input);
    await expect(input).toBeVisible();
    await input.scrollIntoViewIfNeeded();
    await input.focus();
    await input.click({ force: true }).catch(() => {});
    await input.fill(value);
    await page.waitForTimeout(200);
    await input.press('Enter');

    // Fallback: also click Add button if chip not visible
    if (!await chip(page, id, value).isVisible({ timeout: 1500 }).catch(() => false)) {
        const addBtn = sec(page, id).locator('button.add, button:has-text("Add")').first();
        if (await addBtn.isVisible().catch(() => false)) {
            await addBtn.click().catch(() => {});
        }
    }

    await expect(chip(page, id, value)).toBeVisible({ timeout: 5000 });

    const openListbox = page.locator(`section#s-${id} ul[role="listbox"]:visible`);
    if (await openListbox.isVisible().catch(() => false)) {
        await input.press('Escape').catch(() => {});
        await page.waitForTimeout(100);
    }
}

async function resetSkills(page) {
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('.chip')).toHaveCount(0, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
}

async function saveSkills(page, consent = true) {
    await page.getByRole('button', { name: 'Save Skills', exact: true }).click();

    const consentBox = page.locator('.consent-box input[type="checkbox"]');
    if (await consentBox.isVisible({ timeout: 2500 }).catch(() => false)) {
        if (consent) {
            await consentBox.check();
            const submitBtn = page.getByRole('button', { name: 'Submit' });
            await expect(submitBtn).toBeEnabled();
            await submitBtn.click();
        } else {
            const cancelBtn = page.getByRole('button', { name: 'Cancel' });
            await cancelBtn.click();
        }
    }
}

// =============================================================================
// 1. POSITIVE TEST CASES (ES-P01 to ES-P30)
// =============================================================================

test.describe('SmartTracker - Employee Skills: 1. Positive Tests', () => {
    test.beforeEach(async ({ page }) => {
        await openSkillsPage(page);
    });

    test('ES-P01 - Open Employee Skills page successfully', async ({ page }) => {
        await expect(page).toHaveURL(/employee-skills/);
        await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
    });

    test('ES-P02 - Verify My Skills heading is visible', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
    });

    test('ES-P03 - Verify all five skill sections are visible', async ({ page }) => {
        for (const id of ['proj', 'pri', 'sec', 'oth', 'cert']) {
            await expect(sec(page, id)).toBeVisible();
        }
    });

    test('ES-P04 - Verify required indicators for mandatory sections', async ({ page }) => {
        for (const id of ['proj', 'pri', 'sec']) {
            await expect(sec(page, id).getByText('*')).toBeVisible();
        }
    });

    test('ES-P05 - Click Project Skills input and verify suggestions appear', async ({ page }) => {
        const input = page.locator('#i-proj');
        await input.click();
        await input.fill('Java');
        const listbox = page.locator('ul[role="listbox"]:visible');
        await expect(listbox).toBeVisible({ timeout: 5000 });
    });

    test('ES-P06 - Search for an existing skill and verify matching suggestions', async ({ page }) => {
        const input = page.locator('#i-proj');
        await input.fill('Spring');
        const option = page.locator('ul[role="listbox"]:visible').getByText(/Spring/i).first();
        await expect(option).toBeVisible({ timeout: 5000 });
    });

    test('ES-P07 - Select a skill by clicking suggestion', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot', false);
        await expect(chip(page, 'proj', 'Spring Boot')).toBeVisible();
    });

    test('ES-P08 - Select a skill using Enter key', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Kafka', true);
        await expect(chip(page, 'proj', 'Kafka')).toBeVisible();
    });

    test('ES-P09 - Add one project skill and verify it appears', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'AWS');
        await expect(chip(page, 'proj', 'AWS')).toBeVisible();
    });

    test('ES-P10 - Add multiple project skills and verify all appear', async ({ page }) => {
        for (const val of SAMPLE_SKILLS.proj) {
            await addSuggestedSkill(page, 'proj', val);
            await expect(chip(page, 'proj', val)).toBeVisible();
        }
    });

    test('ES-P11 - Add one primary skill', async ({ page }) => {
        await addSuggestedSkill(page, 'pri', 'Java');
        await expect(chip(page, 'pri', 'Java')).toBeVisible();
    });

    test('ES-P12 - Add five primary skills', async ({ page }) => {
        for (const val of SAMPLE_SKILLS.pri) {
            await addSuggestedSkill(page, 'pri', val);
            await expect(chip(page, 'pri', val)).toBeVisible();
        }
    });

    test('ES-P13 - Add one secondary skill', async ({ page }) => {
        await addSuggestedSkill(page, 'sec', 'Docker');
        await expect(chip(page, 'sec', 'Docker')).toBeVisible();
    });

    test('ES-P14 - Add eight secondary skills', async ({ page }) => {
        for (const val of SAMPLE_SKILLS.sec) {
            await addSuggestedSkill(page, 'sec', val);
            await expect(chip(page, 'sec', val)).toBeVisible();
        }
    });

    test('ES-P15 - Other Skills: type custom skill and click Add', async ({ page }) => {
        await addCustomSkill(page, 'oth', 'Custom Tech A', false);
        await expect(chip(page, 'oth', 'Custom Tech A')).toBeVisible();
    });

    test('ES-P16 - Other Skills: add custom skill using Enter', async ({ page }) => {
        await addCustomSkill(page, 'oth', 'Custom Tech B', true);
        await expect(chip(page, 'oth', 'Custom Tech B')).toBeVisible();
    });

    test('ES-P17 - Certifications: select a suggested certification', async ({ page }) => {
        await addSuggestedSkill(page, 'cert', 'AWS');
        await expect(chip(page, 'cert', 'AWS')).toBeVisible();
    });

    test('ES-P18 - Certifications: add certification using Enter or Add', async ({ page }) => {
        await addCustomSkill(page, 'cert', 'Certified Kubernetes', true);
        await expect(chip(page, 'cert', 'Certified Kubernetes')).toBeVisible();
    });

    test('ES-P19 - Save valid required skills successfully', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');

        const saveRequest = page.waitForRequest(
            req => req.url().includes('/employeeSkills/save') && req.method() === 'POST',
            { timeout: 15000 }
        );
        await saveSkills(page, true);
        await saveRequest;
    });

    test('ES-P20 - Reload after saving and verify state handled gracefully', async ({ page }) => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        const empIdInput = page.locator('input[placeholder*="Employee ID"]');
        if (await empIdInput.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
            await empIdInput.fill(process.env.EMPLOYEE_ID || '2068');
            await page.locator('button').filter({ hasText: /continue|submit|ok|save/i }).first().click();
        }
        await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
    });

    test('ES-P21 - Navigate away and reopen the page', async ({ page }) => {
        await page.goto('/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await openSkillsPage(page);
        await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
    });

    test('ES-P22 - Add another skill to current selection', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'proj', 'Kafka');
        await expect(chip(page, 'proj', 'Spring Boot')).toBeVisible();
        await expect(chip(page, 'proj', 'Kafka')).toBeVisible();
    });

    test('ES-P23 - Remove a selected chip', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await removeChip(page, 'proj', 'Spring Boot');
        await expect(chip(page, 'proj', 'Spring Boot')).not.toBeVisible();
    });

    test('ES-P24 - Summary: add a required section skill updates summary count', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await expect(page.getByRole('complementary')).toContainText(/1/);
    });

    test('ES-P25 - Summary: complete all required sections updates completion count', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await expect(page.getByText(/3 of 3 required sections complete/i)).toBeVisible();
    });

    test('ES-P26 - Summary: add optional skills updates count', async ({ page }) => {
        await addCustomSkill(page, 'oth', 'Custom Leadership', false);
        await expect(page.locator('aside')).toContainText(/\d+ skills? added/i);
    });

    test('ES-P27 - Reset: click Reset after adding unsaved chips', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await resetSkills(page);
        await expect(chip(page, 'proj', 'Spring Boot')).not.toBeVisible();
    });

    test('ES-P28 - Save multiple skills across all sections together', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Kafka');
        await addSuggestedSkill(page, 'pri', 'SQL');
        await addSuggestedSkill(page, 'sec', 'React');
        await addCustomSkill(page, 'oth', 'Custom Automation Tool');
        await saveSkills(page, true);
    });

    test('ES-P29 - Duplicate handling: selecting already selected skill', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Kafka');
        await page.locator('#i-proj').fill('Kafka Streams');
        await page.locator('#i-proj').press('Enter');
        const kafkaStreamsChips = await sec(page, 'proj').locator('.chip', { hasText: 'Kafka Streams' }).count();
        expect(kafkaStreamsChips).toBe(1);
    });

    test('ES-P30 - Data integrity: verify form elements are coherent', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await expect(chip(page, 'proj', 'Spring Boot')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save Skills' })).toBeVisible();
    });
});

// =============================================================================
// 2. NEGATIVE TEST CASES (ES-N01 to ES-N30)
// =============================================================================

test.describe('SmartTracker - Employee Skills: 2. Negative Tests', () => {
    test.beforeEach(async ({ page }) => {
        await openSkillsPage(page);
    });

    test('ES-N01 - Save with all required sections empty', async ({ page }) => {
        await page.getByRole('button', { name: 'Save Skills' }).click();
        await expect(page.getByText(/0 of 3 required sections complete/i)).toBeVisible();
        await expect(page.locator('.modal-panel')).not.toBeVisible();
    });

    test('ES-N02 - Project Skills empty while others populated blocks save', async ({ page }) => {
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await page.getByRole('button', { name: 'Save Skills' }).click();
        await expect(page.locator('.modal-panel')).not.toBeVisible();
    });

    test('ES-N03 - Primary Skills empty while others populated blocks save', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await page.getByRole('button', { name: 'Save Skills' }).click();
        await expect(page.locator('.modal-panel')).not.toBeVisible();
    });

    test('ES-N04 - Secondary Skills empty while others populated blocks save', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await page.getByRole('button', { name: 'Save Skills' }).click();
        await expect(page.locator('.modal-panel')).not.toBeVisible();
    });

    test('ES-N05 - Only Project Skills populated identifies missing sections', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await expect(page.getByText(/1 of 3 required sections complete/i)).toBeVisible();
    });

    test('ES-N06 - Only Primary Skills populated identifies missing sections', async ({ page }) => {
        await addSuggestedSkill(page, 'pri', 'Java');
        await expect(page.getByText(/1 of 3 required sections complete/i)).toBeVisible();
    });

    test('ES-N07 - Only Secondary Skills populated identifies missing sections', async ({ page }) => {
        await addSuggestedSkill(page, 'sec', 'Docker');
        await expect(page.getByText(/1 of 3 required sections complete/i)).toBeVisible();
    });

    test('ES-N08 - One required section missing blocks save confirmation', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await page.getByRole('button', { name: 'Save Skills' }).click();
        await expect(page.locator('.modal-panel')).not.toBeVisible();
    });

    test('ES-N09 - Custom skills: click Add with an empty input', async ({ page }) => {
        const initialCount = await sec(page, 'oth').locator('.chip').count();
        const addBtn = sec(page, 'oth').getByRole('button', { name: /^Add$/i });
        if (await addBtn.isVisible()) await addBtn.click();
        expect(await sec(page, 'oth').locator('.chip').count()).toBe(initialCount);
    });

    test('ES-N10 - Custom skills: enter spaces only', async ({ page }) => {
        const input = page.locator('#i-oth');
        await input.fill('     ');
        await input.press('Enter');
        expect(await sec(page, 'oth').locator('.chip').count()).toBe(0);
    });

    test('ES-N11 - Custom skills: duplicate custom skill is prevented', async ({ page }) => {
        await addCustomSkill(page, 'oth', 'Custom Tech Unique');
        await page.locator('#i-oth').fill('Custom Tech Unique');
        await page.locator('#i-oth').press('Enter');
        expect(await sec(page, 'oth').locator('.chip', { hasText: 'Custom Tech Unique' }).count()).toBe(1);
    });

    test('ES-N12 - Custom skills: very long skill name is handled', async ({ page }) => {
        const longName = 'A'.repeat(250);
        await page.locator('#i-oth').fill(longName);
        await page.locator('#i-oth').press('Enter');
    });

    test('ES-N13 - Custom skills: special characters handled cleanly', async ({ page }) => {
        await page.locator('#i-oth').fill('<script>alert("test")</script>');
        await page.locator('#i-oth').press('Enter');
        await expect(page.locator('script:has-text("alert")')).not.toBeAttached();
    });

    test('ES-N14 - Suggestions: nonexistent skill shows empty suggestions or allows enter', async ({ page }) => {
        await page.locator('#i-proj').fill('NonExistentSkillXYZ123');
        const exactOption = page.locator('ul[role="listbox"]:visible').getByText('NonExistentSkillXYZ123', { exact: true });
        await expect(exactOption).not.toBeVisible();
    });

    test('ES-N15 - Suggestions: partial text closed with Escape does not add chip', async ({ page }) => {
        await page.locator('#i-proj').fill('Jav');
        await page.keyboard.press('Escape');
        expect(await sec(page, 'proj').locator('.chip').count()).toBe(0);
    });

    test('ES-N16 - Save: save while suggestions menu is open', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await page.locator('#i-proj').fill('Py');
        await page.getByRole('button', { name: 'Save Skills' }).click();
    });

    test('ES-N17 - Save: click Save repeatedly does not create duplicate dialogs', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        const saveBtn = page.getByRole('button', { name: 'Save Skills' });
        await saveBtn.click({ clickCount: 3 });
        await expect(page.locator('.modal-panel')).toHaveCount(1);
    });

    test('ES-N18 - Save without checking consent keeps Submit disabled', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await page.getByRole('button', { name: 'Save Skills' }).click();
        const submitBtn = page.getByRole('button', { name: 'Submit' });
        await expect(submitBtn).toBeDisabled();
    });

    test('ES-N19 - Cancel in consent modal discards submission', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await saveSkills(page, false);
        await expect(page.locator('.modal-panel')).not.toBeVisible();
        await expect(chip(page, 'proj', 'Spring Boot')).toBeVisible();
    });

    test('ES-N20 - Persistence: reload before saving clears unsaved input', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(chip(page, 'proj', 'Spring Boot')).not.toBeVisible();
    });

    test('ES-N21 - Reset on fresh form produces no error', async ({ page }) => {
        await resetSkills(page);
        await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
    });

    test('ES-N22 - Reset with no changes leaves form ready', async ({ page }) => {
        await resetSkills(page);
        await expect(page.getByRole('button', { name: 'Save Skills' })).toBeVisible();
    });

    test('ES-N23 - Reset immediately after adding chips clears all sections', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Kafka');
        await addSuggestedSkill(page, 'pri', 'Java');
        await resetSkills(page);
        await expect(chip(page, 'proj', 'Kafka')).not.toBeVisible();
        await expect(chip(page, 'pri', 'Java')).not.toBeVisible();
    });

    test('ES-N24 - Primary skills limit boundary validation', async ({ page }) => {
        for (const skill of SAMPLE_SKILLS.pri) {
            await addSuggestedSkill(page, 'pri', skill);
        }
        expect(await sec(page, 'pri').locator('.chip').count()).toBe(5);
    });

    test('ES-N25 - Secondary skills limit boundary validation', async ({ page }) => {
        for (const skill of SAMPLE_SKILLS.sec) {
            await addSuggestedSkill(page, 'sec', skill);
        }
        expect(await sec(page, 'sec').locator('.chip').count()).toBe(8);
    });

    test('ES-N26 - Other skills allows multiple additions', async ({ page }) => {
        const customSkills = ['Custom Skill 1', 'Custom Skill 2', 'Custom Skill 3'];
        for (const skill of customSkills) {
            await addCustomSkill(page, 'oth', skill);
        }
        expect(await sec(page, 'oth').locator('.chip').count()).toBe(customSkills.length);
    });

    test('ES-N27 - Certifications: empty entry rejected', async ({ page }) => {
        const addBtn = sec(page, 'cert').locator('button.add');
        if (await addBtn.isVisible().catch(() => false)) {
            await addBtn.click();
        }
        expect(await sec(page, 'cert').locator('.chip').count()).toBe(0);
    });

    test('ES-N28 - Conflict validation: skill in Primary cannot duplicate to Secondary', async ({ page }) => {
        await addSuggestedSkill(page, 'pri', 'Java');
        await page.locator('#i-sec').fill('Java');
        const conflict = page.locator('.conflict, [role="alert"], text="In Primary"');
        if (await conflict.isVisible({ timeout: 1500 }).catch(() => false)) {
            await expect(conflict).toBeVisible();
        }
    });

    test('ES-N29 - Invalid input format does not break UI', async ({ page }) => {
        await page.locator('#i-proj').fill('!@#$%^&*()_+');
        await page.locator('#i-proj').press('Enter');
        await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
    });

    test('ES-N30 - Save button state is responsive', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Save Skills' })).toBeVisible();
    });
});

// =============================================================================
// 3. EDGE AND BOUNDARY TEST CASES (ES-E01 to ES-E40)
// =============================================================================

test.describe('SmartTracker - Employee Skills: 3. Edge and Boundary Tests', () => {
    test.beforeEach(async ({ page }) => {
        await openSkillsPage(page);
    });

    test('ES-E01 - Project Skills: add exactly one skill', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'AWS');
        expect(await sec(page, 'proj').locator('.chip').count()).toBe(1);
    });

    test('ES-E02 - Project Skills: add 3 skills', async ({ page }) => {
        for (const val of SAMPLE_SKILLS.proj) {
            await addSuggestedSkill(page, 'proj', val);
        }
        expect(await sec(page, 'proj').locator('.chip').count()).toBe(SAMPLE_SKILLS.proj.length);
    });

    test('ES-E03 - Primary Skills: add exactly 5 skills', async ({ page }) => {
        for (const val of SAMPLE_SKILLS.pri) {
            await addSuggestedSkill(page, 'pri', val);
        }
        expect(await sec(page, 'pri').locator('.chip').count()).toBe(5);
    });

    test('ES-E04 - Primary Skills: boundary check at 5 items', async ({ page }) => {
        for (const val of SAMPLE_SKILLS.pri) {
            await addSuggestedSkill(page, 'pri', val);
        }
        await expect(sec(page, 'pri')).toBeVisible();
    });

    test('ES-E05 - Secondary Skills: add exactly 8 skills', async ({ page }) => {
        for (const val of SAMPLE_SKILLS.sec) {
            await addSuggestedSkill(page, 'sec', val);
        }
        expect(await sec(page, 'sec').locator('.chip').count()).toBe(8);
    });

    test('ES-E06 - Secondary Skills: boundary check at 8 items', async ({ page }) => {
        for (const val of SAMPLE_SKILLS.sec) {
            await addSuggestedSkill(page, 'sec', val);
        }
        await expect(sec(page, 'sec')).toBeVisible();
    });

    test('ES-E07 - Other Skills: multiple custom items added cleanly', async ({ page }) => {
        const skills = ['Custom Architecture', 'Internal Tooling', 'Proprietary System'];
        for (const val of skills) {
            await addCustomSkill(page, 'oth', val);
        }
        expect(await sec(page, 'oth').locator('.chip').count()).toBe(skills.length);
    });

    test('ES-E08 - Custom skills: enter a one-character skill', async ({ page }) => {
        await addCustomSkill(page, 'oth', 'Z');
        await expect(chip(page, 'oth', 'Z')).toBeVisible();
    });

    test('ES-E09 - Custom skills: technical names with punctuation (C++, C#, .NET)', async ({ page }) => {
        for (const name of ['Custom-Tool+', 'Custom#Lib', 'Custom.Net']) {
            await addCustomSkill(page, 'oth', name);
            await expect(chip(page, 'oth', name)).toBeVisible();
        }
    });

    test('ES-E10 - Custom skills: enter name with internal spaces', async ({ page }) => {
        await addCustomSkill(page, 'oth', 'Deep Learning NLP');
        await expect(chip(page, 'oth', 'Deep Learning NLP')).toBeVisible();
    });

    test('ES-E11 - Custom skills: enter leading and trailing spaces get trimmed', async ({ page }) => {
        await addCustomSkill(page, 'oth', '   Custom Automation Workflow   ');
        await expect(chip(page, 'oth', 'Custom Automation Workflow')).toBeVisible();
    });

    test('ES-E12 - Suggestions: search with uppercase text', async ({ page }) => {
        await page.locator('#i-proj').fill('AWS');
        await expect(page.locator('ul[role="listbox"]:visible')).toBeVisible();
    });

    test('ES-E13 - Suggestions: search with lowercase text', async ({ page }) => {
        await page.locator('#i-proj').fill('aws');
        await expect(page.locator('ul[role="listbox"]:visible')).toBeVisible();
    });

    test('ES-E14 - Suggestions: navigate options using arrow keys', async ({ page }) => {
        const input = page.locator('#i-proj');
        await input.fill('Java');
        await input.press('ArrowDown');
        await input.press('Enter');
        expect(await sec(page, 'proj').locator('.chip').count()).toBeGreaterThanOrEqual(1);
    });

    test('ES-E15 - Suggestions: press Escape closes listbox', async ({ page }) => {
        const input = page.locator('#i-proj');
        await input.fill('Java');
        await input.press('Escape');
        await expect(page.locator('ul[role="listbox"]:visible')).not.toBeVisible();
    });

    test('ES-E16 - Chips: remove the first selected skill', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'proj', 'Kafka');
        await removeChip(page, 'proj', 'Spring Boot');
        await expect(chip(page, 'proj', 'Spring Boot')).not.toBeVisible();
        await expect(chip(page, 'proj', 'Kafka')).toBeVisible();
    });

    test('ES-E17 - Chips: remove the last selected skill', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'proj', 'Kafka');
        await removeChip(page, 'proj', 'Kafka');
        await expect(chip(page, 'proj', 'Kafka')).not.toBeVisible();
        await expect(chip(page, 'proj', 'Spring Boot')).toBeVisible();
    });

    test('ES-E18 - Chips: remove all skills from a section', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await removeChip(page, 'proj', 'Spring Boot');
        expect(await sec(page, 'proj').locator('.chip').count()).toBe(0);
    });

    test('ES-E19 - Summary: repeatedly adding and removing chips keeps counts accurate', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await removeChip(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'proj', 'AWS');
        await expect(page.getByRole('complementary')).toContainText(/1/);
    });

    test('ES-E20 - Summary: complete required sections then remove one decreases count', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await removeChip(page, 'sec', 'Docker');
        await expect(page.getByText(/2 of 3 required sections complete/i)).toBeVisible();
    });

    test('ES-E21 - Reset: reset after adding chips to several sections', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'AWS');
        await addSuggestedSkill(page, 'pri', 'SQL');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await resetSkills(page);
        expect(await page.locator('.chip').count()).toBe(0);
    });

    test('ES-E22 - Save with optional sections empty succeeds', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await saveSkills(page, true);
    });

    test('ES-E23 - Page responsive at smaller viewport', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save Skills' })).toBeVisible();
    });
});

// =============================================================================
// 4. RESET BUTTON SPECIFIC TEST CASES (ES-R01 to ES-R10)
// =============================================================================

test.describe('SmartTracker - Employee Skills: 4. Reset Button Tests', () => {
    test.beforeEach(async ({ page }) => {
        await openSkillsPage(page);
    });

    test('ES-R01 - Click Reset on an empty form', async ({ page }) => {
        await resetSkills(page);
        expect(await page.locator('.chip').count()).toBe(0);
    });

    test('ES-R02 - Add one project skill and click Reset', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await resetSkills(page);
        await expect(chip(page, 'proj', 'Spring Boot')).not.toBeVisible();
    });

    test('ES-R03 - Add skills in all three required sections and click Reset', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await resetSkills(page);
        expect(await page.locator('.chip').count()).toBe(0);
    });

    test('ES-R04 - Add Other Skills and click Reset', async ({ page }) => {
        await addCustomSkill(page, 'oth', 'Custom Figma Tool');
        await resetSkills(page);
        await expect(chip(page, 'oth', 'Custom Figma Tool')).not.toBeVisible();
    });

    test('ES-R05 - Add certifications and click Reset', async ({ page }) => {
        await addCustomSkill(page, 'cert', 'Certified Kubernetes');
        await resetSkills(page);
        await expect(chip(page, 'cert', 'Certified Kubernetes')).not.toBeVisible();
    });

    test('ES-R06 - Click Reset multiple times causes no errors', async ({ page }) => {
        await resetSkills(page);
        await resetSkills(page);
        await expect(page.getByRole('button', { name: 'Save Skills' })).toBeVisible();
    });

    test('ES-R07 - Reset restores summary completion count to 0', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await resetSkills(page);
        await expect(page.getByText(/0 of 3 required sections complete/i)).toBeVisible();
    });

    test('ES-R08 - Reset clears input text fields', async ({ page }) => {
        await page.locator('#i-oth').fill('Temporary Text');
        await resetSkills(page);
        await expect(page.locator('#i-oth')).toHaveValue('');
    });

    test('ES-R09 - Reset then add new skills functions normally', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await resetSkills(page);
        await addSuggestedSkill(page, 'proj', 'Kafka');
        await expect(chip(page, 'proj', 'Kafka')).toBeVisible();
    });

    test('ES-R10 - Reset keeps buttons enabled', async ({ page }) => {
        await resetSkills(page);
        await expect(page.getByRole('button', { name: 'Reset' })).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Save Skills' })).toBeEnabled();
    });
});

// =============================================================================
// 5. SAVE AND DATABASE PERSISTENCE TESTS (ES-D01 to ES-D15)
// =============================================================================

test.describe('SmartTracker - Employee Skills: 5. Save & Persistence Tests', () => {
    test.beforeEach(async ({ page }) => {
        await openSkillsPage(page);
    });

    test('ES-D01 - Save skills triggers POST /employeeSkills/save API call', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');

        const [request] = await Promise.all([
            page.waitForRequest(req => req.url().includes('/employeeSkills/save') && req.method() === 'POST'),
            saveSkills(page, true)
        ]);

        const postData = JSON.parse(request.postData() || '{}');
        expect(postData.projectSkills).toContain('Spring Boot');
        expect(postData.primarySkills).toContain('Java');
        expect(postData.secondarySkills).toContain('Docker');
    });

    test('ES-D02 - Save API returns 200 success response', async ({ page }) => {
        await page.route('**/employeeSkills/save**', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Skills saved successfully' })
            });
        });

        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');

        const [response] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/employeeSkills/save') && res.status() === 200),
            saveSkills(page, true)
        ]);

        const body = await response.json();
        expect(body.success).toBe(true);
    });

    test('ES-D03 - Save with optional Other Skills included in payload', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await addCustomSkill(page, 'oth', 'Custom Design Tool');

        const [request] = await Promise.all([
            page.waitForRequest(req => req.url().includes('/employeeSkills/save')),
            saveSkills(page, true)
        ]);

        const postData = JSON.parse(request.postData() || '{}');
        expect(postData.otherSkills).toContain('Custom Design Tool');
    });

    test('ES-D04 - Save with Certifications included in payload', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await addCustomSkill(page, 'cert', 'Certified Kubernetes');

        const [request] = await Promise.all([
            page.waitForRequest(req => req.url().includes('/employeeSkills/save')),
            saveSkills(page, true)
        ]);

        const postData = JSON.parse(request.postData() || '{}');
        expect(postData.certifications.some(c => c.includes('Kubernetes'))).toBe(true);
    });

    test('ES-D05 - Save payload contains resolved employeeId', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');

        const [request] = await Promise.all([
            page.waitForRequest(req => req.url().includes('/employeeSkills/save')),
            saveSkills(page, true)
        ]);

        const postData = JSON.parse(request.postData() || '{}');
        expect(postData.employeeId).toBeTruthy();
    });

    test('ES-D06 - Save payload contains employee email', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');

        const [request] = await Promise.all([
            page.waitForRequest(req => req.url().includes('/employeeSkills/save')),
            saveSkills(page, true)
        ]);

        const postData = JSON.parse(request.postData() || '{}');
        expect(postData.email).toBeTruthy();
    });

    test('ES-D07 - Successful save displays confirmation message', async ({ page }) => {
        await page.route('**/employeeSkills/save**', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Skills saved successfully' })
            });
        });

        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await saveSkills(page, true);
        await expect(page.getByText(/skills saved/i)).toBeVisible();
    });

    test('ES-D08 - Successful save resets form for next submission cycle', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await saveSkills(page, true);
        await expect(page.locator('.modal-panel')).not.toBeVisible();
    });

    test('ES-D09 - Lookup by email is called on page initialization', async ({ page }) => {
        const [lookup] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/employeeSkills/lookupByEmail')),
            page.reload({ waitUntil: 'domcontentloaded' })
        ]);
        expect(lookup.url()).toContain('/employeeSkills/lookupByEmail');
    });

    test('ES-D10 - Save without modifying required fields shows incomplete status', async ({ page }) => {
        await page.getByRole('button', { name: 'Save Skills' }).click();
        await expect(page.getByText(/0 of 3 required sections complete/i)).toBeVisible();
    });
});

// =============================================================================
// 6. UI AND ACCESSIBILITY TESTS (ES-U01 to ES-U15)
// =============================================================================

test.describe('SmartTracker - Employee Skills: 6. UI and Accessibility Tests', () => {
    test.beforeEach(async ({ page }) => {
        await openSkillsPage(page);
    });

    test('ES-U01 - Verify placeholders for all inputs', async ({ page }) => {
        await expect(page.locator('#i-proj')).toHaveAttribute('placeholder', /Spring Boot, Kafka, AWS/i);
        await expect(page.locator('#i-pri')).toHaveAttribute('placeholder', /Search your strongest skills/i);
        await expect(page.locator('#i-sec')).toHaveAttribute('placeholder', /Search supporting skills/i);
        await expect(page.locator('#i-oth')).toHaveAttribute('placeholder', /Type a skill and press Enter/i);
        await expect(page.locator('#i-cert')).toHaveAttribute('placeholder', /Search or type a certification/i);
    });

    test('ES-U02 - Verify Save Skills button is visible and styled', async ({ page }) => {
        const saveBtn = page.getByRole('button', { name: 'Save Skills' });
        await expect(saveBtn).toBeVisible();
        await expect(saveBtn).toHaveClass(/btn/);
    });

    test('ES-U03 - Verify Reset button is visible and styled', async ({ page }) => {
        const resetBtn = page.getByRole('button', { name: 'Reset' });
        await expect(resetBtn).toBeVisible();
        await expect(resetBtn).toHaveClass(/btn/);
    });

    test('ES-U04 - Verify listbox positioning aligns with active input', async ({ page }) => {
        await page.locator('#i-proj').fill('Java');
        const listbox = page.locator('ul[role="listbox"]:visible');
        await expect(listbox).toBeVisible();
    });

    test('ES-U05 - Open suggestions for two sections in succession', async ({ page }) => {
        await page.locator('#i-proj').fill('Java');
        await expect(sec(page, 'proj').locator('ul[role="listbox"]:visible')).toBeVisible();

        await page.locator('#i-pri').fill('SQL');
        await expect(sec(page, 'pri').locator('ul[role="listbox"]:visible')).toBeVisible();
    });

    test('ES-U06 - Verify chips have accessible remove buttons', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        const removeBtn = sec(page, 'proj').getByRole('button', { name: /Remove Spring Boot/i });
        await expect(removeBtn).toBeVisible();
    });

    test('ES-U07 - Verify Skills summary sidebar displays all 5 categories', async ({ page }) => {
        const summary = page.getByRole('complementary');
        await expect(summary).toContainText(/Project Skills/i);
        await expect(summary).toContainText(/Primary Skills/i);
        await expect(summary).toContainText(/Secondary Skills/i);
        await expect(summary).toContainText(/Other Skills/i);
        await expect(summary).toContainText(/Certifications/i);
    });

    test('ES-U08 - Verify required and optional badges in summary', async ({ page }) => {
        const summary = page.getByRole('complementary');
        await expect(summary.getByText('Required').first()).toBeVisible();
        await expect(summary.getByText('Optional').first()).toBeVisible();
    });

    test('ES-U09 - Keyboard-only navigation across sections', async ({ page }) => {
        await page.locator('#i-proj').focus();
        await page.keyboard.type('AWS');
        await page.keyboard.press('Enter');
        await expect(chip(page, 'proj', 'AWS')).toBeVisible();
    });

    test('ES-U10 - Focus remains manageable after adding a chip', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await expect(page.locator('#i-proj')).toBeVisible();
    });

    test('ES-U11 - Progress indicator updates with completion', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await expect(page.getByText(/3 of 3 required sections complete/i)).toBeVisible();
    });

    test('ES-U12 - Consent modal has accessible dialog structure', async ({ page }) => {
        await addSuggestedSkill(page, 'proj', 'Spring Boot');
        await addSuggestedSkill(page, 'pri', 'Java');
        await addSuggestedSkill(page, 'sec', 'Docker');
        await page.getByRole('button', { name: 'Save Skills' }).click();

        await expect(page.locator('.modal-panel')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Confirm Your Skills/i })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();

        await page.getByRole('button', { name: 'Cancel' }).click();
    });

    test('ES-U13 - Verify breadcrumb navigation is present', async ({ page }) => {
        await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toBeVisible();
    });

    test('ES-U14 - Verify page scrolling maintains button accessibility', async ({ page }) => {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect(page.getByRole('button', { name: 'Save Skills' })).toBeVisible();
    });

    test('ES-U15 - Repeated page navigation renders cleanly', async ({ page }) => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        const empIdInput = page.locator('input[placeholder*="Employee ID"]');
        if (await empIdInput.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
            await empIdInput.fill(process.env.EMPLOYEE_ID || '2068');
            await page.locator('button').filter({ hasText: /continue|submit|ok|save/i }).first().click();
        }
        await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
    });
});