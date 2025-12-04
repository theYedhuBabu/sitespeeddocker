const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const paths = require('../config/paths');
const testController = require('../controllers/testController');

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, paths.containerUploadDirForMulter);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

router.post('/run-test', upload.single('script'), testController.runTest);
router.get('/tests', testController.getTests);
router.get('/tests/:testId', testController.getTest);
router.get('/comparison', testController.getComparison);

module.exports = router;
