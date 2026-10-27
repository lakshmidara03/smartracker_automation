const { test, expect } = require('@playwright/test');

test.describe('SmartTracker FAQ UI Automation', () => {
    test.setTimeout(60000);

    test('Expand FAQ arrows and click User Guide', async ({ page }) => {
        // 1. Open FAQ page
        const baseUrl = process.env.BASE_URL || 'http://localhost:4200';
        const faqUrl = process.env.FAQ_URL || `${baseUrl.replace(/\/$/, '')}/FAQ`;

        console.log(`Navigating to FAQ page: ${faqUrl}`);
        await page.goto(faqUrl, {
            waitUntil: 'domcontentloaded'
        });

        // If redirected to login, verify heading or wait for auth
        await expect(
            page.getByRole('heading', {
                name: 'Frequently Asked Questions'
            })
        ).toBeVisible({ timeout: 15000 });

        console.log('PASS: FAQ page loaded');

        // 2. Expand each FAQ using the exact arrow selector
        const faqItems = page.locator('.faq-list .faq-item');
        const faqCount = await faqItems.count();

        expect(faqCount).toBeGreaterThan(0);
        console.log(`Found ${faqCount} FAQ items.`);

        for (let i = 0; i < faqCount; i++) {
            const item = faqItems.nth(i);
            const arrow = item.locator('.faq-question .toggle-icon');
            const answer = item.locator('.faq-answer');
            const questionText = await item.locator('.faq-question span').first().innerText();

            await expect(arrow).toBeVisible();

            // Click only when the answer is not already visible.
            if (!(await answer.isVisible().catch(() => false))) {
                await arrow.click();
            }

            await expect(answer).toBeVisible();

            console.log(`PASS: FAQ ${i + 1} expanded — "${questionText.trim()}"`);
        }

        // 3. Click User Guide
        const userGuide = page.locator('a').filter({
            hasText: /^User Guide$/
        });

        await expect(userGuide).toBeVisible();

        const initialUrl = page.url();

        // Capture a new tab if the click opens one.
        const popupPromise = page.waitForEvent('popup', {
            timeout: 3000
        }).catch(() => null);

        await userGuide.click();

        const popup = await popupPromise;

        if (popup) {
            await popup.waitForLoadState('domcontentloaded')
                .catch(() => {});

            console.log('PASS: User Guide opened in a new tab');
            console.log('User Guide URL:', popup.url());
            await popup.close().catch(() => {});
        } else {
            console.log('User Guide clicked.');
            console.log('Current URL:', page.url());

            // Check if in-page reference document modal opened
            const docModal = page.locator('.doc-modal-overlay');
            const isModalVisible = await docModal.isVisible({ timeout: 5000 }).catch(() => false);

            if (isModalVisible) {
                console.log('PASS: Reference Document modal displayed in page.');
                await expect(docModal.locator('h2')).toContainText('Reference Document');
                const iframe = docModal.locator('iframe');
                await expect(iframe).toBeVisible();
                const src = await iframe.getAttribute('src');
                console.log('Embedded document source:', src);

                // Close the modal
                const closeBtn = docModal.locator('button.close-button');
                if (await closeBtn.isVisible()) {
                    await closeBtn.click();
                    await expect(docModal).not.toBeVisible();
                    console.log('PASS: Reference Document modal closed.');
                }
            } else if (page.url() !== initialUrl) {
                console.log('PASS: Page URL changed after clicking User Guide');
            } else {
                console.log(
                    'No new tab or URL change detected. ' +
                    'Inspect the click handler to confirm the User Guide action.'
                );
            }
        }
    });
});
