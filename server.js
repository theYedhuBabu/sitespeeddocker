// server.js
const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config(); 

const app = express();
// __dirname is the directory where server.js is located.
// If server.js is in /app (as per Dockerfile), uploadDir will be /app/uploads

const uploadDir = process.env.UPLOADS_DIR; 
console.log(uploadDir + "blah")
// Ensure the upload directory exists when the server starts
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration for file uploadsß
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // The uploadDir should already exist, but double-check
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

app.use(express.json()); // Middleware to parse JSON bodies
app.use('/uploads', express.static(uploadDir)); // Serve uploaded files statically from /app/uploads
app.use('/results', express.static(path.join('/usr/share/nginx/html/results'))); // Serve results statically

// API endpoint for file uploads
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // req.file.filename is just the filename, e.g., file-123.html
  // The client will request it via /uploads/file-123.html
  res.json({ filePath: `/uploads/${req.file.filename}` });
});

// API endpoint to run Sitespeed.io test
app.post('/api/run-test', async (req, res) => {
  const { url, browser, iterations, additionalOptions = [] } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let sitespeedUrl = url;
  // If the URL is an uploaded file, convert it to a file path for Sitespeed.io
  if (url.startsWith('/uploads/')) {
    const filename = path.basename(url);
    // This path needs to be accessible *inside* the sitespeedio container
    // We mount the web container's /app/uploads to /app/uploads in the sitespeedio container
    sitespeedUrl = `file:///app/uploads/${filename}`;
  }

  // Path to the Sitespeed.io config file inside the 'web' container (copied by Dockerfile)
  const webContainerConfigPath = process.env.CONFIG_FILE; // e.g. /app/sitespeed-config.json
  // Path where the config file will be mounted inside the 'sitespeedio' container
  const sitespeedContainerConfigPath = '/tmp/sitespeed-config.json'; // Arbitrary path inside sitespeedio container

  // Construct the string for additional options from the UI
  // Ensure options are passed correctly, e.g. as "--option" or "--option=value"
  const optionsString = additionalOptions.map(opt => `${opt}`).join(' ');

  // Base directory for Sitespeed.io results, as seen from the 'web' container and Nginx
  const resultsBaseDirInWebContainer = '/usr/share/nginx/html/results';
  // Path where Sitespeed.io container will write its output
  const sitespeedOutputMountPath = '/sitespeed.io';
  const hostResultDir = process.env.RESULTS_DIR;
  // Path to the uploads directory in the 'web' container
  const uploadsDirInWebContainer = uploadDir; // e.g., /app/uploads
  // Path where the uploads directory will be mounted in the 'sitespeedio' container
  const sitespeedUploadsMountPath = '/app/uploads';


  // Construct the Docker command for Sitespeed.io
  const dockerCommand = `
    docker run --rm \
    --network sitespeed-net \
    -v ${hostResultDir}:${sitespeedOutputMountPath} \
    -v ${uploadsDirInWebContainer}:${sitespeedUploadsMountPath}:ro \
    -v ${webContainerConfigPath}:${sitespeedContainerConfigPath}:ro \
    my-sitespeedio \
    --config ${sitespeedContainerConfigPath} \
    --browser ${browser || 'chrome'} \
    -n ${iterations || 1} \
    ${optionsString} \
    "${sitespeedUrl}"
  `;
  // Note: browser and iterations from req.body will override values in sitespeed-config.json
  // Default to 'chrome' and 1 iteration if not provided in the request.

  console.log('Executing Sitespeed.io command:', dockerCommand);

  try {
    // Execute the Sitespeed.io Docker command
    // Increased maxBuffer to handle potentially large console output from Sitespeed.io
    const testProcess = exec(dockerCommand, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer

    let output = ''; // To accumulate stdout and stderr
    testProcess.stdout.on('data', (data) => {
      output += data;
      console.log('Sitespeed stdout:', data.toString()); // Log to server console
    });
    testProcess.stderr.on('data', (data) => {
      output += data;
      console.error('Sitespeed stderr:', data.toString()); // Log to server console
    });

    // Handle process completion
    testProcess.on('close', (code) => {
      console.log(`Sitespeed.io process exited with code ${code}`);
      if (code === 0) {
        // Successfully completed
        // Find the latest result directory created by Sitespeed.io
        // Sitespeed.io creates directories named after the domain and timestamp
        // The resultsBaseDirInWebContainer is where Nginx serves from and where Sitespeed.io writes (via volume mount)
        const resultDirs = fs.readdirSync(resultsBaseDirInWebContainer)
          .map(name => path.join(resultsBaseDirInWebContainer, name))
          .filter(source => fs.lstatSync(source).isDirectory())
          .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());


        const latestDirName = resultDirs.length > 0 ? path.basename(resultDirs[0]) : null;
        const resultUrl = latestDirName ? `/results/${latestDirName}/index.html` : null;

        res.json({
          status: 'success',
          output,
          resultUrl
        });
      } else {
        // Test failed
        res.status(500).json({
          status: 'error',
          error: `Test failed with exit code ${code}. Check server logs for Sitespeed.io output.`,
          output // Include the output in the error response for client-side display
        });
      }
    });

    testProcess.on('error', (err) => {
        console.error('Failed to start Sitespeed.io process:', err);
        res.status(500).json({
            status: 'error',
            error: `Failed to start Sitespeed.io process: ${err.message}`,
            output: output // Include any output gathered so far
        });
    });

  } catch (error) {
    console.error('Error executing Sitespeed.io command:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Upload directory: ${uploadDir}`);
  console.log(`Results served from: /usr/share/nginx/html/results`);
});
