// DOM Elements
const testsTableBody = document.getElementById('testsTableBody');
const loaderTestList = document.getElementById('loaderTestList');
const noTestsMessage = document.getElementById('noTestsMessage');
const compareSelectedButton = document.getElementById('compareSelectedButton');
const selectedCountSpan = document.getElementById('selectedCount');
const loaderComparison = document.getElementById('loaderComparison');
const comparisonResultsDiv = document.getElementById('comparisonResults');
const comparisonInstructions = document.getElementById('comparisonInstructions');
const tabTestList = document.getElementById('tabTestList');
const tabComparison = document.getElementById('tabComparison');
const testListContent = document.getElementById('testListContent');
const comparisonContent = document.getElementById('comparisonContent');

// Chart instance for comparison view
let comparisonChartInstance = null;

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

// --- Redirect to Detailed Report ---
function viewTestDetails(testRunId) {
    window.location.href = `/detailed-report.html?testId=${testRunId}`;
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
        const queryParams = `testIds=${testIds.map(encodeURIComponent).join(',')}`;
        const response = await fetch(`/api/comparison?${queryParams}`);
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
    const labels = comparisonData.map(test => `${test.id.substring(0, 10)}...(${new Date(test.timestamp).toLocaleDateString()})`);

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
            plugins: { title: { display: true, text: 'Performance Metrics Comparison' }, legend: { position: 'top' } }
        }
    });
}

function renderComparisonView() {
    const selectedCheckboxes = document.querySelectorAll('.test-checkbox:checked');
    if (selectedCheckboxes.length >= 2 && selectedCheckboxes.length <= 3) {
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

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    fetchTestRuns();
});