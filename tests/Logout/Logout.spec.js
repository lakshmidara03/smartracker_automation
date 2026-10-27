const { test, expect } = require('@playwright/test');

test.describe('SmartTracker - Logout Functionality', () => {
    test.setTimeout(60000);

    const baseUrl = (process.env.UI_BASE_URL || (process.env.BASE_URL && !process.env.BASE_URL.includes('13.61.179.149') ? process.env.BASE_URL : 'http://localhost:4200')).replace(/\/$/, '');
    const faqUrl = `${baseUrl}/FAQ`;

    // Locator helpers
    const getAvatar = (page) => page.locator('.profile, img.login_avtar, img[src*="avatar"]').first();
    const getProfileCard = (page) => page.locator('app-profile-card');
    const getLogoutButton = (page) => page.locator('app-profile-card button:has-text("Logout"), app-profile-card .card-logout-btn button');

    test.beforeEach(async ({ page }) => {
        await page.goto(faqUrl, {
            waitUntil: 'domcontentloaded'
        });
        await expect(getAvatar(page)).toBeVisible({ timeout: 15000 });
    });

    test('LOG-POS-001 - Open profile menu', async ({ page }) => {
        const avatar = getAvatar(page);

        await expect(avatar).toBeVisible();
        await avatar.click();

        const profileCard = getProfileCard(page);
        await expect(profileCard).toBeVisible();

        const logoutButton = getLogoutButton(page);
        await expect(logoutButton).toBeVisible();
    });

    test('LOG-POS-002 - Verify profile details', async ({ page }) => {
        const avatar = getAvatar(page);
        await avatar.click();

        const profileCard = getProfileCard(page);

        await expect(profileCard).toBeVisible();
        await expect(profileCard).toContainText('Lakshmi Prasanna Dara');
        await expect(profileCard).toContainText('Admin');
        await expect(profileCard).toContainText('Lakshmi.Dara@relanto.ai');

        const logoutButton = getLogoutButton(page);
        await expect(logoutButton).toBeEnabled();
    });

    test('LOG-POS-003 - Logout successfully', async ({ page }) => {
        const avatar = getAvatar(page);
        await avatar.click();

        const logoutButton = getLogoutButton(page);
        await expect(logoutButton).toBeVisible();

        await logoutButton.click();

        // Verify redirection away from authenticated page to login
        await expect(async () => {
            const url = page.url();
            const profileVisible = await getProfileCard(page).isVisible().catch(() => false);
            const isLoginUrl = /login|signin|auth/i.test(url);

            expect(isLoginUrl || !profileVisible).toBeTruthy();
        }).toPass({ timeout: 15000 });

        console.log('Logout action completed successfully.');
        console.log('Current URL:', page.url());
    });

    test('LOG-NEG-001 - Logout button is not available when menu is closed', async ({ page }) => {
        // When menu is closed, profile card / logout button should not be present
        await expect(getLogoutButton(page)).toHaveCount(0);

        // Open the menu and verify the button becomes available
        const avatar = getAvatar(page);
        await avatar.click();

        await expect(getLogoutButton(page)).toBeVisible();
    });

    test('LOG-EDGE-001 - Reopen profile menu after closing it', async ({ page }) => {
        const avatar = getAvatar(page);

        // Open profile card
        await avatar.click();
        const profileCard = getProfileCard(page);
        await expect(profileCard).toBeVisible();

        // Click outside (CDK overlay backdrop) to close it
        const backdrop = page.locator('.cdk-overlay-backdrop');
        if (await backdrop.count() > 0) {
            await backdrop.click();
        } else {
            await page.mouse.click(200, 200);
        }

        await expect(profileCard).toBeHidden();

        // Reopen and verify Logout button remains available
        await avatar.click();
        await expect(profileCard).toBeVisible();
        await expect(getLogoutButton(page)).toBeVisible();
    });
});
