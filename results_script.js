// DOM Elements
const testsTableBody = document.getElementById('testsTableBody');
const loaderTestList = document.getElementById('loaderTestList');
const noTestsMessage = document.getElementById('noTestsMessage');
const testDetailsModal = document.getElementById('testDetailsModal');
const closeModalButton = document.getElementById('closeModalButton');
const testDetailsContent = document.getElementById('testDetailsContent');
const loaderTestDetails = document.getElementById('loaderTestDetails');
const downloadReportButton = document.getElementById('downloadReportButton');

// Details modal elements
const detailsTestIdHeader = document.getElementById('detailsTestId'); // Renamed for clarity
const detailsUrl = document.getElementById('detailsUrl');
const detailsTimestamp = document.getElementById('detailsTimestamp');
const detailsBrowser = document.getElementById('detailsBrowser');
const detailsIterations = document.getElementById('detailsIterations');
const detailsMetricsSummary = document.getElementById('detailsMetricsSummary');

// URL Selector Elements
const urlSelectorContainer = document.getElementById('urlSelectorContainer');
const urlSelector = document.getElementById('urlSelector');

// Chart instances
let timingChartInstance = null;
let contentBreakdownChartInstance = null;
let comparisonChartInstance = null;

// Tabs
const tabTestList = document.getElementById('tabTestList');
const tabComparison = document.getElementById('tabComparison');
const testListContent = document.getElementById('testListContent');
const comparisonContent = document.getElementById('comparisonContent');
const compareSelectedButton = document.getElementById('compareSelectedButton');
const selectedCountSpan = document.getElementById('selectedCount');
const loaderComparison = document.getElementById('loaderComparison');
const comparisonResultsDiv = document.getElementById('comparisonResults');
const comparisonInstructions = document.getElementById('comparisonInstructions');

let currentRawDataForTestRun = null; // Stores all raw records for the currently opened test ID/run
let currentTestRunId = null; // Stores the current testId being viewed
let currentProcessedPageData = null; // Stores processed data for the selected page

// --- Configuration for Frontend Processing ---
// Prioritized field names for metric values from InfluxDB records
const METRIC_VALUE_FIELDS = ['_value', 'mean', 'median']; 
// Field name for PageXray asset size (e.g., 'contentSize' or 'transferSize')
// **IMPORTANT**: Ensure this matches the field available in your InfluxDB pagexray records
// Common options: 'contentSize', 'transferSize'. Check your InfluxDB data for records where origin='pagexray'.
const PAGEXRAY_ASSET_SIZE_FIELD = 'contentSize'; 

// --- Tab Switching ---
tabTestList.addEventListener('click', () => {
    tabTestList.classList.add('active');
    testListContent.classList.add('active');
    tabComparison.classList.remove('active');
    comparisonContent.classList.remove('active');
});

tabComparison.addEventListener('click', () => {
    tabComparison.classList.add('active');
    comparisonContent.classList.add('active');
    tabTestList.classList.remove('active');
    testListContent.classList.remove('active');
    renderComparisonView(); 
});


// --- Test List Fetching and Rendering ---
async function fetchTestRuns() {
    loaderTestList.style.display = 'block';
    noTestsMessage.classList.add('hidden');
    testsTableBody.innerHTML = ''; 
    compareSelectedButton.disabled = true;
    selectedCountSpan.textContent = '0';

    try {
        const response = await fetch('/api/tests');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const tests = await response.json();

        if (tests.length === 0) {
            noTestsMessage.classList.remove('hidden');
        } else {
            tests.forEach(test => {
                const row = testsTableBody.insertRow();
                // Display "Multiple URLs" or the primary URL if available from the summary
                const displayUrl = (test.url && !test.url.includes(',')) ? test.url : 'Multiple URLs / N/A';
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" class="test-checkbox rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" data-testid="${test.id}">
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${test.id}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${displayUrl}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(test.timestamp).toLocaleString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="viewTestDetails('${test.id}')" class="text-blue-600 hover:text-blue-900 hover:underline">View Details</button>
                    </td>
                `;
            });
            addCheckboxListeners();
        }
    } catch (error) {
        console.error('Error fetching test runs:', error);
        testsTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Error loading test runs.</td></tr>`;
    } finally {
        loaderTestList.style.display = 'none';
    }
}

function addCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.test-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateCompareButtonState);
    });
}

function updateCompareButtonState() {
    const selectedCheckboxes = document.querySelectorAll('.test-checkbox:checked');
    const count = selectedCheckboxes.length;
    selectedCountSpan.textContent = count;
    compareSelectedButton.disabled = count < 2 || count > 3;
}

