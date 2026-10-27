const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
require('dotenv').config();

const LEAD_EMAIL = process.env.LEAD_EMAIL || 'lead@example.com';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'your_email@example.com';
const SENDER_PASSWORD = process.env.SENDER_PASSWORD || 'your_app_password';

async function generatePDFAndSendEmail() {
    console.log('Parsing results to generate PDF report...');
    const projectRoot = path.resolve(__dirname, '..');
    const today = new Date().toISOString().split('T')[0];

    // Find today's results.json
    const resultsPath = path.join(projectRoot, 'reports', 'history', today, 'results.json');
    if (!fs.existsSync(resultsPath)) {
        console.error('ERROR: results.json not found for today.');
        process.exit(1);
    }

    // Find summary for the table
    const summaryPath = path.join(projectRoot, 'reports', 'history', today, 'summary.json');
    let summaryData = { totalTests: 0, passed: 0, failed: 0, skipped: 0, durationMinutes: 0 };
    if (fs.existsSync(summaryPath)) {
        summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    }

    const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const failed = [];
    const skipped = [];

    function parseSuites(suites, parentTitle = '') {
        for (const suite of suites || []) {
            const currentTitle = parentTitle ? parentTitle + " > " + suite.title : suite.title;
            if (suite.specs) {
                for (const spec of suite.specs) {
                    const specTitle = currentTitle + " > " + spec.title;
                    if (spec.tests && spec.tests.length > 0) {
                        const result = spec.tests[0].results[0];
                        if (result.status === 'failed' || result.status === 'timedOut' || result.status === 'unexpected') {
                            let errorMsg = 'No error provided';
                            if (result.error && result.error.message) {
                                errorMsg = result.error.message.replace(new RegExp('\\x1B\\[\\d+;?\\d*m', 'g'), '').trim();
                            }
                            failed.push({ title: specTitle, error: errorMsg });
                        } else if (result.status === 'skipped') {
                            skipped.push({ title: specTitle });
                        }
                    }
                }
            }
            if (suite.suites) {
                parseSuites(suite.suites, currentTitle);
            }
        }
    }
    parseSuites(data.suites);

    // Build HTML for PDF
    let htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 40px; }
                h1 { color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 5px; }
                h2 { color: #5bc0de; border-bottom: 1px solid #ddd; margin-top: 30px; }
                .case { background: #fdfdfd; border-left: 4px solid #d9534f; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .case-skipped { border-left-color: #f0ad4e; }
                .title { font-weight: bold; font-size: 1.1em; margin-bottom: 10px; color: #444; }
                pre.error {
                    font-family: Consolas, monospace;
                    font-size: 0.9em;
                    color: #b94a48;
                    background: #f9f2f4;
                    padding: 10px;
                    border-radius: 4px;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin: 0;
                }
            </style>
        </head>
        <body>
            <h1>SmartTracker Defect & Skipped Report</h1>
            <p><strong>Date:</strong> ${today}</p>
            <p><strong>Total Failed:</strong> ${failed.length}</p>
            <p><strong>Total Skipped:</strong> ${skipped.length}</p>
    `;

    if (failed.length > 0) {
        htmlContent += "<h2>Failed Test Cases</h2>";
        failed.forEach((f, i) => {
            htmlContent += `
                <div class="case">
                    <div class="title">${i+1}. ${f.title}</div>
                    <pre class="error">${f.error}</pre>
                </div>
            `;
        });
    }

    if (skipped.length > 0) {
        htmlContent += "<h2>Skipped Test Cases</h2>";
        skipped.forEach((s, i) => {
            let reasonText = 'Reason: Skipped by code configuration or dynamically bypassed due to a previous step failing in the sequence.';
            if (s.title.includes('AE-N03') || s.title.includes('AE-E01')) {
                reasonText = "Reason: API validation disabled in code because the endpoint doesn't support zero-result filtering, or no expired token was provided in the .env file.";
            } else if (s.title.includes('Client Details')) {
                reasonText = "Reason: Client automatically skipped because they have zero active employee records in the Database or are missing from the UI dropdown.";
            }

            htmlContent += `
                <div class="case case-skipped">
                    <div class="title">${i+1}. ${s.title}</div>
                    <div style="font-style: italic; color: #777;">${reasonText}</div>
                </div>
            `;
        });
    }

    htmlContent += "</body></html>";

    const pdfPath = path.join(projectRoot, 'reports', 'history', today, 'Defects_Report.pdf');

    // Launch Playwright to generate PDF
    console.log('Generating PDF...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();

    console.log('PDF Generated successfully!');

    // Send Email
    const emailBody = `
        <p>Hi Team,</p>
        <p>The daily Playwright automation suite has completed. Here are the results for <b>${today}</b>:</p>

        <table border="1" cellpadding="10" style="border-collapse: collapse; text-align: left;">
            <tr style="background-color: #f2f2f2;"><th>Metric</th><th>Result</th></tr>
            <tr><td><b>Total Tests</b></td><td>${summaryData.totalTests}</td></tr>
            <tr><td><b>Passed</b></td><td style="color: green; font-weight: bold;">${summaryData.passed}</td></tr>
            <tr><td><b>Failed</b></td><td style="color: red; font-weight: bold;">${summaryData.failed}</td></tr>
            <tr><td><b>Skipped</b></td><td style="color: orange; font-weight: bold;">${summaryData.skipped}</td></tr>
            <tr><td><b>Duration</b></td><td>${summaryData.durationMinutes} minutes</td></tr>
        </table>

        <br>
        <p>Please find attached the detailed PDF report outlining the specific failed and skipped automation cases.</p>
        <p>Best regards,<br>SmartTracker Automation Bot</p>
    `;

    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: SENDER_EMAIL,
            pass: SENDER_PASSWORD
        }
    });

    try {
        console.log('Sending email...');
        let info = await transporter.sendMail({
            from: SENDER_EMAIL,
            to: LEAD_EMAIL,
            subject: `SmartTracker Daily Automation Report - ${today}`,
            html: emailBody,
            attachments: [{ filename: `Defects_Report_${today}.pdf`, path: pdfPath }]
        });
        console.log("✅ Email successfully sent with PDF attached! Message ID: " + info.messageId);
    } catch (error) {
        console.error('❌ Failed to send email:', error);
        process.exit(1);
    }
}

generatePDFAndSendEmail();
