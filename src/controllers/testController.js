const sitespeedRunner = require('../services/sitespeedRunner');
const resultsProcessor = require('../services/resultsProcessor');
const testService = require('../services/testService');

async function runTest(req, res) {
    const { url, browser = 'chrome', iterations = 1 } = req.body;
    const scriptPath = req.file ? req.file.path : null;

    if (!url && !scriptPath) {
        return res.status(400).json({ error: 'URL or script file is required' });
    }

    const testRunId = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`Starting test run: ${testRunId} for ${url || 'script'}`);

    try {
        const output = await sitespeedRunner.runSitespeedTest(url, browser, iterations, scriptPath, testRunId);
        console.log(`Test ${testRunId} completed. Processing results...`);
        await resultsProcessor.processAndStoreDetailedResults(testRunId, browser, url);

        // Respond to the client after the test is complete
        res.json({ message: 'Test completed successfully', testId: testRunId, output });
    } catch (error) {
        console.error(`Test run ${testRunId} failed:`, error);
        res.status(500).json({ error: 'Test execution failed', details: error.message });
    }
}

async function getTests(req, res) {
    try {
        const tests = await testService.getTests();
        res.json(tests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getTest(req, res) {
    const { testId } = req.params;
    try {
        const data = await testService.getTest(testId);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getComparison(req, res) {
    const { testIds } = req.query;
    if (!testIds) {
        return res.status(400).json({ error: 'Missing testIds parameter' });
    }
    const ids = testIds.split(',');
    try {
        const data = await testService.getComparison(ids);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    runTest,
    getTests,
    getTest,
    getComparison
};
