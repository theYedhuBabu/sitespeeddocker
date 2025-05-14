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

let currentDetailedTest = null; // Store data for the currently viewed detailed test for report download

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
    renderComparisonView(); // Re-render or update comparison view
});


// --- Test List Fetching and Rendering ---
async function fetchTestRuns() {
    loaderTestList.style.display = 'block';
    noTestsMessage.classList.add('hidden');
    testsTableBody.innerHTML = ''; // Clear existing rows
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
    
    // Switch to comparison tab and load data
    tabComparison.click();
    fetchAndDisplayComparison(testIdsToCompare);
});


// --- Test Details Modal ---
// --- Test Details Modal ---
async function viewTestDetails(testId) {
    currentDetailedTest = null; // Reset
    testDetailsModal.classList.remove('hidden');
    loaderTestDetails.style.display = 'block';
    testDetailsContent.style.display = 'none'; // Hide content while loading initially

    // Clear previous chart instances if they exist
    if (timingChartInstance) timingChartInstance.destroy();
    if (contentBreakdownChartInstance) contentBreakdownChartInstance.destroy();

    try {
        const response = await fetch(`/api/tests/${testId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const testData = await response.json();
        currentDetailedTest = testData; // Store for report download

        detailsTestId.textContent = testData.id;
        detailsUrl.textContent = testData.url || 'N/A';
        detailsTimestamp.textContent = new Date(testData.timestamp).toLocaleString();
        detailsBrowser.textContent = testData.browser || 'N/A';
        detailsIterations.textContent = testData.iterations || 'N/A';

        // Populate metrics summary
        detailsMetricsSummary.innerHTML = ''; // Clear previous
        const keyMetrics = {
            'First Contentful Paint': testData.metrics?.firstContentfulPaint,
            'Largest Contentful Paint': testData.metrics?.largestContentfulPaint,
            'Speed Index': testData.metrics?.speedIndex,
            'Time to First Byte': testData.metrics?.timeToFirstByte,
            'Page Load Time': testData.metrics?.pageLoadTime,
            'Total Page Size': testData.metrics?.totalPageSize ? (testData.metrics.totalPageSize / 1024).toFixed(2) + ' KB' : 'N/A',
        };

        for (const [label, value] of Object.entries(keyMetrics)) {
            const metricDiv = document.createElement('div');
            metricDiv.className = 'p-3 bg-gray-50 rounded-md shadow-sm';
            metricDiv.innerHTML = `<h4 class="text-sm font-medium text-gray-500">${label}</h4><p class="text-lg font-semibold text-gray-800">${value !== undefined && value !== null ? value : 'N/A'}</p>`;
            detailsMetricsSummary.appendChild(metricDiv);
        }
        
        // Make the content area visible and hide loader BEFORE attempting to render charts
        testDetailsContent.style.display = 'block';
        loaderTestDetails.style.display = 'none';

        // Render charts
        renderTimingChart(testData.metrics);
        renderContentBreakdownChart(testData.pagexray);

    } catch (error) {
        console.error('Error fetching test details:', error); // This will now log the original error if it's from fetch, or a more specific one from render functions
        testDetailsContent.innerHTML = `<p class="text-red-500 text-center">Error loading test details. ${error.message}</p>`;
        testDetailsContent.style.display = 'block'; // Ensure error message is visible
        loaderTestDetails.style.display = 'none'; // Also hide loader on error
    }
    // The finally block for loaderTestDetails is removed as it's handled in try/catch.
}

closeModalButton.addEventListener('click', () => {
    testDetailsModal.classList.add('hidden');
});

// Close modal if clicked outside of the content
testDetailsModal.addEventListener('click', (event) => {
    if (event.target === testDetailsModal) {
        testDetailsModal.classList.add('hidden');
    }
});


// --- Chart Rendering ---
// --- Chart Rendering ---
function renderTimingChart(metrics) {
    if (!metrics) {
        console.warn('No metrics data provided for timing chart.');
        return;
    }
    const canvasElement = document.getElementById('timingChart');
    if (!canvasElement) {
        console.error("Canvas element with ID 'timingChart' not found in the DOM.");
        // You could also update a part of the UI to inform the user, e.g.,
        // document.getElementById('detailsMetricsSummary').insertAdjacentHTML('beforeend', '<p class="text-red-500 col-span-full">Timing chart canvas not found.</p>');
        return;
    }
    const ctx = canvasElement.getContext('2d');
    const visualMetrics = metrics.visualMetrics || {};

    // Destroy existing chart instance if it exists (on the same canvas context)
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
                    visualMetrics.FirstVisualChange || metrics.firstPaint,
                    visualMetrics.ContentfulSpeedIndex || metrics.firstContentfulPaint,
                    visualMetrics.LargestContentfulPaint || metrics.largestContentfulPaint,
                    visualMetrics.SpeedIndex || metrics.speedIndex,
                    metrics.timeToFirstByte,
                    metrics.domInteractiveTime,
                    metrics.pageLoadTime
                ],
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
    if (!pagexrayData || !pagexrayData.contentTypes) {
        console.warn('No pagexray data for content breakdown chart.');
        return;
    }
    const canvasElement = document.getElementById('contentBreakdownChart');
    if (!canvasElement) {
        console.error("Canvas element with ID 'contentBreakdownChart' not found in the DOM.");
        return;
    }
    const ctx = canvasElement.getContext('2d');
    
    const labels = pagexrayData.contentTypes.map(ct => ct.type);
    const data = pagexrayData.contentTypes.map(ct => ct.requests);
    const backgroundColors = [
        'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)', 'rgba(83, 102, 255, 0.7)'
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
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const comparisonData = await response.json();

        if (!comparisonData || comparisonData.length === 0) {
            comparisonInstructions.textContent = "No data found for the selected tests.";
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
    comparisonResultsDiv.innerHTML = ''; // Clear previous cards
    comparisonData.forEach(test => {
        const card = document.createElement('div');
        card.className = 'bg-gray-50 p-4 rounded-lg shadow';
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
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    const labels = comparisonData.map(test => `${test.id.substring(0,15)}... (${new Date(test.timestamp).toLocaleDateString()})`);
    
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
         comparisonResultsDiv.innerHTML = ''; // Clear if nothing to show
         if (comparisonChartInstance) comparisonChartInstance.destroy();
    } else if (selectedCheckboxes.length < 2 || selectedCheckboxes.length > 3) {
        comparisonInstructions.textContent = "Please select 2 or 3 tests to compare.";
        // Optionally clear the view or leave the last comparison visible
        // comparisonResultsDiv.innerHTML = '';
        // if (comparisonChartInstance) comparisonChartInstance.destroy();
    }
}


// --- Report Download ---
downloadReportButton.addEventListener('click', () => {
    if (!currentDetailedTest) {
        alert('No test details loaded to generate a report.');
        return;
    }
    generateAndDownloadHtmlReport(currentDetailedTest);
});

function generateAndDownloadHtmlReport(testData) {
    const timingChartBase64 = timingChartInstance ? timingChartInstance.toBase64Image() : '';
    const contentBreakdownChartBase64 = contentBreakdownChartInstance ? contentBreakdownChartInstance.toBase64Image() : '';

    const metricsHtml = Object.entries({
        'First Contentful Paint': testData.metrics?.firstContentfulPaint,
        'Largest Contentful Paint': testData.metrics?.largestContentfulPaint,
        'Speed Index': testData.metrics?.speedIndex,
        'Time to First Byte': testData.metrics?.timeToFirstByte,
        'Page Load Time': testData.metrics?.pageLoadTime,
        'DOM Interactive': testData.metrics?.domInteractiveTime,
        'Total Page Size': testData.metrics?.totalPageSize ? (testData.metrics.totalPageSize / 1024).toFixed(2) + ' KB' : 'N/A',
        'Number of Requests': testData.pagexray?.totalRequests
    }).map(([label, value]) => `<li><strong>${label}:</strong> ${value !== undefined && value !== null ? value : 'N/A'}</li>`).join('');

    const contentTypesHtml = testData.pagexray?.contentTypes?.map(ct => 
        `<li>${ct.type}: ${ct.requests} requests, ${(ct.transferSize / 1024).toFixed(2)} KB</li>`
    ).join('') || '<li>No content breakdown available.</li>';

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Performance Test Report: ${testData.id}</title>
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
                        <li><strong>Test ID:</strong> ${testData.id}</li>
                        <li><strong>URL Tested:</strong> ${testData.url || 'N/A'}</li>
                        <li><strong>Timestamp:</strong> ${new Date(testData.timestamp).toLocaleString()}</li>
                        <li><strong>Browser:</strong> ${testData.browser || 'N/A'}</li>
                        <li><strong>Iterations:</strong> ${testData.iterations || 'N/A'}</li>
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
    a.download = `sitespeed_report_${testData.id.replace(/[^a-z0-9]/gi, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    fetchTestRuns(); // Load test runs when the page loads
    // Ensure the first tab is active by default (already handled by HTML classes)
});

