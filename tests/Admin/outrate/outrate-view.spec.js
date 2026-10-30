const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Turn off trace recording to avoid Windows file-lock issues
test.use({ trace: 'off' });

const BASE_URL = (process.env.BASE_URL || 'https://13.61.179.149/').replace(/\/$/, '');
const OUTRATE_VIEW_URL = `${BASE_URL}/admin/outrate-view`;
const KNOWN_TEST_EMP_ID = '100';
const NON_EXISTENT_EMP_ID = '999999999';

test.describe('Admin - Outrate View', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });

    // Handle session timeout popup if visible
    const sessionContinueBtn = page.getByRole('button', { name: 'Yes', exact: true });
    if (await sessionContinueBtn.isVisible({ timeout: 2000 })) {
      await sessionContinueBtn.click();
    }

    if (page.url().includes('/login')) {
      await page.waitForURL(url => !url.includes('/login'), { timeout: 15000 });
    }

    // Verify page has loaded by checking the title
    await expect(page.locator('.page-title')).toContainText('Outrate Management', { timeout: 30000 });
  });

  test.describe('Check Employee Outrate', () => {
    test('OUT-001: should open the Outrate View page', async ({ page }) => {
      // 1. Verify page heading and subtitle
      await expect(page.locator('.page-title')).toHaveText('Outrate Management');
      await expect(page.locator('.page-subtitle')).toContainText('Upload, look up or download decrypted employee outrates.');

      // 2. Verify the 3 main navigation tabs
      await expect(page.locator('#tab-individual')).toBeVisible();
      await expect(page.locator('#tab-download')).toBeVisible();
      await expect(page.locator('#tab-upload')).toBeVisible();

      // 3. Verify the individual lookup section controls
      await expect(page.locator('#empIdInput')).toBeVisible();
      await expect(page.locator('#empIdInput')).toHaveAttribute('placeholder', 'Enter Employee ID (e.g. TT0157)');
      await expect(page.locator('#btn-lookup')).toBeVisible();
      await expect(page.locator('#btn-lookup')).toContainText('Check Outrate');
    });

    test('OUT-002: should retrieve an existing employee outrate', async ({ page }) => {
      // 1. Enter known test employee ID
      const empInput = page.locator('#empIdInput');
      await empInput.fill(KNOWN_TEST_EMP_ID);

      // 2. Click Check Outrate
      const lookupBtn = page.locator('#btn-lookup');
      await expect(lookupBtn).toBeEnabled();
      await lookupBtn.click();

      // 3. Verify the actual result card is displayed
      const resultCard = page.locator('.result-card.success-result');
      await expect(resultCard).toBeVisible({ timeout: 15000 });

      // 4. Verify employee ID and rate value
      await expect(page.locator('.result-emp-id')).toHaveText(KNOWN_TEST_EMP_ID);
      await expect(page.locator('.rate-value')).toBeVisible();
      await expect(page.locator('.rate-value')).toContainText('$');
      await expect(page.locator('.rate-unit')).toHaveText('/hr');
    });

    test('OUT-005: should handle an empty employee ID', async ({ page }) => {
      const empInput = page.locator('#empIdInput');
      await empInput.fill('');

      // Check Outrate button must be disabled when input is empty
      const lookupBtn = page.locator('#btn-lookup');
      await expect(lookupBtn).toBeDisabled();
    });

    test('OUT-006: should handle a nonexistent employee ID', async ({ page }) => {
      // 1. Enter a guaranteed-nonexistent employee ID
      const empInput = page.locator('#empIdInput');
      await empInput.fill(NON_EXISTENT_EMP_ID);

      // 2. Click Check Outrate
      const lookupBtn = page.locator('#btn-lookup');
      await expect(lookupBtn).toBeEnabled();
      await lookupBtn.click();

      // 3. Verify the error message appears
      const errorMsg = page.locator('.error-msg');
      await expect(errorMsg).toBeVisible({ timeout: 15000 });
      await expect(errorMsg).toContainText(`No outrate record found for employee ID '${NON_EXISTENT_EMP_ID}'`);
    });

    test('OUT-010: should handle whitespace in an employee ID', async ({ page }) => {
      const empInput = page.locator('#empIdInput');

      // Scenario A: Only whitespace entered -> Button should be disabled
      await empInput.fill('     ');
      const lookupBtn = page.locator('#btn-lookup');
      await expect(lookupBtn).toBeDisabled();

      // Scenario B: Valid ID with leading and trailing whitespace -> Should be trimmed and succeed
      await empInput.fill(`   ${KNOWN_TEST_EMP_ID}   `);
      await expect(lookupBtn).toBeEnabled();
      await lookupBtn.click();

      const resultCard = page.locator('.result-card.success-result');
      await expect(resultCard).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.result-emp-id')).toHaveText(KNOWN_TEST_EMP_ID);
    });
  });

  test.describe('Download All as Excel', () => {
    test('OUT-017: should download the Excel file', async ({ page }) => {
      // 1. Switch to Download All as Excel tab
      const downloadTab = page.locator('#tab-download');
      await downloadTab.click();
      await expect(downloadTab).toHaveClass(/active/);

      // 2. Verify download button is visible
      const downloadBtn = page.locator('#btn-download-excel');
      await expect(downloadBtn).toBeVisible({ timeout: 10000 });

      // 3. Listen for the download event and trigger download
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await downloadBtn.click();
      const download = await downloadPromise;

      // 4. Verify suggested filename matches employee_outrates_YYYY-MM-DD.xlsx
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/^employee_outrates_\d{4}-\d{2}-\d{2}\.xlsx$/);

      // 5. Verify the file was downloaded successfully and is non-empty
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const stats = fs.statSync(downloadPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  test.describe('Bulk Upload', () => {
    test('OUT-032: should reject an unsupported file format', async ({ page }) => {
      // 1. Switch to Bulk Upload tab
      const uploadTab = page.locator('#tab-upload');
      await uploadTab.click();
      await expect(uploadTab).toHaveClass(/active/);

      // 2. Verify file input is present
      const fileInput = page.locator('#csvInput');
      await expect(fileInput).toBeAttached();

      // 3. Upload a non-CSV file (e.g. text or pdf file)
      await fileInput.setInputFiles({
        name: 'test_unsupported.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Employee ID,Outrate\n100,85')
      });

      // 4. Verify the error message rejects unsupported format
      const errorMsg = page.locator('.error-msg');
      await expect(errorMsg).toBeVisible({ timeout: 10000 });
      await expect(errorMsg).toContainText('Only CSV files are supported.');
    });
  });
});

const csvFile = path.resolve(
  __dirname,
  '../../../fixtures/outdummy(5).csv'
);

test.describe('Admin - Outrate View - Bulk Upload', () => {
  test.beforeEach(async ({ page }) => {
    // Uses the authentication setup from playwright.config.ts.
    await page.goto(OUTRATE_VIEW_URL, { waitUntil: 'load', timeout: 60000 });

    const sessionContinueBtn = page.getByRole('button', { name: 'Yes', exact: true });
    if (await sessionContinueBtn.isVisible({ timeout: 2000 })) {
      await sessionContinueBtn.click();
    }

    if (page.url().includes('/login')) {
      await page.waitForURL(url => !url.includes('/login'), { timeout: 15000 });
    }

    await expect(
      page.getByRole('heading', { name: 'Outrate Management' }).or(page.locator('.page-title'))
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /Bulk Upload/i }).or(page.locator('#tab-upload')).click();

    await expect(
      page.getByRole('heading', {
        name: 'Employee Outrate Bulk Upload',
      }).or(page.getByText('Employee Outrate Bulk Upload'))
    ).toBeVisible({ timeout: 15000 });
  });

  test('OUT-BULK-001: displays the file selection step', async ({ page }) => {
    await expect(page.getByText('SELECT FILE')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Next: Map Columns/i })
    ).toBeDisabled();
  });

  test('OUT-BULK-002: accepts the outdummy CSV file', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(csvFile);

    // Adjust this assertion if the application displays a different
    // selected-file label.
    await expect(
      page.getByRole('button', { name: /Next: Map Columns/i })
    ).toBeEnabled();
  });

  test('OUT-BULK-003: maps Employee ID and Outrate columns', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(csvFile);

    await page.getByRole('button', {
      name: /Next: Map Columns/i,
    }).click();

    await expect(page.getByText('Map CSV Columns')).toBeVisible();

    const selects = page.locator('select');

    await expect(selects.nth(0)).toBeVisible();
    await expect(selects.nth(1)).toBeVisible();

    // The screenshot shows these as the required destination fields.
    await selects.nth(0).selectOption({ label: 'Employee ID' });
    await selects.nth(1).selectOption({ label: 'Outrate' });

    await expect(
      page.getByRole('button', { name: /Encrypt All Rows/i })
    ).toBeEnabled();
  });

  test('OUT-BULK-004: encrypts and displays the upload summary', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(csvFile);

    await page.getByRole('button', {
      name: /Next: Map Columns/i,
    }).click();

    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: 'Employee ID' });
    await selects.nth(1).selectOption({ label: 'Outrate' });

    await page.getByRole('button', {
      name: /Encrypt All Rows/i,
    }).click();

    await expect(
      page.getByRole('heading', { name: 'Upload Complete' })
    ).toBeVisible();

    await expect(page.getByText(/TOTAL ROWS/i)).toBeVisible();
    await expect(page.getByText(/ENCRYPTED & SAVED/i)).toBeVisible();
    await expect(page.getByText(/FAILED/i).first()).toBeVisible();
  });

  test('OUT-BULK-005: rejects an unsupported file type', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Employee ID,Outrate\nTT0157,75.50'),
    });

    // Update this assertion to the application's actual validation
    // message or behavior after inspecting the UI.
    await expect(
      page.getByRole('button', { name: /Next: Map Columns/i })
    ).toBeDisabled();
  });

  test('OUT-BULK-006: handles an empty CSV', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles({
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(''),
    });

    // An empty file should either disable Next or prevent encryption
    const nextBtn = page.getByRole('button', { name: /Next: Map Columns/i });
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
      const encryptBtn = page.getByRole('button', { name: /Encrypt All Rows/i });
      if (await encryptBtn.isVisible({ timeout: 3000 })) {
        await expect(encryptBtn).toBeDisabled();
      }
    } else {
      await expect(nextBtn).toBeDisabled();
    }
  });

  test('OUT-BULK-007: allows uploading another file after completion', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(csvFile);

    await page.getByRole('button', {
      name: /Next: Map Columns/i,
    }).click();

    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: 'Employee ID' });
    await selects.nth(1).selectOption({ label: 'Outrate' });

    await page.getByRole('button', {
      name: /Encrypt All Rows/i,
    }).click();

    await expect(
      page.getByRole('heading', { name: 'Upload Complete' })
    ).toBeVisible();

    await page.getByRole('button', { name: /Upload Another/i }).click();

    await expect(page.getByText('SELECT FILE')).toBeVisible();
  });
});
