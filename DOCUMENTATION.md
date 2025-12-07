# Comprehensive Application Documentation & Developer Guide

## 1. Introduction
This document is the **definitive guide** to the QBurst Performance Testing Application. It is written for developers of all levels, from beginners to experts. It explains not just *what* the code does, but *why* it is structured this way, and *how* to extend it.

The application is a **Performance Testing Platform** that wraps the industry-standard tool **Sitespeed.io**. It allows users to run tests against websites, capture performance metrics (like load time, rendering speed), and visualize them over time.

---

## 2. Architecture Deep Dive
The application uses a **Microservices Architecture** orchestrated by **Docker**. This means the application is split into separate, independent "services" that talk to each other.

### 2.1. Why this Architecture?
*   **Isolation**: If the testing engine (Sitespeed) crashes, it doesn't take down the web server.
*   **Scalability**: You could theoretically run the database on one server and the web app on another.
*   **Reproducibility**: Docker ensures the app runs exactly the same on your laptop as it does on a production server.

### 2.2. The Services
1.  **`web` (The Application)**:
    *   **Role**: The central hub. It serves the UI to the user and runs the logic to manage tests.
    *   **Tech**: Node.js (Backend) + Nginx (Web Server).
2.  **`influxdb` (The Database)**:
    *   **Role**: Stores the performance numbers.
    *   **Why InfluxDB?**: It is a "Time-Series Database", specifically designed to store data that changes over time (like "Page Load Time" at 10:00 AM, 10:05 AM, etc.).
3.  **`sitespeed-worker` (Ephemeral)**:
    *   **Role**: The "Runner". It is created *on demand* when a user clicks "Run Test" and destroyed when the test finishes.
    *   **Tech**: Sitespeed.io Docker Image (contains Chrome, Firefox, FFmpeg for video).

---

## 3. Project Structure Exploded
Here is what every file and folder does:

```text
/
├── config/
│   └── sitespeed-config.json  # Default settings passed to Sitespeed.io (e.g., "use Chrome", "3 iterations").
├── docker/
│   ├── Dockerfile.web         # Recipe for building the main app. Installs Node.js, Nginx, and copies code.
│   └── nginx.conf             # Rules for the web server. Says "Send /api requests to Node.js, serve files from /public".
├── public/                    # THE FRONTEND. Files here are sent directly to the user's browser.
│   ├── css/                   # Stylesheets (Visuals).
│   ├── js/                    # Scripts (Interactivity).
│   ├── index.html             # The "Run Test" page.
│   ├── results.html           # The "Test History" page.
│   └── detailed-report.html   # The "Deep Dive" page.
├── src/                       # THE BACKEND. The logic running on the server.
│   ├── config/                # Database connections and file paths.
│   ├── controllers/           # Request Handlers (The "Traffic Cops").
│   ├── routes/                # URL Definitions (The "Map").
│   ├── services/              # Business Logic (The "Workers").
│   └── app.js                 # The "Main" file that starts the server.
├── docker-compose.yml         # The "Blueprint". Tells Docker how to run all services together.
└── start.sh                   # A helper script to start everything with one command.
```

---

## 4. The Backend (`src`) - The Brains
The backend follows a **Controller-Service** pattern. This is a standard way to organize code to keep it clean.

### 4.1. `src/app.js` (The Entry Point)
This is the first file executed.
*   **What it does**:
    1.  Starts the Express web framework.
    2.  Sets up "Middleware" (tools to parse JSON data sent by users).
    3.  Connects the "Routes" (URL paths) to the application.
    4.  Starts listening on port 3000.

### 4.2. `src/routes/` (The Map)
Routes define the URLs your API accepts.
*   **Current File**: `testRoutes.js`
*   **Example**: `router.post('/run-test', ...)`
    *   This line says: "If a user sends a POST request to `/api/run-test`, execute the function `testController.runTest`."
*   **For New Developers**: If you want to add a new feature like "Delete Test", you would first add a line here: `router.delete('/tests/:id', testController.deleteTest)`.

### 4.3. `src/controllers/` (The Traffic Cops)
Controllers are responsible for **handling the request** and **sending the response**. They don't do the heavy lifting; they delegate that to Services.

*   **Current File**: `testController.js`
*   **Key Functions**:
    *   `runTest(req, res)`:
        1.  **Validates Input**: Checks if the user provided a URL.
        2.  **Calls Service**: Asks `sitespeedRunner` to run the test.
        3.  **Calls Service**: Asks `resultsProcessor` to save the data.
        4.  **Responds**: Sends JSON back to the user (`{ message: "Success" }`).
    *   `getComparison(req, res)`:
        1.  **Reads Input**: Gets the list of Test IDs from the URL.
        2.  **Calls Service**: Asks `testService` to fetch the data.
        3.  **Responds**: Sends the data as JSON.

*   **Future Controllers (Extensibility)**:
    *   **`UserController`**: If you add a login system, this would handle `login`, `logout`, `register`.
    *   **`ReportController`**: If you want to generate PDF reports, this would handle `downloadPDF`.
    *   **`AlertController`**: If you want to set up email alerts for slow tests, this would handle the configuration.

### 4.4. `src/services/` (The Workers)
Services contain the **Business Logic**. This is the most important part of the backend.

*   **`sitespeedRunner.js`**:
    *   **Role**: The "Docker Commander".
    *   **How it works**: It constructs a massive shell command (`docker run ...`) that launches the Sitespeed container. It mounts the `uploads` and `results` directories so the container can read scripts and write reports.
    *   **Key Concept**: It uses `child_process.exec` to run terminal commands from within Node.js.

