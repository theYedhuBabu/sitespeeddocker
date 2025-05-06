const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const port = 3000;

// Configure multer to preserve file extensions
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Middleware to parse JSON request bodies
app.use(bodyParser.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Accepts a file upload and responds with the file path
app.post('/upload-file', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ filePath: req.file.path });
});

// API endpoint to receive configuration and run sitespeed.io
app.post('/run-sitespeed-test', (req, res) => {
    const config = req.body;
    console.log("Received configuration:", config);

    let extraArgs = '';

    if (config.browser) {
        extraArgs += ` -b ${config.browser}`;
    }
    if (config.iterations) {
        extraArgs += ` -n ${config.iterations}`;
    }

    if (Array.isArray(config.additionalOptions)) {
        config.additionalOptions.forEach(opt => {
            if (opt.includes('=') && !opt.startsWith('--')) {
                const [key, value] = opt.split('=');
                extraArgs += ` --${key} ${value}`;
            } else {
                extraArgs += ` ${opt}`;
            }
        });
    }

    let targetUrl = config.url;

    if (targetUrl && targetUrl.startsWith(path.join(__dirname, 'uploads'))) {
        targetUrl = targetUrl.replace(path.join(__dirname, 'uploads'), '/uploads');
    }

    const envVars = {
        ...process.env,
        TARGET_URL: targetUrl,
        EXTRA_ARGS: extraArgs.trim(),
    };

    const command = 'docker compose up --build --force-recreate --abort-on-container-exit sitespeed';

    console.log(`Executing command: ${command}`);
    console.log(`With environment variables: TARGET_URL=${envVars.TARGET_URL}`);

    const sitespeedProcess = exec(command, { cwd: __dirname, env: envVars });

    let stdout = '';
    let stderr = '';

    sitespeedProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        stdout += data;
    });

    sitespeedProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        stderr += data;
    });

    sitespeedProcess.on('close', (code) => {
        console.log(`sitespeed process exited with code ${code}`);
        if (code === 0) {
            res.json({ status: 'success', message: 'Sitespeed.io test completed successfully.', stdout, stderr });
        } else {
            res.status(500).json({ status: 'error', message: `Sitespeed.io test failed with code ${code}.`, stdout, stderr });
        }
    });

    sitespeedProcess.on('error', (error) => {
        console.error(`Failed to start sitespeed process: ${error}`);
        res.status(500).json({ status: 'error', message: 'Failed to start sitespeed process.', error: error.message });
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Sitespeed local runner backend listening at http://localhost:${port}`);
    console.log(`Open index.html in your browser to use the UI.`);
});