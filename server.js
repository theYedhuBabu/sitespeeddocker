const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();
const { InfluxDB, flux } = require('@influxdata/influxdb-client');

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
if (!containerUploadDirForMulter) {
  console.error("CONTAINER_UPLOADS_DIR environment variable is not set.");
} else if (!fs.existsSync(containerUploadDirForMulter)) {
  try {
    fs.mkdirSync(containerUploadDirForMulter, { recursive: true });
    console.log(`Created Multer upload directory: ${containerUploadDirForMulter}`);
  } catch (e) {
    console.error(`Error creating Multer upload directory ${containerUploadDirForMulter}:`, e);
  }
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, containerUploadDirForMulter),
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
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ filePath: `/uploads/${req.file.filename}` });
});

app.post('/api/run-test', async (req, res) => {
  const { url, browser, iterations, additionalOptions = [] } = req.body;
  console.log(req.body)
  if (typeof url !== 'string' || url.trim() === '') {
    return res.status(400).json({ error: 'URL must be a non-empty string' });
  }

  let sitespeedUrl = url;
  if (url.startsWith('/uploads/')) {
    sitespeedUrl = `--multi "/app/uploads/${path.basename(url)}"`;
  }

  const hostSitespeedConfigPath = process.env.HOST_SITESPEED_CONFIG_PATH;
  const sitespeedContainerConfigTarget = '/tmp/sitespeed-config.json';
  const optionsString = additionalOptions.join(' ');
  const hostResultsPath = process.env.HOST_RESULTS_DIR;
  const sitespeedOutputMountTarget = '/sitespeed.io';
  const hostUploadsPath = process.env.HOST_UPLOADS_DIR;
  const sitespeedUploadsMountTarget = '/app/uploads';

  if (!hostSitespeedConfigPath || !hostResultsPath || !hostUploadsPath) {
    console.error("Host path environment variables (HOST_SITESPEED_CONFIG_PATH, HOST_RESULTS_DIR, HOST_UPLOADS_DIR) are not fully set.");
    return res.status(500).json({ error: "Server configuration error: Host paths not set." });
  }

  const testRunId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const sitespeedRunIdEnvVar = `--influxdb.tags test_id=${testRunId}`;

  const dockerCommand = `
    docker run --rm \
    --network sitespeed-net \
    -v "${hostResultsPath}":${sitespeedOutputMountTarget} \
    -v "${hostUploadsPath}":${sitespeedUploadsMountTarget}:ro \
    -v "${hostSitespeedConfigPath}":${sitespeedContainerConfigTarget}:ro \
    my-sitespeedio \
    --config ${sitespeedContainerConfigTarget} \
    ${sitespeedRunIdEnvVar} \
    --outputFolder ${testRunId} \
    --browser ${browser || 'chrome'} \
    -n ${iterations || 1} \
    ${optionsString} \
    ${sitespeedUrl}
  `;
  console.log('Executing Sitespeed.io command:', dockerCommand);
  try {
    const testProcess = exec(dockerCommand, { maxBuffer: 10 * 1024 * 1024 });
    let procOutput = '';
    testProcess.stdout.on('data', (data) => { procOutput += data; console.log('Sitespeed stdout:', data.toString().trim()); });
    testProcess.stderr.on('data', (data) => { procOutput += data; console.error('Sitespeed stderr:', data.toString().trim()); });
    testProcess.on('close', (code) => {
      console.log(`Sitespeed.io process exited with code ${code}`);
      if (code === 0) {
        res.json({ status: 'success', output: procOutput, resultUrl: `/results/${testRunId}/index.html`, testId: testRunId });
      } else {
        res.status(500).json({ status: 'error', error: `Test failed. Exit code: ${code}`, output: procOutput });
      }
    });
    testProcess.on('error', (err) => {
      console.error('Failed to start Sitespeed.io process:', err);
      res.status(500).json({ status: 'error', error: `Process start error: ${err.message}`, output: procOutput });
    });
  } catch (error) {
    console.error('Error executing Sitespeed.io command:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.get('/api/tests', async (req, res) => {
  const fluxQuery = `
    from(bucket: "${influxBucket}")
      |> range(start: -90d)
      |> filter(fn: (r) => exists r.test_id)
      |> group(columns: ["test_id"])
      |> sort(columns: ["_time"], desc: true)
      |> first()
      |> keep(columns: ["_time", "test_id", "url", "browser", "group"])
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
      if (o.id && o.timestamp) {
        tests.push({
          id: o.id,
          url: o.url || o.group || 'N/A',
          timestamp: o.timestamp,
          browser: o.browser || 'N/A'
        });
      }
    }
    res.json(tests);
  } catch (error) {
    console.error('Error querying InfluxDB for test list:', error);
    res.status(500).json({ error: 'Failed to fetch test list', details: error.message });
  }
});

// GET /api/tests/:id - Get ALL raw data for a specific test run
app.get('/api/tests/:id', async (req, res) => {
  const testId = req.params.id;

  // This query fetches all data points associated with the test_id.
  // The frontend will be responsible for processing this raw data.
  const rawDataQuery = `
    import "influxdata/influxdb/v1"

    from(bucket: "${influxBucket}")
      |> range(start: -90d) // Adjust range as needed, but -90d covers most recent tests
      |> filter(fn: (r) => r.test_id == "${testId}")
      // No specific measurement or field filters here; get everything for this test_id
      // Keep all relevant columns that might be needed by the frontend
      |> keep(columns: [
          "_time", "_start", "_stop", "_measurement", "_field", "_value", 
          "test_id", "url", "browser", "group", "iterations", "origin", 
          "summaryType", "contentType", "status", "contentSize", "transferSize" 
          // Add any other potentially relevant tags or fields you might have
      ])
      |> yield(name: "all_test_data")
  `;

  console.log(`Executing InfluxDB query for ALL raw data for testId ${testId}: ${rawDataQuery}`);
  const allRecords = [];

  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(rawDataQuery)) {
      allRecords.push(tableMeta.toObject(values));
    }
    console.log(`Fetched ${allRecords.length} raw records for testId ${testId}.`);

    if (allRecords.length === 0) {
      console.warn(`No data found in InfluxDB for test ID: ${testId}.`);
      // It's better to send an empty array and let frontend handle "not found"
      // than sending a 404, as the query itself might be valid but yield no results.
      // However, if testId itself is invalid, a 404 might be appropriate earlier.
      // For now, sending empty array.
    }
    
    // --- START: Output allRecords object to JSON file for debugging ---
    // const debugOutputDir = path.join(__dirname, 'debug_output');
    // if (!fs.existsSync(debugOutputDir)) {
    //   fs.mkdirSync(debugOutputDir, { recursive: true });
    // }
    // const outputFilePath = path.join(debugOutputDir, `raw_test_data_${testId}.json`);
    // fs.writeFile(outputFilePath, JSON.stringify(allRecords, null, 2), (err) => {
    //   if (err) {
    //     console.error(`Error writing raw debug JSON file for ${testId}:`, err);
    //   } else {
    //     console.log(`Successfully wrote raw debug JSON for ${testId} to ${outputFilePath}`);
    //   }
    // });
    // --- END: Output allRecords object to JSON file for debugging ---


    res.json(allRecords); // Send the raw array of records

  } catch (error) {
    console.error(`Error in /api/tests/${testId} endpoint querying InfluxDB:`, error.message);
    console.error("Full Error Object:", error); 
    res.status(500).json({ error: 'Failed to fetch raw test data due to a server error.', details: error.message });
  }
});


app.get('/api/tests/compare', async (req, res) => {
  const ids = req.query.id;
  const testIds = Array.isArray(ids) ? ids : [ids].filter(id => id);
  if (!testIds || testIds.length === 0) return res.status(400).json({ error: 'No test IDs provided.' });

  const idFilters = testIds.map(id => `r.test_id == "${id}"`).join(" or ");

  const fluxQuery = `
    from(bucket: "${influxBucket}")
      |> range(start: -90d)
      |> filter(fn: (r) => ${idFilters})
      |> filter(fn: (r) => r._measurement == "firstContentfulPaint" or 
                           r._measurement == "largestContentfulPaint" or
                           r._measurement == "SpeedIndex" or
                           r._measurement == "pageLoadTime" or
                           r._measurement == "transferSize" 
                           )
      |> filter(fn: (r) => r._field == "value" or r._field == "mean" or r._field == "median") 
      |> group(columns: ["test_id", "_measurement"]) 
      |> sort(columns: ["_time"], desc: false)
      |> first() 
      |> keep(columns: ["_time", "_measurement", "_value", "url", "test_id", "browser", "group"])
      |> group() 
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
          url: curr.url || curr.group || 'N/A',
          timestamp: curr._time,
          browser: curr.browser || 'N/A',
          metrics: {}
        };
      }
      let metricKey = curr._measurement;
      if (metricKey === "SpeedIndex") metricKey = "speedIndex";
      else if (metricKey === "transferSize") metricKey = "totalPageSize";
      
      acc[id].metrics[metricKey] = parseFloat(curr._value) || curr._value;
      
      if (curr.url || curr.group) acc[id].url = curr.url || curr.group;
      if (curr.browser) acc[id].browser = curr.browser;
      if (curr._time) acc[id].timestamp = curr._time; 

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
});
