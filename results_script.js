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
const detailsTestId = document.getElementById('detailsTestId');
const detailsUrl = document.getElementById('detailsUrl');
const detailsTimestamp = document.getElementById('detailsTimestamp');
const detailsBrowser = document.getElementById('detailsBrowser');
const detailsIterations = document.getElementById('detailsIterations');
const detailsMetricsSummary = document.getElementById('detailsMetricsSummary');

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

let currentProcessedDetailedTest = null; // Store processed data for the currently viewed detailed test

// --- Configuration for Frontend Processing ---
// Prioritized field names for metric values
const METRIC_VALUE_FIELDS = ['_value', 'mean', 'median']; 
// Field name for PageXray asset size (e.g., 'contentSize' or 'transferSize')
// **IMPORTANT**: Ensure this matches the field available in your InfluxDB pagexray records
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
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" class="test-checkbox rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" data-testid="${test.id}">
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${test.id}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${test.url || 'N/A'}</td>
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
function getMetricValue(records, measurementName, fieldName = null) {
    const relevantRecords = records.filter(r => r._measurement === measurementName && (fieldName ? r._field === fieldName : true));
    if (relevantRecords.length === 0) return null;

    // Try prioritized fields
    for (const valueField of METRIC_VALUE_FIELDS) {
        const recordWithValue = relevantRecords.find(r => r[valueField] !== undefined && r[valueField] !== null);
        if (recordWithValue) {
            const val = parseFloat(recordWithValue[valueField]);
            return isNaN(val) ? recordWithValue[valueField] : val;
        }
    }
    // Fallback if no prioritized field found but records exist (might have value in other field)
    if (relevantRecords[0]._value !== undefined && relevantRecords[0]._value !== null) {
         const val = parseFloat(relevantRecords[0]._value);
         return isNaN(val) ? relevantRecords[0]._value : val;
    }
    return null;
}


