const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Project paths
const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'reports');
const historyDir = path.join(reportsDir, 'history');
const publicDir = path.join(__dirname, 'public');

// Strip ANSI color codes from terminal error outputs
function stripAnsi(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

// Read and parse JSON safely
function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`Failed to read JSON file ${filePath}:`, e.message);
        return null;
    }
}

// Find the latest report date folder in reports/history
function getLatestReportDate() {
    if (!fs.existsSync(historyDir)) return null;
    const folders = fs.readdirSync(historyDir, { withFileTypes: true });
    const dates = folders
        .filter(item => item.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(item.name))
        .map(item => item.name)
        .sort()
        .reverse();
    return dates.length > 0 ? dates[0] : null;
}

// Get the latest Playwright test results data
function getRawResultsData(requestedDate) {
    // 1. If requested specific historical date
    if (requestedDate && requestedDate !== 'latest') {
        const histPath = path.join(historyDir, requestedDate, 'results.json');
        if (fs.existsSync(histPath)) return readJsonFile(histPath);
    }

    // 2. If explicitly requested 'latest'
    const latestPath = path.join(reportsDir, 'latest-results.json');
    if (requestedDate === 'latest' && fs.existsSync(latestPath)) {
        return readJsonFile(latestPath);
    }

    // 3. If no specific date requested, check latest-results.json
    if (fs.existsSync(latestPath)) {
        const latestData = readJsonFile(latestPath);
        if (latestData) {
            const stats = latestData.stats || {};
            const hasCompleted = (stats.expected > 0) || (stats.unexpected > 0);
            if (hasCompleted) {
                return latestData;
            }
        }
    }

    // 4. Fallback to latest historical folder if latest-results is empty or in-progress
    const latestDate = getLatestReportDate();
    if (latestDate) {
        const histPath = path.join(historyDir, latestDate, 'results.json');
        if (fs.existsSync(histPath)) return readJsonFile(histPath);
    }

    // 5. Final fallback to latestPath even if empty
    if (fs.existsSync(latestPath)) {
        return readJsonFile(latestPath);
    }

    return null;
}

// Map any test file path to one of the 5 main pages and its specific sub-screen
function classifyTest(filePath) {
    const norm = (filePath || '').replace(/\\/g, '/').toLowerCase();

    // 1. Practices
    if (norm.includes('practice') || norm.includes('pratice')) {
        let subScreen = 'Practice Main Page';
        if (norm.includes('account_summary') || norm.includes('account-summary')) {
            subScreen = 'Account Summary';
        } else if (norm.includes('project_allocation') || norm.includes('project-allocation')) {
            subScreen = 'Project Allocation';
        } else if (norm.includes('estimatedvsactual') || norm.includes('estimate_vs_actual') || norm.includes('estimate-vs-actual')) {
            subScreen = 'Estimate vs Actual';
        }
        return { module: 'Practices', subScreen };
    }

    // 2. Admin
    if (norm.includes('admin') || norm.includes('logout') || norm.includes('login')) {
        let subScreen = 'General Admin';
        if (norm.includes('user_management') || norm.includes('update-role') || norm.includes('user_role')) {
            subScreen = 'User Management';
        } else if (norm.includes('manage_client') || norm.includes('client_management') || norm.includes('client-project')) {
            subScreen = 'Client Management';
        } else if (norm.includes('manage_projects') || norm.includes('project')) {
            subScreen = 'Project Management';
        } else if (norm.includes('outrate')) {
            subScreen = 'Outrate View & Upload';
        } else if (norm.includes('logout') || norm.includes('login')) {
            subScreen = 'Authentication & Session';
        }
        return { module: 'Admin', subScreen };
    }

    // 3. Employee
    if (norm.includes('employee')) {
        let subScreen = 'General Employee';
        if (norm.includes('allocation')) {
            subScreen = 'Employee Allocation';
        } else if (norm.includes('personal') || norm.includes('pesronal')) {
            subScreen = 'Personal Info';
        } else if (norm.includes('skill')) {
            subScreen = 'Skills & Certifications';
        }
        return { module: 'Employee', subScreen };
    }

    // 4. Reports
    if (norm.includes('report')) {
        let subScreen = 'General Reports';
        if (norm.includes('bench')) {
            subScreen = 'Bench Reports';
        } else if (norm.includes('milestone')) {
            subScreen = 'Milestone Reports';
        }
        return { module: 'Reports', subScreen };
    }

    // 5. Frequently Asked Questions
    if (norm.includes('faq') || norm.includes('frequently') || norm.includes('questions')) {
        return { module: 'Frequently Asked Questions', subScreen: 'FAQ & User Guide' };
    }

    return { module: 'Other', subScreen: 'General' };
}