compareSelectedButton.addEventListener('click', () => {
    const selectedCheckboxes = document.querySelectorAll('.test-checkbox:checked');
    const testIdsToCompare = Array.from(selectedCheckboxes).map(cb => cb.dataset.testid);
    
    tabComparison.click();
    fetchAndDisplayComparison(testIdsToCompare);
});

// --- Data Processing Helper ---
/**
 * Extracts a metric value from a list of raw InfluxDB records.
 * Prioritizes fields in METRIC_VALUE_FIELDS.
 * @param {Array<Object>} records - Array of raw InfluxDB records.
 * @param {String} measurementName - The _measurement name to look for.
 * @param {String} [fieldName=null] - Optional specific _field name.
 * @returns {Number|String|null} The metric value or null if not found.
 */
function getMetricValue(records, measurementName, fieldName = null) {
    const relevantRecords = records.filter(r => 
        r._measurement === measurementName && 
        (fieldName ? r._field === fieldName : true)
    );

    if (relevantRecords.length === 0) return null;

    // Try prioritized fields first
    for (const valueField of METRIC_VALUE_FIELDS) {
        for (const record of relevantRecords) { // Check all relevant records for these fields
            if (record[valueField] !== undefined && record[valueField] !== null) {
                const val = parseFloat(record[valueField]);
                return isNaN(val) ? record[valueField] : val; // Return raw if not a number (e.g. for string values)
            }
        }
    }
    // Fallback if no prioritized field found but records exist (e.g. _value might be the only one)
    // This part might be redundant if _value is already in METRIC_VALUE_FIELDS
    const firstRecord = relevantRecords[0];
    if (firstRecord && firstRecord._value !== undefined && firstRecord._value !== null) {
         const val = parseFloat(firstRecord._value);
         return isNaN(val) ? firstRecord._value : val;
    }
    return null;
}

/**
 * Processes a subset of raw InfluxDB records (for a specific page/URL) 
 * to structure data for display.
 * @param {Array<Object>} recordsForSelectedPage - Array of raw InfluxDB records filtered for a specific page.
 * @param {String} testRunId - The ID of the overall test run.
 * @param {String} [pageUrl=null] - The specific URL/page being processed.
 * @returns {Object|null} Structured test data for the page or null if processing fails.
 */
