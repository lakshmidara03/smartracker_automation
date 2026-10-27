const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = 3000;

// Project root
const projectRoot = path.resolve(__dirname, '..');

// Reports directories
const reportsDir = path.join(projectRoot, 'reports');
const historyDir = path.join(reportsDir, 'history');

// Dashboard frontend
const publicDir = path.join(__dirname, 'public');


// ============================================================
// Helper: Read JSON file
// ============================================================

function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        return JSON.parse(
            fs.readFileSync(filePath, 'utf8')
        );
    } catch (error) {
        console.error(
            `Failed to read JSON file: ${filePath}`
        );

        console.error(error.message);

        return null;
    }
}


// ============================================================
// Helper: Get latest report date
// ============================================================

function getLatestReportDate() {

    if (!fs.existsSync(historyDir)) {
        return null;
    }

    const folders = fs.readdirSync(historyDir, {
        withFileTypes: true
    });

    const dates = folders
        .filter(item => item.isDirectory())
        .map(item => item.name)
        .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
        .sort()
        .reverse();

    return dates.length > 0
        ? dates[0]
        : null;
}


// ============================================================
// API: Latest Summary
// ============================================================

app.get('/api/summary', (req, res) => {

    const latestDate = getLatestReportDate();

    if (!latestDate) {
        return res.status(404).json({
            error: 'No report history found.'
        });
    }

    const summaryPath = path.join(
        historyDir,
        latestDate,
        'summary.json'
    );

    const summary = readJsonFile(summaryPath);

    if (!summary) {
        return res.status(404).json({
            error: 'summary.json not found.'
        });
    }

    res.json(summary);
});


// ============================================================
// API: Latest Test Results
// ============================================================

app.get('/api/tests', (req, res) => {

    const latestDate = getLatestReportDate();

    if (!latestDate) {
        return res.status(404).json({
            error: 'No report history found.'
        });
    }

    const resultsPath = path.join(
        historyDir,
        latestDate,
        'results.json'
    );

    const results = readJsonFile(resultsPath);

    if (!results) {
        return res.status(404).json({
            error: 'results.json not found.'
        });
    }

    res.json(results);
});


// ============================================================
// API: Historical Reports
// ============================================================

app.get('/api/history', (req, res) => {

    if (!fs.existsSync(historyDir)) {
        return res.json([]);
    }

    const folders = fs.readdirSync(historyDir, {
        withFileTypes: true
    });

    const history = [];

    for (const folder of folders) {

        if (!folder.isDirectory()) {
            continue;
        }

        const date = folder.name;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            continue;
        }

        const summaryPath = path.join(
            historyDir,
            date,
            'summary.json'
        );

        const summary = readJsonFile(summaryPath);

        if (summary) {
            history.push(summary);
        }
    }

    history.sort((a, b) =>
        b.date.localeCompare(a.date)
    );

    res.json(history);
});


// ============================================================
// API: Specific Date
// ============================================================

app.get('/api/history/:date', (req, res) => {

    const date = req.params.date;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            error: 'Invalid date format. Use YYYY-MM-DD.'
        });
    }

    const reportDir = path.join(
        historyDir,
        date
    );

    if (!fs.existsSync(reportDir)) {
        return res.status(404).json({
            error: `No report found for ${date}.`
        });
    }

    const summary = readJsonFile(
        path.join(reportDir, 'summary.json')
    );

    const results = readJsonFile(
        path.join(reportDir, 'results.json')
    );

    res.json({
        summary,
        results
    });
});


// ============================================================
// Serve Dashboard Frontend
// ============================================================

app.use(
    express.static(publicDir)
);


// ============================================================
// Start Server
// ============================================================

app.listen(PORT, () => {

    console.log('');
    console.log('========================================');
    console.log(' SmartTracker Dashboard');
    console.log('========================================');
    console.log('');
    console.log(` Dashboard: http://localhost:${PORT}`);
    console.log(` API:       http://localhost:${PORT}/api/summary`);
    console.log('');
    console.log('========================================');
});