// Extract all test specs flat from Playwright results JSON
function extractAllTests(rawResults) {
    if (!rawResults || !rawResults.suites) return [];
    const tests = [];
    let idCounter = 1;

    function walkSuites(suite, currentFile) {
        const file = suite.file || currentFile || '';
        
        if (suite.specs && Array.isArray(suite.specs)) {
            for (const spec of suite.specs) {
                const specFile = spec.file || file;
                const classification = classifyTest(specFile);

                for (const t of spec.tests || []) {
                    const result = (t.results && t.results.length > 0) ? t.results[t.results.length - 1] : null;
                    
                    let status = 'skipped';
                    let duration = 0;
                    let error = null;

                    if (result) {
                        status = result.status; // passed, failed, timedOut, skipped
                        duration = result.duration || 0;
                        if (result.error) {
                            error = {
                                message: stripAnsi(result.error.message || ''),
                                stack: stripAnsi(result.error.stack || ''),
                                snippet: stripAnsi(result.error.snippet || ''),
                                location: result.error.location || null
                            };
                        }
                    } else if (t.status === 'expected') {
                        status = 'passed';
                    } else if (t.status === 'unexpected') {
                        status = 'failed';
                    }

                    // Normalize timedOut as failed
                    const isFailure = status === 'failed' || status === 'timedOut';
                    const normalizedStatus = isFailure ? 'failed' : status;

                    tests.push({
                        id: `test-${idCounter++}`,
                        module: classification.module,
                        subScreen: classification.subScreen,
                        file: specFile.replace(/\\/g, '/'),
                        title: spec.title,
                        status: normalizedStatus,
                        duration: duration,
                        durationFormatted: duration > 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`,
                        error: isFailure ? error : null
                    });
                }
            }
        }

        if (suite.suites && Array.isArray(suite.suites)) {
            for (const childSuite of suite.suites) {
                walkSuites(childSuite, file);
            }
        }
    }

    for (const rootSuite of rawResults.suites) {
        walkSuites(rootSuite, rootSuite.file || '');
    }

    return tests;
}

// Aggregate stats by module and sub-screens
function buildHierarchyStats(tests, rawResults) {
    const modules = {
        'Admin': { total: 0, passed: 0, failed: 0, skipped: 0, subScreens: {} },
        'Employee': { total: 0, passed: 0, failed: 0, skipped: 0, subScreens: {} },
        'Frequently Asked Questions': { total: 0, passed: 0, failed: 0, skipped: 0, subScreens: {} },
        'Practices': { total: 0, passed: 0, failed: 0, skipped: 0, subScreens: {} },
        'Reports': { total: 0, passed: 0, failed: 0, skipped: 0, subScreens: {} }
    };

    let grandTotal = 0;
    let grandPassed = 0;
    let grandFailed = 0;
    let grandSkipped = 0;
    let totalDurationMs = 0;

    for (const t of tests) {
        grandTotal++;
        totalDurationMs += t.duration || 0;

        if (t.status === 'passed') grandPassed++;
        else if (t.status === 'failed') grandFailed++;
        else grandSkipped++;

        const modName = modules[t.module] ? t.module : 'Admin';
        const mod = modules[modName];

        mod.total++;
        if (t.status === 'passed') mod.passed++;
        else if (t.status === 'failed') mod.failed++;
        else mod.skipped++;

        if (!mod.subScreens[t.subScreen]) {
            mod.subScreens[t.subScreen] = { total: 0, passed: 0, failed: 0, skipped: 0, failures: [] };
        }
        const sub = mod.subScreens[t.subScreen];
        sub.total++;
        if (t.status === 'passed') sub.passed++;
        else if (t.status === 'failed') {
            sub.failed++;
            sub.failures.push({
                id: t.id,
                title: t.title,
                file: t.file,
                durationFormatted: t.durationFormatted,
                error: t.error
            });
        } else {
            sub.skipped++;
        }
    }

    // Compute pass rates
    for (const mKey of Object.keys(modules)) {
        const m = modules[mKey];
        m.passRate = m.total > 0 ? Number(((m.passed / m.total) * 100).toFixed(1)) : 100;
        for (const sKey of Object.keys(m.subScreens)) {
            const s = m.subScreens[sKey];
            s.passRate = s.total > 0 ? Number(((s.passed / s.total) * 100).toFixed(1)) : 100;
        }
    }

    const durationMinutes = rawResults?.stats?.duration 
        ? Number((rawResults.stats.duration / 60000).toFixed(2))
        : Number((totalDurationMs / 60000).toFixed(2));

    const startTime = rawResults?.stats?.startTime || new Date().toISOString();

    return {
        summary: {
            date: startTime.split('T')[0],
            startTime,
            lastUpdated: new Date().toLocaleTimeString(),
            totalTests: grandTotal,
            passed: grandPassed,
            failed: grandFailed,
            skipped: grandSkipped,
            passRate: grandTotal > 0 ? Number(((grandPassed / grandTotal) * 100).toFixed(1)) : 100,
            durationMinutes,
            status: grandFailed > 0 ? 'FAILED' : 'PASSED'
        },
        modules
    };
}

// ============================================================
// API ENDPOINTS
// ============================================================

// 1. Overall Summary & Module/Sub-Screen hierarchy stats
app.get('/api/summary', (req, res) => {
    const rawResults = getRawResultsData(req.query.date);
    if (!rawResults) {
        return res.status(404).json({ error: 'No test report found. Run `npx playwright test` to generate results.' });
    }
    const tests = extractAllTests(rawResults);
    const hierarchy = buildHierarchyStats(tests, rawResults);
    res.json({
        ...hierarchy.summary,
        modules: hierarchy.modules
    });
});

// 2. Queryable Test Specs list with filtering by module, subScreen, status, search
app.get('/api/tests', (req, res) => {
    const rawResults = getRawResultsData(req.query.date);
    if (!rawResults) {
        return res.status(404).json({ error: 'No test report found.' });
    }
    let tests = extractAllTests(rawResults);

    const { module: modFilter, subScreen: subFilter, status: statusFilter, search } = req.query;

    if (modFilter && modFilter !== 'all') {
        tests = tests.filter(t => t.module.toLowerCase() === modFilter.toLowerCase());
    }

    if (subFilter && subFilter !== 'all') {
        tests = tests.filter(t => t.subScreen.toLowerCase() === subFilter.toLowerCase());
    }

    if (statusFilter && statusFilter !== 'all') {
        tests = tests.filter(t => t.status.toLowerCase() === statusFilter.toLowerCase());
    }

    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        tests = tests.filter(t => 
            t.title.toLowerCase().includes(q) || 
            t.file.toLowerCase().includes(q) || 
            (t.error?.message && t.error.message.toLowerCase().includes(q))
        );
    }

    res.json({
        total: tests.length,
        tests
    });
});

// 3. Historical Runs List
app.get('/api/history', (req, res) => {
    if (!fs.existsSync(historyDir)) return res.json([]);
    const folders = fs.readdirSync(historyDir, { withFileTypes: true });
    const history = [];

    for (const folder of folders) {
        if (!folder.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(folder.name)) continue;
        const date = folder.name;
        const summaryPath = path.join(historyDir, date, 'summary.json');
        const summary = readJsonFile(summaryPath);
        if (summary) {
            history.push(summary);
        } else {
            const raw = readJsonFile(path.join(historyDir, date, 'results.json'));
            if (raw) {
                const tests = extractAllTests(raw);
                const stats = buildHierarchyStats(tests, raw);
                history.push(stats.summary);
            }
        }
    }

    // Check if latest-results.json has completed results
    const latestPath = path.join(reportsDir, 'latest-results.json');
    if (fs.existsSync(latestPath)) {
        const raw = readJsonFile(latestPath);
        if (raw && raw.stats && (raw.stats.expected > 0 || raw.stats.unexpected > 0)) {
            const today = (raw.stats.startTime || new Date().toISOString()).split('T')[0];
            if (!history.find(h => h.date === today)) {
                const tests = extractAllTests(raw);
                const stats = buildHierarchyStats(tests, raw);
                history.push(stats.summary);
            }
        }
    }

    history.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(history);
});

// Serve Frontend Static Files
app.use(express.static(publicDir));

// Start Server
app.listen(PORT, () => {
    console.log('');
    console.log('==================================================');
    console.log('  SmartTracker 5-Page Automation Dashboard');
    console.log('==================================================');
    console.log(`  Dashboard URL: http://localhost:${PORT}`);
    console.log(`  Summary API:   http://localhost:${PORT}/api/summary`);
    console.log(`  Tests API:     http://localhost:${PORT}/api/tests`);
    console.log('==================================================');
});