function processRecordsForPage(recordsForSelectedPage, testRunId, pageUrl = null) {
    if (!recordsForSelectedPage || recordsForSelectedPage.length === 0) {
        console.warn(`No records provided to processRecordsForPage for testId: ${testRunId}, URL: ${pageUrl}`);
        return { 
            id: testRunId, 
            pageUrl: pageUrl || 'N/A', 
            timestamp: null, browser: null, iterations: null,
            metrics: { visualMetrics: {} }, 
            pagexray: { contentTypes: [], totalRequests: 0, totalPageSize: 0 } 
        };
    }

    const processed = {
        id: testRunId,
        pageUrl: pageUrl, // The specific URL for these details
        timestamp: null,
        url: null, // This will be the specific page URL
        browser: null,
        iterations: null,
        metrics: { visualMetrics: {} },
        pagexray: { contentTypes: [], totalRequests: 0, totalPageSize: 0 },
        lighthouse: {}
    };

    let baseInfoRecord = recordsForSelectedPage.find(r => (r.url || r.group) && r.browser);
    if (!baseInfoRecord) baseInfoRecord = recordsForSelectedPage[0]; 

    if (baseInfoRecord) {
        processed.timestamp = baseInfoRecord._time || new Date().toISOString();
        // The 'url' field in 'processed' should be the specific pageUrl we are processing for
        processed.url = pageUrl || baseInfoRecord.url || baseInfoRecord.group || 'N/A'; 
        processed.browser = baseInfoRecord.browser || 'N/A';
        processed.iterations = baseInfoRecord.iterations || 'N/A'; 
    } else {
        processed.timestamp = new Date().toISOString();
        processed.url = pageUrl || 'N/A';
    }
    
    // Extract Metrics (operating on recordsForSelectedPage)
    processed.metrics.firstPaint = getMetricValue(recordsForSelectedPage, 'firstPaint') || getMetricValue(recordsForSelectedPage, 'first-paint');
    processed.metrics.firstContentfulPaint = getMetricValue(recordsForSelectedPage, 'firstContentfulPaint') || getMetricValue(recordsForSelectedPage, 'first-contentful-paint');
    processed.metrics.largestContentfulPaint = getMetricValue(recordsForSelectedPage, 'largestContentfulPaint');
    processed.metrics.speedIndex = getMetricValue(recordsForSelectedPage, 'SpeedIndex');
    processed.metrics.timeToFirstByte = getMetricValue(recordsForSelectedPage, 'ttfb');
    processed.metrics.domInteractiveTime = getMetricValue(recordsForSelectedPage, 'domInteractive') || getMetricValue(recordsForSelectedPage, 'domInteractiveTime');
    processed.metrics.pageLoadTime = getMetricValue(recordsForSelectedPage, 'pageLoadTime');
    processed.metrics.fullyLoaded = getMetricValue(recordsForSelectedPage, 'fullyLoaded');
    processed.metrics.cumulativeLayoutShift = getMetricValue(recordsForSelectedPage, 'cumulativeLayoutShift');
    processed.metrics.totalBlockingTime = getMetricValue(recordsForSelectedPage, 'totalBlockingTime');
    processed.metrics.firstInputDelay = getMetricValue(recordsForSelectedPage, 'firstInputDelay');
    processed.metrics.transferSize = getMetricValue(recordsForSelectedPage, 'transferSize');

    // Visual Metrics
    processed.metrics.visualMetrics.FirstVisualChange = getMetricValue(recordsForSelectedPage, 'FirstVisualChange');
    processed.metrics.visualMetrics.LastVisualChange = getMetricValue(recordsForSelectedPage, 'LastVisualChange');
    processed.metrics.visualMetrics.SpeedIndex = processed.metrics.speedIndex;
    processed.metrics.visualMetrics.LargestContentfulPaint = processed.metrics.largestContentfulPaint;
    processed.metrics.visualMetrics.VisualComplete85 = getMetricValue(recordsForSelectedPage, 'VisualComplete85');
    processed.metrics.visualMetrics.VisualComplete95 = getMetricValue(recordsForSelectedPage, 'VisualComplete95');
    processed.metrics.visualMetrics.VisualComplete99 = getMetricValue(recordsForSelectedPage, 'VisualComplete99');
    processed.metrics.visualMetrics.VisualReadiness = getMetricValue(recordsForSelectedPage, 'VisualReadiness');

    // PageXray Data (already filtered for the specific page/URL by the time it gets here)
    const pagexrayRecordsForThisPage = recordsForSelectedPage.filter(r => r.origin === 'pagexray' && r.summaryType === 'response' && r.contentType);
    const contentTypesAggregated = {};
    pagexrayRecordsForThisPage.forEach(r => {
        const type = r.contentType;
        if (!contentTypesAggregated[type]) {
            contentTypesAggregated[type] = { requests: 0, transferSize: 0 };
        }
        contentTypesAggregated[type].requests += 1;
        const size = parseInt(r[PAGEXRAY_ASSET_SIZE_FIELD], 10);
        if (!isNaN(size)) {
            contentTypesAggregated[type].transferSize += size;
        }
    });
    processed.pagexray.contentTypes = Object.entries(contentTypesAggregated).map(([type, data]) => ({
        type: type,
        requests: data.requests,
        transferSize: data.transferSize
    }));
    processed.pagexray.totalRequests = processed.pagexray.contentTypes.reduce((sum, ct) => sum + ct.requests, 0);
    
    if (processed.metrics.transferSize !== null && processed.metrics.transferSize !== undefined) {
        processed.metrics.totalPageSize = processed.metrics.transferSize;
        processed.pagexray.totalPageSize = processed.metrics.transferSize;
    } else {
        const calculatedSizeFromContentTypes = processed.pagexray.contentTypes.reduce((sum, ct) => sum + ct.transferSize, 0);
        processed.metrics.totalPageSize = calculatedSizeFromContentTypes;
        processed.pagexray.totalPageSize = calculatedSizeFromContentTypes;
    }
    
    const summaryMetrics = ['firstContentfulPaint', 'largestContentfulPaint', 'speedIndex', 'timeToFirstByte', 'pageLoadTime', 'totalPageSize'];
    summaryMetrics.forEach(key => {
        if (processed.metrics[key] === undefined || processed.metrics[key] === null) {
             processed.metrics[key] = null;
        }
    });
    console.log(`Processed data for page ${pageUrl || 'overall'}:`, JSON.stringify(processed, null, 2));
    return processed;
}

