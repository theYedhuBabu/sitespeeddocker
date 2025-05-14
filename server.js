const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();
const { InfluxDB } = require('@influxdata/influxdb-client');

const app = express();

// --- InfluxDB Configuration ---
const influxUrl = process.env.INFLUXDB_URL;
const influxToken = process.env.DOCKER_INFLUXDB_INIT_ADMIN_TOKEN;
const influxOrg = process.env.DOCKER_INFLUXDB_INIT_ORG;
const influxBucket = process.env.DOCKER_INFLUXDB_INIT_BUCKET;

if (!influxUrl || !influxToken || !influxOrg || !influxBucket) {
  console.error("InfluxDB environment variables are not fully set. Check INFLUXDB_URL, DOCKER_INFLUXDB_INIT_ADMIN_TOKEN, DOCKER_INFLUXDB_INIT_ORG, DOCKER_INFLUXDB_INIT_BUCKET.");
} else {
  console.log(`InfluxDB configured with URL: ${influxUrl}, Org: ${influxOrg}, Bucket: ${influxBucket}`);
}

const influxDB = new InfluxDB({ url: influxUrl, token: influxToken });
const queryApi = influxDB.getQueryApi(influxOrg);

// --- Multer and File Setup ---
const containerUploadDirForMulter = process.env.CONTAINER_UPLOADS_DIR;
console.log("Multer upload directory (inside web container): " + containerUploadDirForMulter);

if (!containerUploadDirForMulter) {
  console.error("CONTAINER_UPLOADS_DIR environment variable is not set. This is required for Multer.");
} else if (!fs.existsSync(containerUploadDirForMulter)) {
  try {
    fs.mkdirSync(containerUploadDirForMulter, { recursive: true });
    console.log(`Created Multer upload directory: ${containerUploadDirForMulter}`);
  } catch (e) {
    console.error(`Error creating Multer upload directory ${containerUploadDirForMulter}:`, e);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(containerUploadDirForMulter)) {
      fs.mkdirSync(containerUploadDirForMulter, { recursive: true });
    }
    cb(null, containerUploadDirForMulter);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use('/uploads', express.static(containerUploadDirForMulter));
app.use('/results', express.static(process.env.CONTAINER_RESULTS_DIR));

// --- API Endpoints ---
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ filePath: `/uploads/${req.file.filename}` });
});

