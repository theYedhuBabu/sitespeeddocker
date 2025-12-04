const path = require('path');

const containerUploadDirForMulter = process.env.CONTAINER_UPLOADS_DIR || '/app/uploads';
const containerResultsDir = process.env.CONTAINER_RESULTS_DIR || '/usr/share/nginx/html/results';
const containerSitespeedConfigPath = process.env.CONTAINER_SITESPEED_CONFIG_PATH || '/app/config/sitespeed-config.json';

const hostUploadsDir = process.env.HOST_UPLOADS_DIR;
const hostResultsDir = process.env.HOST_RESULTS_DIR;
const hostSitespeedConfigPath = process.env.HOST_SITESPEED_CONFIG_PATH;

module.exports = {
    containerUploadDirForMulter,
    containerResultsDir,
    containerSitespeedConfigPath,
    hostUploadsDir,
    hostResultsDir,
    hostSitespeedConfigPath
};
