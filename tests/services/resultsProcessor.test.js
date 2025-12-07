const fs = require('fs');
const path = require('path');
const resultsProcessor = require('../../src/services/resultsProcessor');
const { getWriteApi, Point } = require('../../src/config/influx');

// Mock dependencies
jest.mock('fs');
jest.mock('../../src/config/influx');
jest.mock('../../src/config/paths', () => ({
    containerResultsDir: '/mock/results',
    containerUploadDirForMulter: '/mock/uploads'
}));

describe('resultsProcessor', () => {
    let writeApiMock;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Point to support chaining and state
        Point.mockImplementation(() => {
            return {
                tags: {},
                fields: {},
                tag: jest.fn(function (k, v) { this.tags[k] = v; return this; }),
                floatField: jest.fn(function (k, v) { this.fields[k] = v; return this; }),
                intField: jest.fn(function (k, v) { this.fields[k] = v; return this; }),
                stringField: jest.fn(function (k, v) { this.fields[k] = v; return this; }),
            };
        });

        writeApiMock = {
            useDefaultTags: jest.fn(),
            writePoint: jest.fn(),
            close: jest.fn().mockResolvedValue()
        };
        getWriteApi.mockReturnValue(writeApiMock);
    });

    describe('processAndStoreDetailedResults', () => {
        const testRunId = 'test_123';
        const browser = 'chrome';
        const url = 'http://example.com';

        it('should log error if pages directory does not exist', async () => {
            fs.existsSync.mockReturnValue(false);
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await resultsProcessor.processAndStoreDetailedResults(testRunId, browser, url);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Pages directory not found'));
            consoleSpy.mockRestore();
        });

        it('should process results when files exist', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(['page1']);

            const browsertimeData = {
                visualMetrics: {
                    SpeedIndex: { median: 1000 },
                    PerceptualSpeedIndex: 1200 // Raw number fallback
                },
                timings: {
                    firstPaint: 500,
                    pageTimings: {
                        domInteractiveTime: 600,
                        pageLoadTime: 2000
                    }
                },
                googleWebVitals: {
                    firstContentfulPaint: 500,
                    largestContentfulPaint: 800,
                    totalBlockingTime: 100
                },
                fullyLoaded: 3000,
                pageinfo: { url: 'http://example.com/page1' }
            };

            const coachData = {
                url: 'http://example.com/page1',
                advice: {
                    performance: {
                        score: 90,
                        adviceList: {
                            avoidScalingImages: {
                                score: 100,
                                title: 'Avoid scaling images',
                                description: '...'
                            }
                        }
                    }
                }
            };

            const pagexrayData = {
                url: 'http://example.com/page1',
                contentTypes: {
                    javascript: {
                        requests: 5,
                        transferSize: 10000,
                        contentSize: 50000
                    }
                }
            };

            fs.readFileSync.mockImplementation((filePath) => {
                if (filePath.includes('browsertime.run-1.json')) return JSON.stringify(browsertimeData);
                if (filePath.includes('coach.run-1.json')) return JSON.stringify(coachData);
                if (filePath.includes('pagexray.run-1.json')) return JSON.stringify(pagexrayData);
                return '{}';
            });

            await resultsProcessor.processAndStoreDetailedResults(testRunId, browser, url);

            // Verify InfluxDB writes
            expect(writeApiMock.writePoint).toHaveBeenCalled();

            // Check for Visual Metrics
            const calls = writeApiMock.writePoint.mock.calls;
            const speedIndexCall = calls.find(call => call[0].fields.value === 1000);
            expect(speedIndexCall).toBeDefined();

            // Check for Coach Advice
            const coachCall = calls.find(call => call[0].fields.score === 90);
            expect(coachCall).toBeDefined();

            // Check for PageXray
            const pagexrayCall = calls.find(call => call[0].fields.requests === 5);
            expect(pagexrayCall).toBeDefined();

            expect(writeApiMock.close).toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            fs.existsSync.mockImplementation(() => {
                throw new Error('File system error');
            });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await resultsProcessor.processAndStoreDetailedResults(testRunId, browser, url);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing detailed results'), expect.any(Error));
            expect(writeApiMock.close).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});