app.post('/api/run-test', async (req, res) => {
  const { url, browser, iterations, additionalOptions = [] } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let sitespeedUrl = url;
  if (url.startsWith('/uploads/')) {
    const filename = path.basename(url);
    sitespeedUrl = `file:///app/uploads/${filename}`;
  }

  const hostSitespeedConfigPath = process.env.HOST_SITESPEED_CONFIG_PATH;
  const sitespeedContainerConfigTarget = '/tmp/sitespeed-config.json';
  const optionsString = additionalOptions.map(opt => `${opt}`).join(' ');
  const hostResultsPath = process.env.HOST_RESULTS_DIR;
  const sitespeedOutputMountTarget = '/sitespeed.io';
  const hostUploadsPath = process.env.HOST_UPLOADS_DIR;
  const sitespeedUploadsMountTarget = '/app/uploads';

  if (!hostSitespeedConfigPath || !hostResultsPath || !hostUploadsPath) {
    console.error("Host path environment variables (HOST_SITESPEED_CONFIG_PATH, HOST_RESULTS_DIR, HOST_UPLOADS_DIR) are not fully set.");
    return res.status(500).json({ error: "Server configuration error: Host paths not set." });
  }

  const testRunId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  const sitespeedRunIdEnvVar = `-e SITESPEED_TEST_RUN_ID=${testRunId}`;

  const dockerCommand = `
    docker run --rm \
    --network sitespeed-net \
    ${sitespeedRunIdEnvVar} \
    -v "${hostResultsPath}":${sitespeedOutputMountTarget} \
    -v "${hostUploadsPath}":${sitespeedUploadsMountTarget}:ro \
    -v "${hostSitespeedConfigPath}":${sitespeedContainerConfigTarget}:ro \
    my-sitespeedio \
    --config ${sitespeedContainerConfigTarget} \
    --outputFolder ${testRunId} \
    --browser ${browser || 'chrome'} \
    -n ${iterations || 1} \
    ${optionsString} \
    "${sitespeedUrl}"
  `;

  console.log('Executing Sitespeed.io command:', dockerCommand);

  try {
    const testProcess = exec(dockerCommand, { maxBuffer: 1024 * 1024 * 10 });
    let output = '';
    testProcess.stdout.on('data', (data) => { output += data; console.log('Sitespeed stdout:', data.toString()); });
    testProcess.stderr.on('data', (data) => { output += data; console.error('Sitespeed stderr:', data.toString()); });

    testProcess.on('close', (code) => {
      console.log(`Sitespeed.io process exited with code ${code}`);
      if (code === 0) {
        const resultUrl = `/results/${testRunId}/index.html`;
        console.log("Test successful. Result URL (relative to Nginx):", resultUrl);
        res.json({
          status: 'success',
          output,
          resultUrl,
          testId: testRunId
        });
      } else {
        res.status(500).json({
          status: 'error',
          error: `Test failed with exit code ${code}. Check server logs for Sitespeed.io output.`,
          output
        });
      }
    });
    testProcess.on('error', (err) => {
      console.error('Failed to start Sitespeed.io process:', err);
      res.status(500).json({ status: 'error', error: `Failed to start Sitespeed.io process: ${err.message}`, output });
    });
  } catch (error) {
    console.error('Error executing Sitespeed.io command:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// GET /api/tests - List all test runs (summary)
app.get('/api/tests', async (req, res) => {
  // This query relies on 'test_id' tag being present from sitespeed-config.json
  // and SITESPEED_TEST_RUN_ID environment variable.
  const fluxQuery = `
    from(bucket: "${influxBucket}")
      |> range(start: -90d)
      |> filter(fn: (r) => exists r.test_id)
      |> group(columns: ["test_id"])
      |> sort(columns: ["_time"], desc: true)
      |> first()  // Apply first while _value is still available
      |> keep(columns: ["_time", "test_id", "url", "browser"])
      |> rename(columns: {_time: "timestamp", test_id: "id"})
      |> group()
      |> sort(columns: ["timestamp"], desc: true)
      |> yield(name: "test_runs_summary")
`;



  console.log("Executing InfluxDB query for /api/tests:", fluxQuery);
  const tests = [];
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(fluxQuery)) {
      const o = tableMeta.toObject(values);
      // Ensure all expected fields are present before pushing
      if (o.id && o.timestamp) { // url and browser might be optional or N/A
        tests.push({
          id: o.id,
          url: o.url || 'N/A', // Provide a default if URL is not tagged/present
          timestamp: o.timestamp,
          browser: o.browser || 'N/A' // Provide a default if browser is not tagged/present
        });
      } else {
        console.warn("Skipping a record in /api/tests due to missing id or timestamp:", o);
      }
    }
    if (tests.length === 0) {
      console.warn("/api/tests query returned no results. Verify that 'browsertime_pageSummary' measurements with a 'test_id' tag exist in InfluxDB within the queried range and that 'url' and 'browser' tags are present if expected.");
    }
    res.json(tests);
  } catch (error) {
    console.error('Error querying InfluxDB for test list:', error);
    res.status(500).json({ error: 'Failed to fetch test list from InfluxDB', details: error.message });
  }
});

// GET /api/tests/:id - Get detailed metrics for a specific test run
app.get('/api/tests/:id', async (req, res) => {
  const testId = req.params.id;

  const all_metrics_query = `
  import "influxdata/influxdb/v1"

  // Search all known measurements individually
  union(tables: [
    ${[
      "pageLoadTime",
      "firstContentfulPaint",
      "SpeedIndex",
      "fullyLoaded",
      "cumulativeLayoutShift",
      "firstInputDelay",
      "totalBlockingTime",
      "domInteractive",
      "connect",
      "ttfb",
      "transferSize",
      // add more as needed from your list
    ]
      .map(
        (m) => `
    from(bucket: "${influxBucket}")
      |> range(start: -90d)
      |> filter(fn: (r) => r._measurement == "${m}" and r.test_id == "${testId}")
      |> sort(columns: ["_time"], desc: false)`
      )
      .join(",\n")}
  ])
  |> yield(name: "test_details")
`;


  console.log(`Executing InfluxDB query for /api/tests/${testId}:`, all_metrics_query);
  const rawData = [];

  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(all_metrics_query)) {
      rawData.push(tableMeta.toObject(values));
    }

    if (rawData.length === 0)
      return res.status(404).json({ error: 'Test data not found for ID: ' + testId });

    const result = {
      id: testId,
      timestamp: null,
      url: null,
      browser: null,
      iterations: null,
      metrics: {},
      pagexray: { contentTypes: [], totalRequests: 0, totalSize: 0 },
      lighthouse: {}
    };

    // Pick one row from browsertime to extract metadata
    const browsertimeBase = rawData.find(
      r => r.test_id === testId
    );

    if (browsertimeBase) {
      result.timestamp = browsertimeBase._time;
      result.url = browsertimeBase.group || null;
      result.browser = browsertimeBase.browser || null;
      result.iterations = browsertimeBase.iterations || null;
    }

    rawData.forEach(r => {
      if (!r._measurement || !r._field) return;
    
      if (!result.metrics[r._measurement]) {
        result.metrics[r._measurement] = {};
      }
    
      result.metrics[r._measurement][r._field] = r._value;
    });
    

    result.pagexray.contentTypes = result.pagexray.contentTypes.filter(ct =>
      ct.type && (ct.requests > 0 || ct.transferSize > 0)
    );

    if (
      result.metrics &&
      result.metrics.visualMetrics &&
      typeof result.metrics.visualMetrics === 'string'
    ) {
      try {
        result.metrics.visualMetrics = JSON.parse(result.metrics.visualMetrics);
      } catch (e) {
        console.warn("Could not parse visualMetrics JSON for test " + testId, e);
      }
    }

    res.json(result);
  } catch (error) {
    console.error(`Error querying InfluxDB for test ${testId}:`, error);
    res.status(500).json({ error: 'Failed to fetch test details', details: error.message });
  }
});


