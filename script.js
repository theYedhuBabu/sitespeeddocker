document.addEventListener('DOMContentLoaded', () => {
  const sitespeedOptions = {
      "Browser": [
          { name: "-n, --browsertime.iterations", description: "How many times you want to test each page", type: "number", default: 3 },
          { name: "--browsertime.spa, --spa", description: "Convenient parameter for SPA applications", type: "boolean" },
          { name: "--browsertime.debug, --debug", description: "Run Browsertime in debug mode", type: "boolean" },
          { name: "--browsertime.limitedRunData", description: "Send limited metrics from one run to the datasource", type: "boolean", default: true },
          { name: "-c, --browsertime.connectivity.profile", description: "The connectivity profile", type: "choices", choices: ["4g", "3g", "3gfast", "3gslow", "3gem", "2g", "cable", "native", "custom"], default: "native" },
          { name: "--browsertime.connectivity.alias", description: "Give your connectivity profile a custom name", type: "string" },
          { name: "--browsertime.connectivity.down, --downstreamKbps", description: "Downstream Kbps (requires custom connectivity)", type: "number" },
          { name: "--browsertime.connectivity.up, --upstreamKbps", description: "Upstream Kbps (requires custom connectivity)", type: "number" },
          { name: "--browsertime.connectivity.rtt, --latency", description: "Round-trip time in ms (requires custom connectivity)", type: "number" },
          { name: "--browsertime.connectivity.engine", description: "The engine for connectivity", type: "choices", choices: ["external", "throttle", "humble"], default: "external" },
          { name: "--browsertime.connectivity.humble.url", description: "URL to your Humble instance", type: "string" },
          { name: "--browsertime.timeouts.pageCompleteCheck, --maxLoadTime", description: "Max load time in ms", type: "number", default: 120000 },
          { name: "--browsertime.pageCompleteCheck", description: "JavaScript to decide when page is loaded", type: "string" },
      ],
      "Android": [
          { name: "--browsertime.android.gnirehtet, --gnirehtet", description: "Start gnirehtet for reverse tethering", type: "boolean" },
          { name: "--browsertime.android.rooted, --androidRooted", description: "Setup for rooted Android devices", type: "boolean" },
          { name: "--browsertime.android.batteryTemperatureLimit", description: "Battery temperature limit before test", type: "number" },
      ],
      "Video": [
          { name: "--browsertime.video", description: "Enable/disable video recording", type: "boolean" },
          { name: "--browsertime.videoParams.keepOriginalVideo", description: "Keep the original video file", type: "boolean" },
      ],
      "Filmstrip": [
          { name: "--browsertime.videoParams.filmstripFullSize", description: "Keep original sized screenshots in the filmstrip", type: "boolean" },
          { name: "--browsertime.videoParams.filmstripQuality", description: "Quality of filmstrip screenshots (0-100)", type: "number", default: 75 },
      ],
      "Firefox": [
          { name: "--browsertime.firefox.binaryPath", description: "Path to custom Firefox binary", type: "string" },
          { name: "--browsertime.firefox.preference", description: "Set a Firefox preference (key:value)", type: "string" },
      ],
      "Chrome": [
          { name: "--browsertime.chrome.args", description: "Extra command line arguments for Chrome", type: "string" },
          { name: "--browsertime.chrome.timeline", description: "Collect the timeline data", type: "boolean" },
      ],
      "Edge": [
          { name: "--browsertime.edge.edgedriverPath", description: "Path to the msedgedriver", type: "string" },
          { name: "--browsertime.edge.binaryPath", description: "Path to custom Edge binary", type: "string" },
      ],
      "Screenshot": [
        { name: "--browsertime.screenshot", description: "Set to false to disable screenshots", type: "boolean"},
        { name: "--browsertime.screenshotParams.type", description: "Set the file type of the screenshot", type: "string"},
        // { name: , description: , type: },
        // { name: , description: , type: },
        // { name: , description: , type: },
        // { name: , description: , type: },



      ]
  };

  const form = document.getElementById('sitespeedConfigForm');
  const resultsDiv = document.getElementById('results');
  const resultsContent = document.getElementById('resultsContent');
  const browseBtn = document.getElementById('browseBtn');
  const fileInput = document.getElementById('filePicker');
  const urlInput = document.getElementById('url');
  const addOptionButton = document.getElementById('addOptionButton');
  const additionalOptionsContainer = document.getElementById('additionalOptionsContainer');

  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileUpload);
  addOptionButton.addEventListener('click', addOption);
  form.addEventListener('submit', handleFormSubmit);

  function addOption() {
      const optionId = `option-row-${Date.now()}`;
      const optionRow = document.createElement('div');
      optionRow.id = optionId;
      optionRow.className = 'grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 bg-gray-50 rounded-md border';

      const categorySelect = createCategorySelect();
      optionRow.appendChild(categorySelect);

      const parameterSelectContainer = document.createElement('div');
      parameterSelectContainer.className = 'parameter-select-container';
      optionRow.appendChild(parameterSelectContainer);

      const valueInputContainer = document.createElement('div');
      valueInputContainer.className = 'value-input-container';
      optionRow.appendChild(valueInputContainer);
      
      const removeBtn = createRemoveButton(optionId);
      optionRow.appendChild(removeBtn);
      
      additionalOptionsContainer.appendChild(optionRow);
  }

  function createCategorySelect() {
      const select = document.createElement('select');
      select.className = 'category-select mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2';
      select.innerHTML = `<option value="">Select Category...</option>`;
      for (const category in sitespeedOptions) {
          const option = document.createElement('option');
          option.value = category;
          option.textContent = category;
          select.appendChild(option);
      }
      select.addEventListener('change', (e) => {
          const row = e.target.closest('.grid');
          const parameterContainer = row.querySelector('.parameter-select-container');
          const valueContainer = row.querySelector('.value-input-container');
          parameterContainer.innerHTML = '';
          valueContainer.innerHTML = '';
          if (e.target.value) {
              const parameterSelect = createParameterSelect(e.target.value);
              parameterContainer.appendChild(parameterSelect);
          }
      });
      return select;
  }

  function createParameterSelect(category) {
      const select = document.createElement('select');
      select.className = 'parameter-select mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2';
      select.innerHTML = `<option value="">Select Parameter...</option>`;
      sitespeedOptions[category].forEach((param, index) => {
          const option = document.createElement('option');
          option.value = index;
          option.textContent = param.description;
          select.appendChild(option);
      });
      select.addEventListener('change', (e) => {
          const row = e.target.closest('.grid');
          const valueContainer = row.querySelector('.value-input-container');
          valueContainer.innerHTML = '';
          if (e.target.value) {
              const param = sitespeedOptions[category][e.target.value];
              const valueInput = createValueInput(param);
              valueContainer.appendChild(valueInput);
          }
      });
      return select;
  }

  function createValueInput(param) {
      let input;
      if (param.type === 'boolean') {
          input = document.createElement('input');
          input.type = 'checkbox';
          input.className = 'value-input h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded';
          if (param.default) {
              input.checked = true;
          }
      } else if (param.type === 'choices') {
          input = document.createElement('select');
          input.className = 'value-input mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2';
          param.choices.forEach(choice => {
              const option = document.createElement('option');
              option.value = choice;
              option.textContent = choice;
              input.appendChild(option);
          });
          if (param.default) {
              input.value = param.default;
          }
      } else {
          input = document.createElement('input');
          input.type = param.type === 'number' ? 'number' : 'text';
          input.className = 'value-input mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2';
          input.placeholder = `Enter value`;
          if (param.default) {
              input.value = param.default;
          }
      }
      return input;
  }

  function createRemoveButton(optionId) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-xs';
      removeBtn.addEventListener('click', () => {
          const rowToRemove = document.getElementById(optionId);
          if (rowToRemove) {
              additionalOptionsContainer.removeChild(rowToRemove);
          }
      });
      return removeBtn;
  }

  async function handleFileUpload() {
      const file = fileInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      browseBtn.disabled = true;
      browseBtn.textContent = 'Uploading...';
      resultsDiv.classList.add('hidden');

      try {
          const response = await fetch('/api/upload', {
              method: 'POST',
              body: formData
          });

          if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: 'Unknown upload error' }));
              throw new Error(errorData.error || `Upload failed with status: ${response.status}`);
          }

          const data = await response.json();
          urlInput.value = data.filePath;
          resultsDiv.classList.remove('hidden');
          resultsContent.innerHTML = `<div class="p-2 bg-green-50 text-green-700 rounded-md">File <strong>${file.name}</strong> uploaded successfully. Path: ${data.filePath}</div>`;

      } catch (error) {
          console.error('Upload error:', error);
          resultsDiv.classList.remove('hidden');
          resultsContent.innerHTML = `<div class="p-2 bg-red-50 text-red-700 rounded-md">Upload failed: ${error.message}</div>`;
          urlInput.value = '';
      } finally {
          browseBtn.disabled = false;
          browseBtn.textContent = 'Browse';
          fileInput.value = '';
      }
  }

  async function handleFormSubmit(e) {
      e.preventDefault();
      
      resultsDiv.classList.remove('hidden');
      resultsContent.innerHTML = `<div class="flex items-center justify-center space-x-2 text-blue-600 p-4">...Running...</div>`;

      const additionalOptions = [];
      document.querySelectorAll('#additionalOptionsContainer .grid').forEach(row => {
          const category = row.querySelector('.category-select').value;
          const paramIndex = row.querySelector('.parameter-select') ? row.querySelector('.parameter-select').value : null;

          if (category && paramIndex) {
              const param = sitespeedOptions[category][paramIndex];
              const input = row.querySelector('.value-input');
              let value;
              if (param.type === 'boolean') {
                  if (input.checked) {
                      additionalOptions.push(param.name.split(',')[0].trim());
                  }
              } else {
                  value = input.value.trim();
                  if (value) {
                      additionalOptions.push(`${param.name.split(',')[0].trim()}=${value}`);
                  }
              }
          }
      });

      const config = {
          url: urlInput.value,
          browser: document.getElementById('browser').value,
          iterations: document.getElementById('iterations').value,
          additionalOptions: additionalOptions
      };

      try {
          const response = await fetch('/api/run-test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(config)
          });

          const data = await response.json();

          if (data.status === 'error' || !response.ok) {
              const errorMessage = data.error || `Test execution failed with status: ${response.status}.`;
              const detailedOutput = data.output ? `<div class="mt-2 p-2 bg-gray-100 border border-gray-300 rounded text-xs overflow-auto max-h-48"><strong>Details:</strong><pre>${data.output}</pre></div>` : '';
              throw new Error(errorMessage + detailedOutput);
          }

          let reportLinkHtml = data.resultUrl ? `
            <a href="${data.resultUrl}" target="_blank" 
               class="inline-block mt-3 px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium">
              View Full HTML Report
            </a>` : `<p class="mt-2 text-sm text-gray-600">Full HTML report URL not available.</p>`;

          resultsContent.innerHTML = `
              <div class="mb-4 p-4 bg-green-100 border border-green-300 rounded-lg">
                  <h3 class="font-semibold text-lg text-green-800">✓ Test Completed Successfully</h3>
                  <p class="text-sm text-green-700 mt-1">Test ID: ${data.testId || 'N/A'}</p>
                  ${reportLinkHtml}
              </div>
              <div class="mt-4 p-4 bg-gray-100 border border-gray-300 rounded-lg">
                  <h4 class="font-semibold mb-2 text-gray-700">Sitespeed.io Console Output:</h4>
                  <pre class="text-xs whitespace-pre-wrap overflow-auto max-h-60 bg-gray-800 text-gray-200 p-3 rounded-md">${data.output || 'No console output received.'}</pre>
              </div>`;
      } catch (error) {
          console.error('Test run error:', error);
          resultsContent.innerHTML = `
              <div class="p-4 bg-red-100 border border-red-300 rounded-lg">
                  <h3 class="font-semibold text-lg text-red-800">✗ Test Execution Failed</h3>
                  <div class="mt-2 text-sm text-red-700">${error.message}</div> 
              </div>`;
      }
  }
});