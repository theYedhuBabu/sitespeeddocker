const testController = require('../../src/controllers/testController');
const sitespeedRunner = require('../../src/services/sitespeedRunner');
const resultsProcessor = require('../../src/services/resultsProcessor');
const testService = require('../../src/services/testService');

// Mock dependencies
jest.mock('../../src/services/sitespeedRunner');
jest.mock('../../src/services/resultsProcessor');
jest.mock('../../src/services/testService');

describe('testController', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            body: {},
            params: {},
            query: {},
            file: null
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };
    });

    describe('runTest', () => {
        it('should return 400 if no URL or script is provided', async () => {
            await testController.runTest(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'URL or script file is required' });
        });

        it('should run test successfully with URL', async () => {
            req.body.url = 'http://example.com';
            sitespeedRunner.runSitespeedTest.mockResolvedValue('output');
            resultsProcessor.processAndStoreDetailedResults.mockResolvedValue();

            await testController.runTest(req, res);

            expect(sitespeedRunner.runSitespeedTest).toHaveBeenCalled();
            expect(resultsProcessor.processAndStoreDetailedResults).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Test completed successfully',
                output: 'output'
            }));
        });

        it('should handle errors during test execution', async () => {
            req.body.url = 'http://example.com';
            sitespeedRunner.runSitespeedTest.mockRejectedValue(new Error('Test failed'));

            await testController.runTest(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Test execution failed', details: 'Test failed' });
        });
    });

    describe('getTests', () => {
        it('should return list of tests', async () => {
            const tests = [{ id: 'test_1' }];
            testService.getTests.mockResolvedValue(tests);

            await testController.getTests(req, res);

            expect(res.json).toHaveBeenCalledWith(tests);
        });

        it('should handle errors', async () => {
            testService.getTests.mockRejectedValue(new Error('DB error'));

            await testController.getTests(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'DB error' });
        });
    });

    describe('getTest', () => {
        it('should return test details', async () => {
            req.params.testId = 'test_1';
            const testData = { id: 'test_1', metrics: {} };
            testService.getTest.mockResolvedValue(testData);

            await testController.getTest(req, res);

            expect(res.json).toHaveBeenCalledWith(testData);
        });
    });

    describe('getComparison', () => {
        it('should return 400 if testIds are missing', async () => {
            await testController.getComparison(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return comparison data', async () => {
            req.query.testIds = 'test_1,test_2';
            const comparisonData = [{ id: 'test_1' }, { id: 'test_2' }];
            testService.getComparison.mockResolvedValue(comparisonData);

            await testController.getComparison(req, res);

            expect(testService.getComparison).toHaveBeenCalledWith(['test_1', 'test_2']);
            expect(res.json).toHaveBeenCalledWith(comparisonData);
        });
    });
});
