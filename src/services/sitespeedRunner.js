const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const paths = require('../config/paths');

function runSitespeedTest(url, browser, iterations, scriptPath, testRunId) {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFolder = testRunId; // Use the ID as the folder name

        // Construct the Docker command
        // We use the HOST paths for mounting volumes in the sibling container
        // IMPORTANT: outputFolder must be inside the mounted /sitespeed.io/results directory
        let dockerCommand = `docker run --rm --network sitespeed-net -v "${paths.hostUploadsDir}:/sitespeed.io/uploads" -v "${paths.hostResultsDir}:/sitespeed.io/results" -v "${paths.hostSitespeedConfigPath}:/sitespeed.io/config.json" sitespeedio/sitespeed.io:36.2.0 --config /sitespeed.io/config.json --outputFolder /sitespeed.io/results/${outputFolder} --browsertime.iterations ${iterations} --browsertime.browser ${browser} ${url}`;

        if (scriptPath) {
            const scriptFileName = path.basename(scriptPath);
            dockerCommand += ` --multi /sitespeed.io/uploads/${scriptFileName}`;
        } else {
            dockerCommand += ` ${url}`;
        }

        console.log(`Executing Docker command: ${dockerCommand}`);

        exec(dockerCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing sitespeed.io: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.error(`sitespeed.io stderr: ${stderr}`);
            }
            console.log(`sitespeed.io stdout: ${stdout}`);
            resolve(stdout);
        });
    });
}

module.exports = {
    runSitespeedTest
};
