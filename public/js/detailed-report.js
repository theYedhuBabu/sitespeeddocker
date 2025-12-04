document.addEventListener('DOMContentLoaded', () => {
    const reportContent = document.getElementById('reportContent');
    const loader = document.getElementById('loader');
    const urlSelector = document.getElementById('urlSelector');
    const reportTitle = document.getElementById('reportTitle');
    const reportSubtitle = document.getElementById('reportSubtitle');
    const tabsContainer = document.getElementById('tabs');
    const tabContentContainer = document.getElementById('tabContent');

    const params = new URLSearchParams(window.location.search);
    const testId = params.get('testId');

    if (!testId) {
        reportContent.innerHTML = '<p class="text-red-500 text-center">No Test ID provided in the URL.</p>';
        loader.style.display = 'none';
        reportContent.style.display = 'block';
        return;
    }

    reportTitle.textContent = `Performance Report: ${testId}`;

    let allData = [];
    let processedDataByUrl = {};

    const fetchData = async () => {
        try {
            const response = await fetch(`/api/tests/${testId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            allData = await response.json();

            if (allData.length === 0) throw new Error('No data returned for this test ID.');

            processData();
            populateUrlSelector();

            const initialUrl = Object.keys(processedDataByUrl)[0];
            if (initialUrl) {
                displayReportForUrl(initialUrl);
            } else {
                // Fallback if no URL grouping found
                console.warn('No grouped data found. Raw data:', allData);
                reportContent.innerHTML = '<p class="text-center text-gray-600">Data loaded, but could not group by URL.</p>';
            }

            loader.style.display = 'none';
            reportContent.style.display = 'block';
        } catch (error) {
            console.error('Error fetching or processing report data:', error);
            loader.innerHTML = `<p class="text-red-500 text-center">Error loading report: ${error.message}</p>`;
        }
    };

    const processData = () => {
        // Group data by URL or 'group' tag
        const uniquePages = new Set();

        // Helper to normalize URL (strip trailing slash)
        const normalize = (str) => {
            if (!str) return str;
            return str.endsWith('/') ? str.slice(0, -1) : str;
        };

        allData.forEach(d => {
            const rawId = d.url || d.group;
            const id = normalize(rawId);
            if (id) uniquePages.add(id);
            // Store normalized id on record for easier filtering
            d._normalizedId = id;
        });

        const urls = [...uniquePages];

        urls.forEach(urlKey => {
            const recordsForUrl = allData.filter(d => d._normalizedId === urlKey);

            if (recordsForUrl.length > 0) {
                processedDataByUrl[urlKey] = {
                    summary: extractSummary(recordsForUrl, urlKey),
                    performance: extractPerformanceMetrics(recordsForUrl),
                    coach: extractCoachAdvice(recordsForUrl),
                    pagexray: extractPageXrayData(recordsForUrl),
                    media: extractMedia(recordsForUrl)
                };
            }
        });
    };

    const populateUrlSelector = () => {
        urlSelector.innerHTML = '';
        Object.keys(processedDataByUrl).forEach(url => {
            const option = document.createElement('option');
            option.value = url;
            option.textContent = url;
            urlSelector.appendChild(option);
        });
        urlSelector.addEventListener('change', () => displayReportForUrl(urlSelector.value));
    };

    const displayReportForUrl = (url) => {
        const data = processedDataByUrl[url];
        reportSubtitle.textContent = `Showing results for: ${url}`;
        renderTabsAndContent(data);
    };

    const renderTabsAndContent = (data) => {
        tabsContainer.innerHTML = '';
        tabContentContainer.innerHTML = '';

        const tabs = {
            'Summary': createSummaryTab,
            'Performance': createPerformanceTab,
            'Coach': createCoachTab,
            'PageXray': createPageXrayTab,
            'Media': createMediaTab
        };

        Object.keys(tabs).forEach((tabName, index) => {
            const button = document.createElement('button');
            button.className = `tab-button ${index === 0 ? 'active' : ''}`;
            button.textContent = tabName;
            button.dataset.tab = tabName;
            tabsContainer.appendChild(button);

            const pane = document.createElement('div');
            pane.id = `pane-${tabName}`;
            pane.className = `tab-pane ${index === 0 ? 'active' : ''}`;

            // Pass testId to render media properly
            pane.innerHTML = tabs[tabName](data, testId);

            tabContentContainer.appendChild(pane);

            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                button.classList.add('active');
                pane.classList.add('active');

                if (tabName === 'Performance') renderPerformanceCharts(data.performance);
                if (tabName === 'PageXray') renderPageXrayCharts(data.pagexray);
            });
        });

        renderPerformanceCharts(data.performance);
    };

    fetchData();
});

// --- Data Extraction Functions ---

function getValue(records, measurement, field = 'median') {
    // Try to find a record matching the measurement and field (e.g., median, value, max)
    // Priority: median > mean > value > max
    let record = records.find(r => r._measurement === measurement && r._field === field);
    if (!record) record = records.find(r => r._measurement === measurement && r._field === 'mean');
    if (!record) record = records.find(r => r._measurement === measurement && r._field === 'value');
    if (!record) record = records.find(r => r._measurement === measurement && r._field === 'max');

    return record ? record._value : null;
}

function extractSummary(records, urlKey) {
    // Find basic info
    const timeRecord = records[0];

    // Scores often come as separate measurements or tags. 
    // In standard sitespeed influx, it might be just 'score' without category tags in the main view.
    // We try to look for our custom 'coach_advice' or fallback to 'score'
    const perfScore = getValue(records.filter(r => r.adviceId === 'performance'), 'coach_advice', 'score') ||
        getValue(records, 'score');

    return {
        url: urlKey,
        browser: timeRecord ? timeRecord.browser : 'N/A',
        timestamp: timeRecord ? new Date(timeRecord._time).toLocaleString() : 'N/A',
        performanceScore: perfScore !== null ? perfScore : 'N/A',
        accessibilityScore: getValue(records.filter(r => r.adviceId === 'accessibility'), 'coach_advice', 'score') || 'N/A',
        bestPracticeScore: getValue(records.filter(r => r.adviceId === 'bestpractice'), 'coach_advice', 'score') || 'N/A',
    };
}

function extractPerformanceMetrics(records) {
    const metrics = {};
    // List of potential measurement names (case sensitive as per your JSON)
    const keys = [
        'firstPaint', 'firstContentfulPaint', 'largestContentfulPaint',
        'SpeedIndex', 'ttfb', 'domInteractive', 'pageLoadTime', 'fullyLoaded',
        'FirstVisualChange', 'LastVisualChange', 'TotalBlockingTime'
    ];

    keys.forEach(key => {
        // Look for visualMetrics measurement with metricName tag matching the key
        // The field is always 'value'
        let record = records.find(r => r._measurement === 'visualMetrics' && r.metricName === key && r._field === 'value');

        // Try lowercase match if exact match fails
        if (!record) {
            record = records.find(r => r._measurement === 'visualMetrics' && r.metricName === key.toLowerCase() && r._field === 'value');
        }

        metrics[key] = record ? parseFloat(record._value).toFixed(0) : 'N/A';
    });
    return metrics;
}

function extractCoachAdvice(records) {
    // Look for custom coach_advice entries
    const adviceRecords = records.filter(r => r._measurement === 'coach_advice' && r.adviceId);
    const adviceMap = {};

    if (adviceRecords.length > 0) {
        adviceRecords.forEach(r => {
            if (!adviceMap[r.adviceId]) {
                adviceMap[r.adviceId] = { id: r.adviceId, score: 0, title: '', description: '' };
            }
            if (r._field === 'score') adviceMap[r.adviceId].score = r._value;
            if (r._field === 'title') adviceMap[r.adviceId].title = r._value;
            if (r._field === 'description') adviceMap[r.adviceId].description = r._value;
        });
        return Object.values(adviceMap);
    }

    return [];
}

function extractPageXrayData(records) {
    const contentTypes = {};
    let totalRequests = 0;
    let totalSize = 0;

    // Dynamically find all unique content types present in the records
    const pageXrayRecords = records.filter(r => r._measurement === 'pagexray');
    const types = [...new Set(pageXrayRecords.map(r => r.contentType).filter(Boolean))];

    types.forEach(type => {
        // Filter records for this specific content type within pagexray measurement
        const typeRecords = pageXrayRecords.filter(r => r.contentType === type);

        if (typeRecords.length > 0) {
            // Get values from fields and ensure they are numbers
            const reqRecord = typeRecords.find(r => r._field === 'requests');
            const sizeRecord = typeRecords.find(r => r._field === 'contentSize');
            const transferRecord = typeRecords.find(r => r._field === 'transferSize');

            const reqs = reqRecord ? parseInt(reqRecord._value, 10) : 0;
            const size = sizeRecord ? parseInt(sizeRecord._value, 10) : 0;
            const transfer = transferRecord ? parseInt(transferRecord._value, 10) : 0;

            if (reqs > 0 || size > 0) {
                contentTypes[type] = { requests: reqs, size: size, transferSize: transfer };
                totalRequests += reqs;
                totalSize += size;
            }
        }
    });

    return { contentTypes, totalRequests, totalSize };
}

function extractMedia(records) {
    const videoRecord = records.find(r => r._measurement === 'media_assets' && r._field === 'video_path');
    const screenshotRecord = records.find(r => r._measurement === 'media_assets' && r._field === 'lcp_screenshot_path');

    return {
        video: videoRecord ? videoRecord._value : null,
        screenshot: screenshotRecord ? screenshotRecord._value : null
    };
}

// --- Tab Rendering ---

function createSummaryTab(data) {
    return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="card col-span-1 md:col-span-3">
                <h2 class="text-xl font-bold mb-4">Test Information</h2>
                <p><strong>URL:</strong> ${data.summary.url}</p>
                <p><strong>Browser:</strong> ${data.summary.browser}</p>
                <p><strong>Timestamp:</strong> ${data.summary.timestamp}</p>
            </div>
            <div class="card text-center">
                <h2 class="text-xl font-bold mb-4">Performance Score</h2>
                <div class="score-circle mx-auto" style="background-color: #28a745;">${data.summary.performanceScore}</div>
            </div>
            <div class="card text-center">
                <h2 class="text-xl font-bold mb-4">Accessibility Score</h2>
                <div class="score-circle mx-auto" style="background-color: #007bff;">${data.summary.accessibilityScore}</div>
            </div>
            <div class="card text-center">
                <h2 class="text-xl font-bold mb-4">Best Practice Score</h2>
                <div class="score-circle mx-auto" style="background-color: #ffc107;">${data.summary.bestPracticeScore}</div>
            </div>
        </div>
    `;
}

function createPerformanceTab(data) {
    return `
        <div class="card">
            <h2 class="text-xl font-bold mb-4">Key Performance Metrics</h2>
            <div class="chart-container" style="height: 400px;">
                <canvas id="timingChart"></canvas>
            </div>
        </div>
        <div class="card">
             <h2 class="text-xl font-bold mb-4">Detailed Metrics</h2>
             <ul>
                ${Object.entries(data.performance).map(([key, value]) => `
                    <li class="flex justify-between py-2 border-b">
                        <span class="font-semibold">${key}</span>
                        <span>${value} ${key.includes('Score') || key === 'SpeedIndex' ? '' : 'ms'}</span>
                    </li>
                `).join('')}
             </ul>
        </div>
    `;
}

function createCoachTab(data) {
    if (!data.coach || data.coach.length === 0) {
        return '<div class="card"><p>No detailed Coach advice available.</p></div>';
    }
    return `
        <div class="card">
            <h2 class="text-xl font-bold mb-4">Coach's Advice</h2>
            <div>
                ${data.coach.map(advice => `
                    <div class="border-b py-4">
                        <h3 class="font-semibold text-lg">${advice.title || 'Advice'} <span class="text-sm font-normal text-gray-600">(Score: ${advice.score})</span></h3>
                        <p class="text-gray-700 mt-1">${advice.description || ''}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function createPageXrayTab(data) {
    if (Object.keys(data.pagexray.contentTypes).length === 0) {
        return '<div class="card"><p>No PageXray content type data available.</p></div>';
    }
    return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="card">
                <h2 class="text-xl font-bold mb-4">Content Breakdown by Requests</h2>
                <div class="chart-container" style="height: 300px;">
                    <canvas id="contentRequestsChart"></canvas>
                </div>
            </div>
            <div class="card">
                <h2 class="text-xl font-bold mb-4">Content Breakdown by Size</h2>
                <div class="chart-container" style="height: 300px;">
                    <canvas id="contentSizeChart"></canvas>
                </div>
            </div>
        </div>
        <div class="card">
             <h2 class="text-xl font-bold mb-4">Asset Details</h2>
             <table class="w-full text-left">
                <thead>
                    <tr class="border-b">
                        <th class="py-2">Content Type</th>
                        <th>Requests</th>
                        <th>Size (KB)</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(data.pagexray.contentTypes).map(([type, { requests, size }]) => `
                        <tr class="border-b">
                            <td class="py-2">${type}</td>
                            <td>${requests}</td>
                            <td>${(size / 1024).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
             </table>
        </div>
    `;
}

function createMediaTab(data, testId) {
    if (!data.media || (!data.media.video && !data.media.screenshot)) {
        return `<div class="card"><p>No media assets found for this test run.</p></div>`;
    }
    return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${data.media.video ? `
            <div class="card">
                <h2 class="text-xl font-bold mb-4">Video Recording</h2>
                <video controls class="w-full" src="/results/${testId}/${data.media.video}"></video>
            </div>` : ''}
            ${data.media.screenshot ? `
            <div class="card">
                <h2 class="text-xl font-bold mb-4">Largest Contentful Paint Screenshot</h2>
                <img src="/results/${testId}/${data.media.screenshot}" alt="Largest Contentful Paint" class="w-full border">
            </div>` : ''}
        </div>
    `;
}

// --- Charts ---
let timingChartInstance, contentRequestsChartInstance, contentSizeChartInstance;

function renderPerformanceCharts(performanceData) {
    const ctx = document.getElementById('timingChart')?.getContext('2d');
    if (!ctx) return;
    if (timingChartInstance) timingChartInstance.destroy();

    const labels = [];
    const dataPoints = [];
    Object.entries(performanceData).forEach(([key, val]) => {
        if (val !== 'N/A') {
            labels.push(key);
            dataPoints.push(val);
        }
    });

    timingChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Value',
                data: dataPoints,
                backgroundColor: 'rgba(54, 162, 235, 0.6)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderPageXrayCharts(pageXrayData) {
    const reqCtx = document.getElementById('contentRequestsChart')?.getContext('2d');
    const sizeCtx = document.getElementById('contentSizeChart')?.getContext('2d');
    if (!reqCtx || !sizeCtx) return;

    if (contentRequestsChartInstance) contentRequestsChartInstance.destroy();
    if (contentSizeChartInstance) contentSizeChartInstance.destroy();

    const labels = Object.keys(pageXrayData.contentTypes);
    const requestData = labels.map(l => pageXrayData.contentTypes[l].requests);
    const sizeData = labels.map(l => pageXrayData.contentTypes[l].size);
    const chartColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#e7e9ed'];

    contentRequestsChartInstance = new Chart(reqCtx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{ data: requestData, backgroundColor: chartColors }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    contentSizeChartInstance = new Chart(sizeCtx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{ data: sizeData, backgroundColor: chartColors }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}