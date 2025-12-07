const { queryApi, influxBucket } = require('../config/influx');

async function getTests() {
    // Query to get unique test IDs and their metadata (URL, browser, timestamp)
    // We'll query the 'visualMetrics' measurement as it's a reliable indicator of a test run
    const fluxQuery = `
      from(bucket: "${influxBucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r["_measurement"] == "visualMetrics")
        |> group(columns: ["test_id", "url", "browser"])
        |> first()
        |> keep(columns: ["test_id", "url", "browser", "_time"])
        |> sort(columns: ["_time"], desc: true)
    `;

    const tests = [];
    await new Promise((resolve, reject) => {
        queryApi.queryRows(fluxQuery, {
            next(row, tableMeta) {
                const o = tableMeta.toObject(row);
                tests.push({
                    id: o.test_id,
                    url: o.url,
                    timestamp: o._time,
                    browser: o.browser
                });
            },
            error(error) {
                console.error('Error querying InfluxDB:', error);
                reject(error);
            },
            complete() {
                resolve();
            },
        });
    });
    return tests;
}

async function getTest(testId) {
    const fluxQuery = `
      from(bucket: "${influxBucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r["test_id"] == "${testId}")
    `;

    const data = [];
    await new Promise((resolve, reject) => {
        queryApi.queryRows(fluxQuery, {
            next(row, tableMeta) {
                const o = tableMeta.toObject(row);
                data.push(o);
            },
            error(error) {
                console.error('Error querying InfluxDB:', error);
                reject(error);
            },
            complete() {
                resolve();
            },
        });
    });
    return data;
}

async function getComparison(testIds) {
    const filterString = testIds.map(id => `r["test_id"] == "${id}"`).join(' or ');
    const fluxQuery = `
      from(bucket: "${influxBucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => ${filterString})
        |> filter(fn: (r) => r["_measurement"] == "visualMetrics") 
    `;

    const testsMap = new Map();

    await new Promise((resolve, reject) => {
        queryApi.queryRows(fluxQuery, {
            next(row, tableMeta) {
                const o = tableMeta.toObject(row);
                const testId = o.test_id;

                if (!testsMap.has(testId)) {
                    testsMap.set(testId, {
                        id: testId,
                        url: o.url,
                        timestamp: o._time,
                        browser: o.browser,
                        metrics: {
                            firstContentfulPaint: null,
                            largestContentfulPaint: null,
                            speedIndex: null,
                            pageLoadTime: null,
                            totalPageSize: null
                        }
                    });
                }

                const test = testsMap.get(testId);
                const metricName = o.metricName;
                const value = o._value;

                if (metricName === 'SpeedIndex') test.metrics.speedIndex = value;
                else if (metricName === 'firstContentfulPaint') test.metrics.firstContentfulPaint = value;
                else if (metricName === 'largestContentfulPaint') test.metrics.largestContentfulPaint = value;
                else if (metricName === 'pageLoadTime') test.metrics.pageLoadTime = value;
            },
            error(error) {
                console.error('Error querying InfluxDB:', error);
                reject(error);
            },
            complete() {
                resolve();
            },
        });
    });
    return Array.from(testsMap.values());
}

module.exports = {
    getTests,
    getTest,
    getComparison
};