// --- Test Details Modal ---
async function viewTestDetails(testRunIdFromButton) {
    currentTestRunId = testRunIdFromButton; // Store the main test ID
    currentRawDataForTestRun = null; 
    currentProcessedPageData = null; 

    testDetailsModal.classList.remove('hidden');
    urlSelectorContainer.style.display = 'none'; // Hide selector initially
    urlSelector.innerHTML = ''; // Clear previous options
    testDetailsContent.style.display = 'none'; 
    loaderTestDetails.style.display = 'block';


    if (timingChartInstance) timingChartInstance.destroy();
    if (contentBreakdownChartInstance) contentBreakdownChartInstance.destroy();

    try {
        const response = await fetch(`/api/tests/${currentTestRunId}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.details || errorData.message || `HTTP error! status: ${response.status}`);
        }
        currentRawDataForTestRun = await response.json(); 

        if (!currentRawDataForTestRun || currentRawDataForTestRun.length === 0) {
            console.warn(`No raw data returned from API for testId: ${currentTestRunId}`);
            detailsTestIdHeader.textContent = `Test: ${currentTestRunId}`;
            testDetailsContent.innerHTML = `<p class="text-orange-500 text-center">No data found for this test run.</p>`;
            testDetailsContent.style.display = 'block';
            loaderTestDetails.style.display = 'none';
            return;
        }
        
        populateUrlSelector(currentRawDataForTestRun, currentTestRunId);

    } catch (error) {
        console.error('Error fetching raw test data:', error); 
        detailsTestIdHeader.textContent = `Test: ${currentTestRunId}`;
        testDetailsContent.innerHTML = `<p class="text-red-500 text-center">Error loading test data: ${error.message}</p>`;
        testDetailsContent.style.display = 'block'; 
        loaderTestDetails.style.display = 'none'; 
    }
}

function populateUrlSelector(allRecords, testRunId) {
    urlSelector.innerHTML = ''; 
    testDetailsContent.style.display = 'none'; 
    loaderTestDetails.style.display = 'block'; 

    const urls = [...new Set(allRecords.filter(r => r.origin === 'browsertime' || (r.url || r.group)) 
                                      .map(r => r.url || r.group)
                                      .filter(Boolean) 
                          )];
    console.log(`Found URLs for test ${testRunId}:`, urls);

    if (urls.length > 1) {
        detailsTestIdHeader.textContent = `Test: ${testRunId} (Select a Page)`;
        
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = `-- Select a Page/URL (${urls.length} found) --`;
        urlSelector.appendChild(defaultOption);

        urls.forEach(url => {
            const option = document.createElement('option');
            option.value = url;
            option.textContent = url.length > 70 ? url.substring(0, 67) + "..." : url;
            urlSelector.appendChild(option);
        });

        urlSelectorContainer.style.display = 'block';
        loaderTestDetails.style.display = 'none'; 

        urlSelector.onchange = () => {
            const selectedUrl = urlSelector.value;
            if (selectedUrl) {
                displayDetailsForSelectedUrl(selectedUrl, testRunId, currentRawDataForTestRun);
            } else {
                testDetailsContent.style.display = 'none';
                 if (timingChartInstance) timingChartInstance.destroy();
                 if (contentBreakdownChartInstance) contentBreakdownChartInstance.destroy();
            }
        };
    } else if (urls.length === 1) {
        urlSelectorContainer.style.display = 'none';
        displayDetailsForSelectedUrl(urls[0], testRunId, currentRawDataForTestRun);
    } else {
        console.warn("No distinct URLs/groups found, or URL/group tag missing in data for test:", testRunId, ". Displaying combined results for the test run.");
        urlSelectorContainer.style.display = 'none';
        displayDetailsForSelectedUrl(null, testRunId, currentRawDataForTestRun); 
    }
}

function displayDetailsForSelectedUrl(selectedUrl, testRunId, allRecordsForTestRun) {
    loaderTestDetails.style.display = 'block';
    testDetailsContent.style.display = 'none';
    if (timingChartInstance) timingChartInstance.destroy();
    if (contentBreakdownChartInstance) contentBreakdownChartInstance.destroy();

    const recordsForThisPage = selectedUrl 
        ? allRecordsForTestRun.filter(r => (r.url === selectedUrl || r.group === selectedUrl))
        : allRecordsForTestRun;

    if (recordsForThisPage.length === 0 && selectedUrl) {
        console.warn(`No records found for selected URL: ${selectedUrl} in test: ${testRunId}`);
        detailsTestIdHeader.textContent = `Test: ${testRunId} - Page: ${selectedUrl.substring(0,50)}...`;
        testDetailsContent.innerHTML = `<p class="text-orange-500 text-center">No specific data found for page: ${selectedUrl}.</p>`;
        testDetailsContent.style.display = 'block';
        loaderTestDetails.style.display = 'none';
        return;
    }
    
    currentProcessedPageData = processRecordsForPage(recordsForThisPage, testRunId, selectedUrl);

    if (!currentProcessedPageData) {
        console.error("Data processing returned null for page:", selectedUrl, "test:", testRunId);
        detailsTestIdHeader.textContent = `Test: ${testRunId}` + (selectedUrl ? ` - Page: ${selectedUrl.substring(0,50)}...` : '');
        testDetailsContent.innerHTML = `<p class="text-red-500 text-center">Error processing data for this page.</p>`;
        testDetailsContent.style.display = 'block';
        loaderTestDetails.style.display = 'none';
        return;
    }
    
    detailsTestIdHeader.textContent = `Test: ${currentProcessedPageData.id}` + (currentProcessedPageData.url && currentProcessedPageData.url !== 'N/A' ? ` - Page: ${currentProcessedPageData.url.substring(0,50)}...` : '');
    detailsUrl.textContent = currentProcessedPageData.url || 'N/A'; 
    detailsTimestamp.textContent = new Date(currentProcessedPageData.timestamp).toLocaleString();
    detailsBrowser.textContent = currentProcessedPageData.browser || 'N/A';
    detailsIterations.textContent = currentProcessedPageData.iterations || 'N/A';

    detailsMetricsSummary.innerHTML = ''; 
    const keyMetrics = {
        'First Contentful Paint': currentProcessedPageData.metrics.firstContentfulPaint,
        'Largest Contentful Paint': currentProcessedPageData.metrics.largestContentfulPaint,
        'Speed Index': currentProcessedPageData.metrics.speedIndex,
        'Time to First Byte': currentProcessedPageData.metrics.timeToFirstByte,
        'Page Load Time': currentProcessedPageData.metrics.pageLoadTime,
        'Total Page Size': currentProcessedPageData.metrics.totalPageSize !== null && currentProcessedPageData.metrics.totalPageSize !== undefined 
                           ? (currentProcessedPageData.metrics.totalPageSize / 1024).toFixed(2) + ' KB' 
                           : 'N/A',
    };

    for (const [label, value] of Object.entries(keyMetrics)) {
        const metricDiv = document.createElement('div');
        metricDiv.className = 'p-3 bg-gray-50 rounded-md shadow-sm';
        let displayValue = 'N/A';
        if (value !== undefined && value !== null) {
            displayValue = (typeof value === 'number' && (label.includes('Paint') || label.includes('Time') || label.includes('Byte') || label.includes('Speed Index'))) 
                         ? value.toFixed(0) + (label.includes('Size') || label.includes('Requests') ? '' : ' ms')
                         : value; 
        }
        metricDiv.innerHTML = `<h4 class="text-sm font-medium text-gray-500">${label}</h4><p class="text-lg font-semibold text-gray-800">${displayValue}</p>`;
        detailsMetricsSummary.appendChild(metricDiv);
    }
    
    testDetailsContent.style.display = 'block';
    loaderTestDetails.style.display = 'none';

    renderTimingChart(currentProcessedPageData.metrics);
    renderContentBreakdownChart(currentProcessedPageData.pagexray);
}


closeModalButton.addEventListener('click', () => {
    testDetailsModal.classList.add('hidden');
    currentRawDataForTestRun = null;
    currentTestRunId = null;
    currentProcessedPageData = null;
    urlSelectorContainer.style.display = 'none';
    urlSelector.innerHTML = '';
    testDetailsContent.style.display = 'none';
     if (timingChartInstance) timingChartInstance.destroy();
    if (contentBreakdownChartInstance) contentBreakdownChartInstance.destroy();
});

testDetailsModal.addEventListener('click', (event) => {
    if (event.target === testDetailsModal) {
        closeModalButton.click(); 
    }
});


function renderTimingChart(metrics) {
    const canvasContainer = document.getElementById('timingChartContainer'); 
    if (!canvasContainer) {
        console.error("Canvas container 'timingChartContainer' not found.");
        return;
    }
    
    if (!metrics) {
        console.warn('No metrics data provided for timing chart.');
        canvasContainer.innerHTML = '<p class="text-center text-gray-500 py-10">Timing data not available for this page.</p>';
        return;
    }

    let canvasElement = document.getElementById('timingChart');
    if (!canvasElement || canvasContainer.querySelector('p')) { // If p exists, canvas was replaced
        canvasContainer.innerHTML = '<canvas id="timingChart"></canvas>'; 
        canvasElement = document.getElementById('timingChart');
        if (!canvasElement) {
             console.error("Failed to create/find canvas 'timingChart' inside 'timingChartContainer'.");
             return;
        }
    }
    const ctx = canvasElement.getContext('2d');
    
    if (timingChartInstance) {
        timingChartInstance.destroy();
    }
    
    const chartData = [
        metrics.firstPaint, 
        metrics.firstContentfulPaint,
        metrics.largestContentfulPaint,
        metrics.speedIndex,
        metrics.timeToFirstByte,
        metrics.domInteractiveTime,
        metrics.pageLoadTime
    ].map(val => (val === null || val === undefined) ? 0 : Number(val));

    timingChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['First Paint', 'FCP', 'LCP', 'Speed Index', 'TTFB', 'DOM Interactive', 'Page Load Time'],
            datasets: [{
                label: 'Time (ms)',
                data: chartData,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.5)', 'rgba(54, 162, 235, 0.5)', 'rgba(255, 206, 86, 0.5)',
                    'rgba(75, 192, 192, 0.5)', 'rgba(153, 102, 255, 0.5)', 'rgba(255, 159, 64, 0.5)',
                    'rgba(99, 255, 132, 0.5)'
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)', 'rgba(255, 159, 64, 1)',
                    'rgba(99, 255, 132, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Milliseconds (ms)' } }
            },
            plugins: { legend: { display: false }, title: { display: true, text: 'Key Timing Metrics' } }
        }
    });
}

function renderContentBreakdownChart(pagexrayData) {
    const canvasContainer = document.getElementById('contentBreakdownChartContainer'); 
     if (!canvasContainer) {
        console.error("Canvas container 'contentBreakdownChartContainer' not found.");
        return;
    }

    if (!pagexrayData || !pagexrayData.contentTypes || pagexrayData.contentTypes.length === 0) {
        console.warn('No pagexray data for content breakdown chart.');
        canvasContainer.innerHTML = '<p class="text-center text-gray-500 py-10">Content breakdown data not available for this page.</p>';
        return;
    }
    
    let canvasElement = document.getElementById('contentBreakdownChart');
    if (!canvasElement || canvasContainer.querySelector('p')) { // If p exists, canvas was replaced
         canvasContainer.innerHTML = '<canvas id="contentBreakdownChart"></canvas>'; 
         canvasElement = document.getElementById('contentBreakdownChart');
         if(!canvasElement){
            console.error("Failed to create/find canvas 'contentBreakdownChart' inside 'contentBreakdownChartContainer'.");
            return;
         }
    }
    const ctx = canvasElement.getContext('2d');
    
    const labels = pagexrayData.contentTypes.map(ct => ct.type);
    const data = pagexrayData.contentTypes.map(ct => ct.requests); 
    const backgroundColors = [
        'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)', 'rgba(83, 102, 255, 0.7)', 'rgba(140,200,100,0.7)', 'rgba(200,100,140,0.7)'
    ];

    if (contentBreakdownChartInstance) {
        contentBreakdownChartInstance.destroy();
    }

    contentBreakdownChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Requests by Content Type',
                data: data,
                backgroundColor: backgroundColors.slice(0, labels.length),
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Content Breakdown (by number of requests)' } }
        }
    });
}

// --- Comparison View ---
async function fetchAndDisplayComparison(testIds) {
    if (testIds.length < 2 || testIds.length > 3) {
        comparisonInstructions.textContent = "Please select 2 or 3 tests to compare.";
        comparisonResultsDiv.innerHTML = '';
        if (comparisonChartInstance) comparisonChartInstance.destroy();
        return;
    }

    loaderComparison.classList.remove('hidden');
    comparisonResultsDiv.innerHTML = '';
    comparisonInstructions.textContent = "Loading comparison data...";
    if (comparisonChartInstance) comparisonChartInstance.destroy();

    try {
        const queryParams = testIds.map(id => `id=${encodeURIComponent(id)}`).join('&');
        const response = await fetch(`/api/tests/compare?${queryParams}`); 
        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.details || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const comparisonData = await response.json();

        if (!comparisonData || comparisonData.length === 0) {
            comparisonInstructions.textContent = "No data found for the selected tests for comparison.";
            return;
        }
        
        comparisonInstructions.textContent = `Comparing ${comparisonData.length} tests.`;
        renderComparisonCards(comparisonData);
        renderComparisonChart(comparisonData);

    } catch (error) {
        console.error('Error fetching comparison data:', error);
        comparisonResultsDiv.innerHTML = `<p class="text-red-500 col-span-full">Error loading comparison: ${error.message}</p>`;
        comparisonInstructions.textContent = "Error loading comparison data.";
    } finally {
        loaderComparison.classList.add('hidden');
    }
}

function renderComparisonCards(comparisonData) {
    comparisonResultsDiv.innerHTML = ''; 
    comparisonData.forEach(test => {
        const card = document.createElement('div');
        card.className = 'bg-gray-50 p-4 rounded-lg shadow';
        card.innerHTML = `
            <h3 class="text-lg font-semibold text-blue-700 mb-2">${test.id}</h3>
            <p class="text-sm text-gray-600 mb-1"><strong>URL:</strong> ${test.url || 'N/A'}</p>
            <p class="text-sm text-gray-600 mb-3"><strong>Date:</strong> ${new Date(test.timestamp).toLocaleDateString()}</p>
            <ul class="space-y-1 text-sm">
                 <li><strong>FCP:</strong> ${test.metrics?.firstContentfulPaint !== null && test.metrics?.firstContentfulPaint !== undefined ? test.metrics.firstContentfulPaint.toFixed(0) + ' ms' : 'N/A'}</li>
                <li><strong>LCP:</strong> ${test.metrics?.largestContentfulPaint !== null && test.metrics?.largestContentfulPaint !== undefined ? test.metrics.largestContentfulPaint.toFixed(0) + ' ms' : 'N/A'}</li>
                <li><strong>Speed Index:</strong> ${test.metrics?.speedIndex !== null && test.metrics?.speedIndex !== undefined ? test.metrics.speedIndex.toFixed(0) : 'N/A'}</li>
                <li><strong>Load Time:</strong> ${test.metrics?.pageLoadTime !== null && test.metrics?.pageLoadTime !== undefined ? test.metrics.pageLoadTime.toFixed(0) + ' ms' : 'N/A'}</li>
                <li><strong>Size:</strong> ${test.metrics?.totalPageSize !== null && test.metrics?.totalPageSize !== undefined 
                               ? (test.metrics.totalPageSize / 1024).toFixed(2) + ' KB' 
                               : 'N/A'}</li>
            </ul>
        `;
        comparisonResultsDiv.appendChild(card);
    });
}


function renderComparisonChart(comparisonData) {
    const canvasElement = document.getElementById('comparisonChart');
    if (!canvasElement) {
        console.error("Canvas element 'comparisonChart' not found.");
        return;
    }
    const ctx = canvasElement.getContext('2d');
    const labels = comparisonData.map(test => `${test.id.substring(0,10)}...(${new Date(test.timestamp).toLocaleDateString()})`);
    
    const fcpData = comparisonData.map(test => test.metrics?.firstContentfulPaint);
    const lcpData = comparisonData.map(test => test.metrics?.largestContentfulPaint);
    const speedIndexData = comparisonData.map(test => test.metrics?.speedIndex);
    const pageLoadTimeData = comparisonData.map(test => test.metrics?.pageLoadTime);

    const datasets = [
        { label: 'First Contentful Paint (ms)', data: fcpData, backgroundColor: 'rgba(255, 99, 132, 0.5)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 1 },
        { label: 'Largest Contentful Paint (ms)', data: lcpData, backgroundColor: 'rgba(54, 162, 235, 0.5)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 },
        { label: 'Speed Index', data: speedIndexData, backgroundColor: 'rgba(255, 206, 86, 0.5)', borderColor: 'rgba(255, 206, 86, 1)', borderWidth: 1 },
        { label: 'Page Load Time (ms)', data: pageLoadTimeData, backgroundColor: 'rgba(75, 192, 192, 0.5)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }
    ];

    if (comparisonChartInstance) comparisonChartInstance.destroy();
    comparisonChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Value (ms or score)' } } },
            plugins: { title: { display: true, text: 'Performance Metrics Comparison' }, legend: { position: 'top'} }
        }
    });
}

function renderComparisonView() {
    const selectedCheckboxes = document.querySelectorAll('.test-checkbox:checked');
    if (selectedCheckboxes.length >= 2 && selectedCheckboxes.length <=3) {
        const testIdsToCompare = Array.from(selectedCheckboxes).map(cb => cb.dataset.testid);
        fetchAndDisplayComparison(testIdsToCompare);
    } else if (selectedCheckboxes.length === 0 && comparisonResultsDiv.innerHTML === '') {
         comparisonInstructions.textContent = "Select 2 or 3 tests from the 'Test Runs' tab to compare.";
         comparisonResultsDiv.innerHTML = ''; 
         if (comparisonChartInstance) comparisonChartInstance.destroy();
    } else if (selectedCheckboxes.length < 2 || selectedCheckboxes.length > 3) {
        comparisonInstructions.textContent = "Please select 2 or 3 tests to compare.";
    }
}

// --- Report Download ---
downloadReportButton.addEventListener('click', () => {
    if (!currentProcessedPageData) { 
        alert('No page details loaded to generate a report. Please select a page from the dropdown if available.');
        return;
    }
    generateAndDownloadHtmlReport(currentProcessedPageData);
});

function generateAndDownloadHtmlReport(pageData) { 
    const timingChartBase64 = timingChartInstance ? timingChartInstance.toBase64Image() : '';
    const contentBreakdownChartBase64 = contentBreakdownChartInstance ? contentBreakdownChartInstance.toBase64Image() : '';

    const metricsHtml = Object.entries({
        'First Contentful Paint': pageData.metrics?.firstContentfulPaint,
        'Largest Contentful Paint': pageData.metrics?.largestContentfulPaint,
        'Speed Index': pageData.metrics?.speedIndex,
        'Time to First Byte': pageData.metrics?.timeToFirstByte,
        'Page Load Time': pageData.metrics?.pageLoadTime,
        'DOM Interactive': pageData.metrics?.domInteractiveTime,
        'Total Page Size': pageData.metrics?.totalPageSize !== null && pageData.metrics?.totalPageSize !== undefined 
                           ? (pageData.metrics.totalPageSize / 1024).toFixed(2) + ' KB' 
                           : 'N/A',
        'Total Requests': pageData.pagexray?.totalRequests
    }).map(([label, value]) => {
        let displayValue = 'N/A';
        if (value !== undefined && value !== null) {
             displayValue = (typeof value === 'number' && (label.includes('Paint') || label.includes('Time') || label.includes('Byte') || label.includes('Speed Index'))) 
                         ? value.toFixed(0) + (label.includes('Size') || label.includes('Requests') ? '' : ' ms')
                         : value; 
        }
        return `<li><strong>${label}:</strong> ${displayValue}</li>`;
    }).join('');


    const contentTypesHtml = pageData.pagexray?.contentTypes?.map(ct => 
        `<li>${ct.type}: ${ct.requests} requests, ${(ct.transferSize / 1024).toFixed(2)} KB</li>`
    ).join('') || '<li>No content breakdown available.</li>';

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Performance Test Report: ${pageData.id} - ${pageData.url || 'Overall'}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; color: #333; }
                .container { max-width: 900px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
                h1, h2, h3 { color: #2c3e50; }
                h1 { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 10px; }
                .section { margin-bottom: 30px; }
                .section h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; }
                ul { list-style-type: none; padding-left: 0; }
                li { margin-bottom: 8px; }
                strong { color: #555; }
                .chart-image { max-width: 100%; height: auto; border: 1px solid #eee; margin-top: 10px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Performance Test Report</h1>
                
                <div class="section">
                    <h2>Test Information</h2>
                    <ul>
                        <li><strong>Test ID:</strong> ${pageData.id}</li>
                        <li><strong>Page URL Tested:</strong> ${pageData.url || 'N/A'}</li>
                        <li><strong>Timestamp:</strong> ${new Date(pageData.timestamp).toLocaleString()}</li>
                        <li><strong>Browser:</strong> ${pageData.browser || 'N/A'}</li>
                        <li><strong>Iterations:</strong> ${pageData.iterations || 'N/A'}</li>
                    </ul>
                </div>

                <div class="section">
                    <h2>Key Metrics Summary</h2>
                    <ul>${metricsHtml}</ul>
                </div>

                <div class="section">
                    <h2>Timing Metrics</h2>
                    ${timingChartBase64 ? `<img src="${timingChartBase64}" alt="Timing Metrics Chart" class="chart-image">` : '<p>Timing chart not available.</p>'}
                </div>

                <div class="section">
                    <h2>Content Breakdown (by Requests)</h2>
                     ${contentBreakdownChartBase64 ? `<img src="${contentBreakdownChartBase64}" alt="Content Breakdown Chart" class="chart-image">` : '<p>Content breakdown chart not available.</p>'}
                    <h3>Details:</h3>
                    <ul>${contentTypesHtml}</ul>
                </div>
                
                <p style="text-align:center; font-size:0.8em; color:#777;">Report generated on ${new Date().toLocaleString()}</p>
            </div>
        </body>
        </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const pageNamePart = (pageData.url && pageData.url !== 'N/A') ? pageData.url.replace(/[^a-z0-9]/gi, '_').substring(0,30) : 'overall';
    a.download = `sitespeed_report_${pageData.id.replace(/[^a-z0-9]/gi, '_')}_${pageNamePart}.html`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    fetchTestRuns(); 
    // ---- NEW ----
    // Check for a testId in the URL and open its details automatically
    const params = new URLSearchParams(window.location.search);
    const testIdFromUrl = params.get('testId');
    if (testIdFromUrl) {
        // Use a short timeout to ensure the main test list has had a moment to start fetching,
        // although viewTestDetails is independent.
        setTimeout(() => {
            viewTestDetails(testIdFromUrl);
        }, 2000);
    }
});
