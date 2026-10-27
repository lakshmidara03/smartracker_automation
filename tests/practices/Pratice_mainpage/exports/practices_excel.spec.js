const { test, expect } = require('@playwright/test');
const { PracticesPage } = require('../../../../pages/PracticesPage');
const fs = require('fs');
const { validateExcelFile } = require('../../../../utils/excelUtils');
const { setupAuthenticatedPage } = require('../../helpers/practicesTestHelper');

test.describe('Practices Excel Export Validation', () => {
  let page;
  let practicesPage;

  test.beforeAll(async ({ browser }) => {
    const res = await setupAuthenticatedPage(browser);
    page = res.page;
    practicesPage = res.practicesPage;
  });

  test.afterAll(async () => {
    if (page) await page.context().close();
  });

  test('TC02 - Validate Practices Excel Export', async () => {
    // Timeout set to 15 minutes (900000ms) because Non-Prod Excel generation over VPN takes >8 minutes
    test.setTimeout(900000);

    const downloadedFilePath = await practicesPage.runPracticesFlow();

    // 1. Verify that the downloaded file exists
    expect(fs.existsSync(downloadedFilePath), 'Downloaded Excel file should exist').toBeTruthy();

    // 2. Verify it has an .xlsx extension
    expect(downloadedFilePath.endsWith('.xlsx'), 'File should be an .xlsx file').toBeTruthy();

    // 3. Verify the file is not empty/corrupted
    const stats = fs.statSync(downloadedFilePath);
    expect(stats.size).toBeGreaterThan(0);

    // 4. Validate the complete Excel content programmatically left-to-right
    const excelResults = await validateExcelFile(downloadedFilePath);

    console.log(`\n--- Excel Validation Report ---`);
    console.log(`File Name: ${downloadedFilePath}`);

    excelResults.forEach(sheet => {
      console.log(`\nWorksheet Name: ${sheet.name}`);
      console.log(`Total Rows: ${sheet.rowCount}`);
      console.log(`Total Columns: ${sheet.columnCount}`);

      const allHeaders = sheet.headers.map(h => h.header).join(' | ');
      console.log(`Headers (Left-to-Right): \n${allHeaders}`);

      if (sheet.missingData.length > 0) {
        console.log(`\nMissing/Empty Unexpected Values Found:`);
        sheet.missingData.forEach(err => console.log(`  - ${err}`));
      } else {
        console.log(`\nNo missing data found in sheet.`);
      }

      // Assertions
      expect(sheet.rowCount).toBeGreaterThan(0);
      expect(sheet.headers.length).toBeGreaterThan(0);

      // Explicitly fail the test if the validation utility found missing/empty unexpected values
      expect(sheet.missingData, `Missing/empty unexpected values found in ${sheet.name}`).toHaveLength(0);
    });
  });
});