*   **`resultsProcessor.js`**:
    *   **Role**: The "Translator".
    *   **How it works**: Sitespeed produces complex JSON files (`browsertime.json`). This service reads those files, finds the important numbers (like "SpeedIndex"), and converts them into a format InfluxDB understands (`Point`).
    *   **Key Concept**: It "flattens" the data. Instead of a nested JSON object, it creates individual data points: `TestID=123, Metric=SpeedIndex, Value=500ms`.

*   **`testService.js`**:
    *   **Role**: The "Librarian".
    *   **How it works**: It knows how to speak "Flux" (the query language of InfluxDB). It constructs queries to fetch data and formats it for the frontend.

---

## 5. The Frontend (`public`) - The Face
The frontend is "Static", meaning it is just files served to the browser. The browser does the work.

### 5.1. HTML (Structure)
*   **`index.html`**: Uses semantic tags (`<form>`, `<fieldset>`).
*   **`results.html`**: Uses a `<table>` for the list and `<div>` grids for the comparison view.

### 5.2. CSS (Style)
*   **Tailwind CSS**: We use Tailwind via CDN. This allows us to style elements using classes like `class="bg-blue-500 text-white p-4"`.
    *   `bg-blue-500`: Background color.
    *   `p-4`: Padding.
    *   `rounded`: Rounded corners.
*   **`css/style.css`**: Custom overrides (e.g., for the loading spinner).

### 5.3. JavaScript (Logic)
*   **`script.js`**:
    *   Listens for the "Run Test" button click.
    *   Uses `fetch()` to send data to the backend.
    *   Updates the DOM (Document Object Model) to show the "Running..." status.
*   **`results_script.js`**:
    *   Uses `Chart.js` to draw the bar charts.
    *   Dynamically creates HTML table rows based on the data received from the API.

---

## 6. The Database (InfluxDB)
InfluxDB is optimized for metrics.

*   **Bucket**: Think of this as a "Database" (named `mysitespeed`).
*   **Measurement**: Think of this as a "Table" (e.g., `visualMetrics`).
*   **Tags**: Indexed columns for fast searching (e.g., `test_id`, `url`, `browser`).
*   **Fields**: The actual values (e.g., `value` = 1200).

**Example Data Point**:
```text
Measurement: visualMetrics
Tags: test_id=test_123, url=google.com, browser=chrome
Field: value=450 (This represents 450ms)
Timestamp: 2023-10-27T10:00:00Z
```

---

## 7. Developer Guide: How to Extend

### Scenario A: Adding a "Delete Test" Feature
1.  **Backend (Controller)**:
    *   Open `src/controllers/testController.js`.
    *   Add a function `deleteTest(req, res)`.
    *   Inside, call a new service method `testService.deleteTest(id)`.
2.  **Backend (Service)**:
    *   Open `src/services/testService.js`.
    *   Add `deleteTest(id)`.
    *   Write a Flux query to delete data: `from(bucket: "mysitespeed") |> filter(fn: (r) => r.test_id == id) |> delete()`. (Note: InfluxDB deletion is complex, often better to just hide it or use retention policies).
    *   Also delete the folder in `results/`.
3.  **Backend (Route)**:
    *   Open `src/routes/testRoutes.js`.
    *   Add `router.delete('/tests/:testId', testController.deleteTest)`.
4.  **Frontend**:
    *   Open `public/results.html`.
    *   Add a "Delete" button to the table row.
    *   Open `public/js/results_script.js`.
    *   Add an event listener to call `fetch('/api/tests/' + id, { method: 'DELETE' })`.

### Scenario B: Adding a New Metric (e.g., "Cumulative Layout Shift")
1.  **Identify Source**: Check the `browsertime.json` file generated by Sitespeed to find where "CLS" is stored.
2.  **Backend (Processor)**:
    *   Open `src/services/resultsProcessor.js`.
    *   In the `processAndStoreDetailedResults` function, find where `additionalMetrics` are defined.
    *   Add `'cumulativeLayoutShift': googleWebVitals?.cumulativeLayoutShift`.
3.  **Frontend**:
    *   Open `public/js/detailed-report.js`.
    *   Add 'cumulativeLayoutShift' to the list of keys to extract.
    *   The UI will automatically render it because the code iterates over the keys!

### Scenario C: Creating a New Page (e.g., "Settings")
1.  **Frontend**:
    *   Create `public/settings.html`.
    *   Create `public/js/settings.js`.
    *   Add a link in `index.html` navigation.
2.  **Backend**:
    *   No changes needed! Nginx automatically serves any file in `public/`.

---

## 8. Troubleshooting
*   **"Docker command failed"**:
    *   Check if the `results` folder is writable.
    *   Ensure the Docker socket is mounted correctly in `docker-compose.yml`.
*   **"No data in graphs"**:
    *   Check the `resultsProcessor.js` logs. Did it find the `browsertime.json` file?
    *   Check InfluxDB. Is the bucket name correct in `.env`?
*   **"Frontend shows 404"**:
    *   Check `nginx.conf`. Is the proxy pass to port 3000 correct?

---

## 9. Conclusion
This application is designed to be a **platform**. It provides the core plumbing (running tests, saving data), but it is built to be extended. By adding new Controllers and Services, you can turn this into a full-fledged Performance Monitoring Suite with alerts, user management, and scheduled testing.