function processRawDataForDetails(rawRecords, testId) {
    if (!rawRecords || rawRecords.length === 0) {
        console.warn(`No raw records provided for processing for testId: ${testId}`);
        return null;
    }

    const processed = {
        id: testId,
        timestamp: null,
        url: null,
        browser: null,
        iterations: null,
        metrics: { visualMetrics: {} },
        pagexray: { contentTypes: [], totalRequests: 0, totalPageSize: 0 },
        lighthouse: {} // Placeholder
    };

    // Extract General Info (from the first record that has it, or a browsertime record)
    let baseInfoRecord = rawRecords.find(r => r.test_id === testId && (r.url || r.group) && r.browser);
    if (!baseInfoRecord) baseInfoRecord = rawRecords.find(r => r.test_id === testId); // Fallback to any record for timestamp

    if (baseInfoRecord) {
        processed.timestamp = baseInfoRecord._time || new Date().toISOString();
        processed.url = baseInfoRecord.url || baseInfoRecord.group || 'N/A';
        processed.browser = baseInfoRecord.browser || 'N/A';
        processed.iterations = baseInfoRecord.iterations || 'N/A';
    } else { // Absolute fallback
        processed.timestamp = new Date().toISOString();
        console.warn(`Could not derive base info for testId ${testId}`);
    }

    // Extract Metrics
    processed.metrics.firstPaint = getMetricValue(rawRecords, 'firstPaint') || getMetricValue(rawRecords, 'first-paint');
    processed.metrics.firstContentfulPaint = getMetricValue(rawRecords, 'firstContentfulPaint') || getMetricValue(rawRecords, 'first-contentful-paint');
    processed.metrics.largestContentfulPaint = getMetricValue(rawRecords, 'largestContentfulPaint');
    processed.metrics.speedIndex = getMetricValue(rawRecords, 'SpeedIndex'); // Sitespeed.io often uses 'SpeedIndex'
    processed.metrics.timeToFirstByte = getMetricValue(rawRecords, 'ttfb');
    processed.metrics.domInteractiveTime = getMetricValue(rawRecords, 'domInteractive') || getMetricValue(rawRecords, 'domInteractiveTime');
    processed.metrics.pageLoadTime = getMetricValue(rawRecords, 'pageLoadTime');
    processed.metrics.fullyLoaded = getMetricValue(rawRecords, 'fullyLoaded');
    processed.metrics.cumulativeLayoutShift = getMetricValue(rawRecords, 'cumulativeLayoutShift');
    processed.metrics.totalBlockingTime = getMetricValue(rawRecords, 'totalBlockingTime');
    processed.metrics.firstInputDelay = getMetricValue(rawRecords, 'firstInputDelay');
    processed.metrics.transferSize = getMetricValue(rawRecords, 'transferSize'); // This will be used for totalPageSize

    // Extract Visual Metrics
    processed.metrics.visualMetrics.FirstVisualChange = getMetricValue(rawRecords, 'FirstVisualChange');
    processed.metrics.visualMetrics.LastVisualChange = getMetricValue(rawRecords, 'LastVisualChange');
    processed.metrics.visualMetrics.SpeedIndex = processed.metrics.speedIndex; // Reuse already fetched SpeedIndex
    processed.metrics.visualMetrics.LargestContentfulPaint = processed.metrics.largestContentfulPaint; // Reuse LCP
    // Add other visual metrics if available in your `rawRecords` by their measurement name
    // e.g., processed.metrics.visualMetrics.VisualComplete85 = getMetricValue(rawRecords, 'VisualComplete85');


    // Process PageXray Data
    const pagexrayRecords = rawRecords.filter(r => r.origin === 'pagexray' && r.summaryType === 'response' && r.contentType);
    const contentTypesAggregated = {};

    pagexrayRecords.forEach(r => {
        const type = r.contentType;
        if (!contentTypesAggregated[type]) {
            contentTypesAggregated[type] = { requests: 0, transferSize: 0 };
        }
        contentTypesAggregated[type].requests += 1;
        const size = parseInt(r[PAGEXRAY_ASSET_SIZE_FIELD], 10); // Use configured field
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
    
    // Set totalPageSize from the direct 'transferSize' metric if available, otherwise sum from pagexray
    if (processed.metrics.transferSize !== null && processed.metrics.transferSize !== undefined) {
        processed.metrics.totalPageSize = processed.metrics.transferSize;
        processed.pagexray.totalPageSize = processed.metrics.transferSize;
    } else {
        const calculatedSizeFromContentTypes = processed.pagexray.contentTypes.reduce((sum, ct) => sum + ct.transferSize, 0);
        processed.metrics.totalPageSize = calculatedSizeFromContentTypes;
        processed.pagexray.totalPageSize = calculatedSizeFromContentTypes;
    }
    
    // Ensure key metrics for summary display are at least null
    const summaryMetrics = ['firstContentfulPaint', 'largestContentfulPaint', 'speedIndex', 'timeToFirstByte', 'pageLoadTime', 'totalPageSize'];
    summaryMetrics.forEach(key => {
        if (processed.metrics[key] === undefined) processed.metrics[key] = null;
    });


    console.log("Processed data for details view:", JSON.stringify(processed, null, 2));
    return processed;
}


// --- Test Details Modal ---
async function viewTestDetails(testId) {
    currentProcessedDetailedTest = null; 
    testDetailsModal.classList.remove('hidden');
    loaderTestDetails.style.display = 'block';
    testDetailsContent.style.display = 'none'; 

    if (timingChartInstance) timingChartInstance.destroy();
    if (contentBreakdownChartInstance) contentBreakdownChartInstance.destroy();

    try {
        const response = await fetch(`/api/tests/${testId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rawRecords = await response.json(); // This is now an array of raw records

        if (!rawRecords || rawRecords.length === 0) {
            console.warn(`No raw data returned from API for testId: ${testId}`);
            testDetailsContent.innerHTML = `<p class="text-orange-500 text-center">No data found for this test run.</p>`;
            testDetailsContent.style.display = 'block';
            loaderTestDetails.style.display = 'none';
            return;
        }
        
        const processedData = processRawDataForDetails(rawRecords, testId);
        currentProcessedDetailedTest = processedData; 

        if (!processedData) {
             throw new Error("Failed to process raw data on the frontend.");
        }

        detailsTestId.textContent = processedData.id;
        detailsUrl.textContent = processedData.url || 'N/A';
        detailsTimestamp.textContent = new Date(processedData.timestamp).toLocaleString();
        detailsBrowser.textContent = processedData.browser || 'N/A';
        detailsIterations.textContent = processedData.iterations || 'N/A';

        detailsMetricsSummary.innerHTML = ''; 
        const keyMetrics = {
            'First Contentful Paint': processedData.metrics.firstContentfulPaint,
            'Largest Contentful Paint': processedData.metrics.largestContentfulPaint,
            'Speed Index': processedData.metrics.speedIndex,
            'Time to First Byte': processedData.metrics.timeToFirstByte,
            'Page Load Time': processedData.metrics.pageLoadTime,
            'Total Page Size': processedData.metrics.totalPageSize ? (processedData.metrics.totalPageSize / 1024).toFixed(2) + ' KB' : 'N/A',
        };

        for (const [label, value] of Object.entries(keyMetrics)) {
            const metricDiv = document.createElement('div');
            metricDiv.className = 'p-3 bg-gray-50 rounded-md shadow-sm';
            metricDiv.innerHTML = `<h4 class="text-sm font-medium text-gray-500">${label}</h4><p class="text-lg font-semibold text-gray-800">${value !== undefined && value !== null ? value : 'N/A'}</p>`;
            detailsMetricsSummary.appendChild(metricDiv);
        }
        
        testDetailsContent.style.display = 'block';
        loaderTestDetails.style.display = 'none';

        renderTimingChart(processedData.metrics);
        renderContentBreakdownChart(processedData.pagexray);

    } catch (error) {
        console.error('Error fetching or processing test details:', error); 
        testDetailsContent.innerHTML = `<p class="text-red-500 text-center">Error loading test details. ${error.message}</p>`;
        testDetailsContent.style.display = 'block'; 
        loaderTestDetails.style.display = 'none'; 
    }
}

closeModalButton.addEventListener('click', () => {
    testDetailsModal.classList.add('hidden');
});

testDetailsModal.addEventListener('click', (event) => {
    if (event.target === testDetailsModal) {
        testDetailsModal.classList.add('hidden');
    }
});


// --- Chart Rendering (assumes 'metrics' and 'pagexrayData' are now correctly structured by processRawDataForDetails) ---
function renderTimingChart(metrics) {
    if (!metrics) {
        console.warn('No metrics data provided for timing chart.');
        document.getElementById('timingChart').innerHTML = '<p class="text-center text-gray-500">Timing data not available.</p>';
        return;
    }
    const canvasElement = document.getElementById('timingChart');
    if (!canvasElement) {
        console.error("Canvas element with ID 'timingChart' not found.");
        return;
    }
    const ctx = canvasElement.getContext('2d');
    const visualMetrics = metrics.visualMetrics || {}; // Ensure visualMetrics exists

    if (timingChartInstance) {
        timingChartInstance.destroy();
    }

    timingChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['First Paint', 'FCP', 'LCP', 'Speed Index', 'TTFB', 'DOM Interactive', 'Page Load Time'],
            datasets: [{
                label: 'Time (ms)',
                data: [
                    metrics.firstPaint, // Directly from processed metrics
                    metrics.firstContentfulPaint,
                    metrics.largestContentfulPaint,
                    metrics.speedIndex,
                    metrics.timeToFirstByte,
                    metrics.domInteractiveTime,
                    metrics.pageLoadTime
                ].map(val => val === null || val === undefined ? 0 : val), // Default nulls to 0 for chart
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
    if (!pagexrayData || !pagexrayData.contentTypes || pagexrayData.contentTypes.length === 0) {
        console.warn('No pagexray data for content breakdown chart.');
         document.getElementById('contentBreakdownChart').innerHTML = '<p class="text-center text-gray-500">Content breakdown data not available.</p>';
        return;
    }
    const canvasElement = document.getElementById('contentBreakdownChart');
     if (!canvasElement) {
        console.error("Canvas element with ID 'contentBreakdownChart' not found.");
        return;
    }
    const ctx = canvasElement.getContext('2d');
    
    const labels = pagexrayData.contentTypes.map(ct => ct.type);
    const data = pagexrayData.contentTypes.map(ct => ct.requests); // Chart by requests
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

// --- Comparison View (Assumes /api/tests/compare still sends somewhat processed data) ---
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
        const response = await fetch(`/api/tests/compare?${queryParams}`); // This endpoint might need adjustment if it also sends raw data
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const comparisonData = await response.json(); // Assuming this is still structured per test

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
        // Accessing metrics directly from test.metrics as per current /api/tests/compare structure
        card.innerHTML = `
            <h3 class="text-lg font-semibold text-blue-700 mb-2">${test.id}</h3>
            <p class="text-sm text-gray-600 mb-1"><strong>URL:</strong> ${test.url || 'N/A'}</p>
            <p class="text-sm text-gray-600 mb-3"><strong>Date:</strong> ${new Date(test.timestamp).toLocaleDateString()}</p>
            <ul class="space-y-1 text-sm">
                <li><strong>FCP:</strong> ${test.metrics?.firstContentfulPaint || 'N/A'} ms</li>
                <li><strong>LCP:</strong> ${test.metrics?.largestContentfulPaint || 'N/A'} ms</li>
                <li><strong>Speed Index:</strong> ${test.metrics?.speedIndex || 'N/A'}</li>
                <li><strong>Load Time:</strong> ${test.metrics?.pageLoadTime || 'N/A'} ms</li>
                <li><strong>Size:</strong> ${test.metrics?.totalPageSize ? (test.metrics.totalPageSize / 1024).toFixed(2) + ' KB' : 'N/A'}</li>
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
    
    // Accessing metrics directly from test.metrics
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
    if (!currentProcessedDetailedTest) { // Use the processed data
        alert('No test details loaded to generate a report.');
        return;
    }
    generateAndDownloadHtmlReport(currentProcessedDetailedTest);
});

function generateAndDownloadHtmlReport(processedData) { // Takes processedData
    const timingChartBase64 = timingChartInstance ? timingChartInstance.toBase64Image() : '';
    const contentBreakdownChartBase64 = contentBreakdownChartInstance ? contentBreakdownChartInstance.toBase64Image() : '';

    const metricsHtml = Object.entries({
        'First Contentful Paint': processedData.metrics?.firstContentfulPaint,
        'Largest Contentful Paint': processedData.metrics?.largestContentfulPaint,
        'Speed Index': processedData.metrics?.speedIndex,
        'Time to First Byte': processedData.metrics?.timeToFirstByte,
        'Page Load Time': processedData.metrics?.pageLoadTime,
        'DOM Interactive': processedData.metrics?.domInteractiveTime,
        'Total Page Size': processedData.metrics?.totalPageSize ? (processedData.metrics.totalPageSize / 1024).toFixed(2) + ' KB' : 'N/A',
        'Total Requests': processedData.pagexray?.totalRequests
    }).map(([label, value]) => `<li><strong>${label}:</strong> ${value !== undefined && value !== null ? value : 'N/A'}</li>`).join('');

    const contentTypesHtml = processedData.pagexray?.contentTypes?.map(ct => 
        `<li>${ct.type}: ${ct.requests} requests, ${(ct.transferSize / 1024).toFixed(2)} KB</li>`
    ).join('') || '<li>No content breakdown available.</li>';

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Performance Test Report: ${processedData.id}</title>
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
                        <li><strong>Test ID:</strong> ${processedData.id}</li>
                        <li><strong>URL Tested:</strong> ${processedData.url || 'N/A'}</li>
                        <li><strong>Timestamp:</strong> ${new Date(processedData.timestamp).toLocaleString()}</li>
                        <li><strong>Browser:</strong> ${processedData.browser || 'N/A'}</li>
                        <li><strong>Iterations:</strong> ${processedData.iterations || 'N/A'}</li>
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
    a.href = url;
    a.download = `sitespeed_report_${processedData.id.replace(/[^a-z0-9]/gi, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    fetchTestRuns(); 
});