// GET /api/tests/compare?id=1&id=2&id=3
app.get('/api/tests/compare', async (req, res) => {
  const ids = req.query.id;
  const testIds = Array.isArray(ids) ? ids : [ids].filter(id => id);
  if (!testIds || testIds.length === 0) return res.status(400).json({ error: 'No test IDs provided.' });

  const idFilters = testIds.map(id => `r.test_id == "${id}"`).join(" or ");
  const fluxQuery = `
    from(bucket: "${influxBucket}")
        |> range(start: -90d)
        |> filter(fn: (r) => ${idFilters}) // e.g., (r.test_id == "abc" or r.test_id == "xyz")
        |> filter(fn: (r) => exists r.test_id and r._measurement == "browsertime") // <-- use actual measurement name if "browsertime_pageSummary" is not found
        |> keep(columns: ["_time", "_field", "_value", "url", "test_id", "browser"])
        |> yield(name: "comparison_data")
`;

  console.log("Executing InfluxDB query for /api/tests/compare:", fluxQuery);
  const rawData = [];
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(fluxQuery)) {
      rawData.push(tableMeta.toObject(values));
    }
    const groupedByTestId = rawData.reduce((acc, curr) => {
      const id = curr.test_id;
      if (!acc[id]) {
        acc[id] = {
          id: id,
          url: curr.url,
          timestamp: curr._time,
          browser: curr.browser || 'N/A', // Default if browser tag is missing
          metrics: {}
        };
      }
      // This logic assumes all points for a given test_id in browsertime_pageSummary share the same _time, url, browser.
      // If multiple _time values exist for the same test_id, this might pick one arbitrarily for the top-level timestamp.
      // The `first()` in the /api/tests query is meant to give a single representative _time.
      acc[id].metrics[curr._field] = curr._value;
      return acc;
    }, {});
    res.json(Object.values(groupedByTestId));
  } catch (error) {
    console.error('Error querying InfluxDB for test comparison:', error);
    res.status(500).json({ error: 'Failed to fetch comparison data', details: error.message });
  }
});

// --- Server Initialization ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Uploads (inside web container) handled by Multer at: ${containerUploadDirForMulter}`);
  console.log(`Results (inside web container) served by Nginx from: ${process.env.CONTAINER_RESULTS_DIR}`);
  console.log(`Host config for Sitespeed.io: ${process.env.HOST_SITESPEED_CONFIG_PATH}`);
});
