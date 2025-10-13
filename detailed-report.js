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
            displayReportForUrl(Object.keys(processedDataByUrl)[0]);

            loader.style.display = 'none';
            reportContent.style.display = 'block';
        } catch (error) {
            console.error('Error fetching or processing report data:', error);
            loader.innerHTML = `<p class="text-red-500 text-center">Error loading report: ${error.message}</p>`;
        }
    };

    const processData = () => {
        const urls = [...new Set(allData.map(d => d.url).filter(Boolean))];
        urls.forEach(url => {
            const recordsForUrl = allData.filter(d => d.url === url);
            processedDataByUrl[url] = {
                summary: extractSummary(recordsForUrl),
                performance: extractPerformanceMetrics(recordsForUrl),
                coach: extractCoachAdvice(recordsForUrl),
                pagexray: extractPageXrayData(recordsForUrl),
                media: extractMedia(recordsForUrl)
            };
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
            pane.innerHTML = tabs[tabName](data);
            tabContentContainer.appendChild(pane);

            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                button.classList.add('active');
                pane.classList.add('active');
                // Re-render charts if they are in the activated tab
                if(tabName === 'Performance') renderPerformanceCharts(data.performance);
                if(tabName === 'PageXray') renderPageXrayCharts(data.pagexray);
            });
        });
        
        // Initial chart render for the default active tab
        renderPerformanceCharts(data.performance);
    };

    fetchData();
});

// --- Data Extraction Functions ---
function extractSummary(records) {
    const summaryRecord = records.find(r => r._measurement === 'pageLoadTime') || records[0];
    return {
        url: summaryRecord.url,
        browser: summaryRecord.browser,
        timestamp: new Date(summaryRecord._time).toLocaleString(),
        performanceScore: records.find(r => r.adviceId === 'performance' && r._measurement === 'coach_advice')?.score || 'N/A',
        accessibilityScore: records.find(r => r.adviceId === 'accessibility' && r._measurement === 'coach_advice')?.score || 'N/A',
        bestPracticeScore: records.find(r => r.adviceId === 'bestpractice' && r._measurement === 'coach_advice')?.score || 'N/A',
    };
}

function extractPerformanceMetrics(records) {
    const metrics = {};
    const relevantMeasurements = ['firstPaint', 'firstContentfulPaint', 'largestContentfulPaint', 'SpeedIndex', 'ttfb', 'domInteractive', 'pageLoadTime', 'fullyLoaded'];
    relevantMeasurements.forEach(m => {
        const record = records.find(r => r._measurement === m);
        metrics[m] = record ? record._value.toFixed(0) : 'N/A';
    });
    return metrics;
}

function extractCoachAdvice(records) {
    return records.filter(r => r._measurement === 'coach_advice' && r.adviceId)
                  .map(r => ({
                      id: r.adviceId,
                      title: r.title,
                      description: r.description,
                      score: r.score
                  }));
}

function extractPageXrayData(records) {
    const contentTypes = {};
    let totalRequests = 0;
    let totalSize = 0;

    records.filter(r => r.origin === 'pagexray' && r.contentType).forEach(r => {
        const type = r.contentType;
        if (!contentTypes[type]) {
            contentTypes[type] = { requests: 0, size: 0 };
        }
        contentTypes[type].requests++;
        contentTypes[type].size += r.contentSize || 0;
        totalRequests++;
        totalSize += r.contentSize || 0;
    });

    return { contentTypes, totalRequests, totalSize };
}

function extractMedia(records){
    const mediaRecord = records.find(r => r._measurement === 'media_assets');
    if (!mediaRecord) return null;
    return {
        video: mediaRecord.video_path,
        screenshot: mediaRecord.lcp_screenshot_path
    };
}


// --- Tab Content Creation Functions ---
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
                        <span>${value} ms</span>
                    </li>
                `).join('')}
             </ul>
        </div>
    `;
}

function createCoachTab(data) {
    return `
        <div class="card">
            <h2 class="text-xl font-bold mb-4">Coach's Advice</h2>
            <div>
                ${data.coach.map(advice => `
                    <div class="border-b py-4">
                        <h3 class="font-semibold text-lg">${advice.title} <span class="text-sm font-normal text-gray-600">(Score: ${advice.score})</span></h3>
                        <p class="text-gray-700 mt-1">${advice.description}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function createPageXrayTab(data) {
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
                    ${Object.entries(data.pagexray.contentTypes).map(([type, {requests, size}]) => `
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

function createMediaTab(data) {
    if (!data.media) {
        return `<div class="card"><p>No media assets found for this test run.</p></div>`;
    }
    return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="card">
                <h2 class="text-xl font-bold mb-4">Video Recording</h2>
                <video controls class="w-full" src="/results/${testId}/${data.media.video}"></video>
            </div>
            <div class="card">
                <h2 class="text-xl font-bold mb-4">Largest Contentful Paint Screenshot</h2>
                <img src="/results/${testId}/${data.media.screenshot}" alt="Largest Contentful Paint" class="w-full border">
            </div>
        </div>
    `;
}

// --- Chart Rendering Functions ---
let timingChartInstance, contentRequestsChartInstance, contentSizeChartInstance;

function renderPerformanceCharts(performanceData) {
    const ctx = document.getElementById('timingChart')?.getContext('2d');
    if (!ctx) return;
    if (timingChartInstance) timingChartInstance.destroy();

    timingChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(performanceData),
            datasets: [{
                label: 'Time (ms)',
                data: Object.values(performanceData),
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

    const chartColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];

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