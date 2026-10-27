const ExcelJS = require('exceljs');

/**
 * Validates an Excel file by reading it programmatically.
 * Iterates through all worksheets, columns (left-to-right), and rows to find empty values.
 *
 * @param {string} filePath - Absolute path to the .xlsx file
 * @returns {Promise<Array>} - Array of objects containing validation results per worksheet
 */
async function validateExcelFile(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const results = [];
  
  workbook.eachSheet((worksheet, sheetId) => {
    const sheetInfo = {
      name: worksheet.name,
      rowCount: worksheet.actualRowCount,
      columnCount: worksheet.actualColumnCount,
      headers: [],
      missingData: []
    };
    
    // 1. Determine Headers from Row 1
    const headerRow = worksheet.getRow(1);
    
    // Iterate from the first column to the last dynamically
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      sheetInfo.headers.push({ 
        column: colNumber, 
        header: cell.value 
      });
    });
    
    // 2. Validate data left-to-right for each row
    for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex++) {
      const row = worksheet.getRow(rowIndex);
      
      sheetInfo.headers.forEach((headerInfo) => {
        const cell = row.getCell(headerInfo.column);
        const cellValue = cell.value;
        
        if (cellValue === null || cellValue === undefined || cellValue.toString().trim() === '') {
          sheetInfo.missingData.push(`Row ${rowIndex}, Column '${headerInfo.header}' is missing/empty.`);
        }
      });
    }
    
    results.push(sheetInfo);
  });
  
  return results;
}

module.exports = { validateExcelFile };
