const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const testRoutes = require('./routes/testRoutes');
const paths = require('./config/paths');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public'))); // Serve static files from 'public' directory
app.use('/results', express.static(paths.containerResultsDir));

// Routes
app.use('/api', testRoutes);

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});