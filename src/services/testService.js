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

module.exports = {
    getTests,
    getTest,
    getComparison
};
