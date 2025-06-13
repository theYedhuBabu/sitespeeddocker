document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const form = document.getElementById('sitespeedConfigForm');
  const fieldset = document.getElementById('config-fieldset');
  const resultsDiv = document.getElementById('results');
  const resultsContent = document.getElementById('resultsContent');
  const browseBtn = document.getElementById('browseBtn');
  const fileInput = document.getElementById('filePicker');
  const urlInput = document.getElementById('url');
  const addOptionButton = document.getElementById('addOptionButton');
  const additionalOptionsContainer = document.getElementById('additionalOptionsContainer');
  const controlButtonsContainer = document.getElementById('control-buttons');

  // --- State Management ---
  let abortController = null; // To handle cancellation

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
    ]
  };

  // --- State Control Functions ---

  /** (A, G) Initial state or after 'New Test' */
  function setIdleState() {
      fieldset.disabled = false;
      resultsDiv.classList.add('hidden');
      resultsContent.innerHTML = '';
      form.reset();
      additionalOptionsContainer.innerHTML = '';
      
      controlButtonsContainer.innerHTML = `
          <button type="submit" id="runTestBtn" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Run Sitespeed.io Test
          </button>`;
  }

  /** (B) Test is running */
  function setRunningState() {
      fieldset.disabled = true;
      resultsDiv.classList.remove('hidden');
      resultsContent.innerHTML = `<div class="flex items-center justify-center space-x-2 text-blue-600 p-4">...Running...</div>`;
      
      controlButtonsContainer.innerHTML = `
          <button type="button" id="stopTestBtn" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700">
              Stop Test
          </button>`;
      document.getElementById('stopTestBtn').addEventListener('click', handleStopTest);
  }

  /** (C) Test was stopped by the user */
  function setStoppedState() {
      fieldset.disabled = true;
      resultsContent.innerHTML = `<div class="p-4 bg-yellow-100 border border-yellow-300 rounded-lg text-yellow-800">Test stopped by user.</div>`;
      
      controlButtonsContainer.innerHTML = `
          <button type="button" id="restartTestBtn" class="py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700">Restart Test</button>
          <button type="button" id="newTestBtn" class="py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-gray-500 hover:bg-gray-600">New Test</button>`;
          
      document.getElementById('restartTestBtn').addEventListener('click', () => form.requestSubmit());
      document.getElementById('newTestBtn').addEventListener('click', setIdleState);
  }
  
  /** (D) Test completed successfully */
 /** (D) Test completed successfully */
function setCompletedState(data) {
  fieldset.disabled = true;

  // Get the template from the DOM
  const successTemplate = document.getElementById('success-template').content.cloneNode(true);

  // Populate the template with data
  successTemplate.querySelector('.test-id-placeholder').textContent = data.testId || 'N/A';
  successTemplate.querySelector('.output-placeholder').textContent = data.output || 'No console output received.';

  // --- FIX ---
  // First, clear the old results and add the new template to the page.
  resultsContent.innerHTML = '';
  resultsContent.appendChild(successTemplate);

  // NOW that the content is on the page, find the button inside it and add the listener.
  const viewDetailsButton = resultsContent.querySelector('.view-details-btn');
  if (data.testId && viewDetailsButton) {
      viewDetailsButton.addEventListener('click', () => {
          window.open(`results.html?testId=${data.testId}`, '_blank');
      });
  } else if (viewDetailsButton) {
      viewDetailsButton.style.display = 'none';
  }
  // --- END FIX ---


  // Update control buttons on the main form
  controlButtonsContainer.innerHTML = `
      <button type="button" id="newTestBtn" class="py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">New Test</button>`;
  document.getElementById('newTestBtn').addEventListener('click', setIdleState);
}
  
  /** (E) Test failed */
  function setFailedState(error) {
      fieldset.disabled = true;
      
      resultsContent.innerHTML = `
          <div class="p-4 bg-red-100 border border-red-300 rounded-lg">
              <h3 class="font-semibold text-lg text-red-800">✗ Test Execution Failed</h3>
              <div class="mt-2 text-sm text-red-700">${error.message}</div> 
          </div>`;

      controlButtonsContainer.innerHTML = `
          <button type="button" id="restartTestBtn" class="py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700">Restart Test</button>
          <button type="button" id="newTestBtn" class="py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-gray-500 hover:bg-gray-600">New Test</button>`;
          
      document.getElementById('restartTestBtn').addEventListener('click', () => form.requestSubmit());
      document.getElementById('newTestBtn').addEventListener('click', setIdleState);
  }


  // --- Event Handlers ---
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileUpload);
  addOptionButton.addEventListener('click', addOption);
  form.addEventListener('submit', handleFormSubmit);
  
  function handleStopTest() {
      if (abortController) {
          abortController.abort();
      }
  }

  // --- Core Logic ---

  function addOption() {
      // ... (this function remains the same as in your original script)
      const optionId = `option-row-${Date.now()}`;
      const optionRow = document.createElement('div');
      optionRow.id = optionId;
      optionRow.className = 'grid grid-cols-1 md:grid-cols-4 gap-4 items-center p-3 bg-gray-50 rounded-md border';

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
  
  // ... (Helper functions for addOption remain the same)
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
      // ... (this function remains the same as in your original script)
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
      setRunningState();

      abortController = new AbortController();
      const signal = abortController.signal;

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
              body: JSON.stringify(config),
              signal: signal 
          });

          const data = await response.json();

          if (!response.ok) {
              const errorMessage = data.error || `Test execution failed with status: ${response.status}.`;
              const detailedOutput = data.output ? `<div class="mt-2 p-2 bg-gray-100 border border-gray-300 rounded text-xs overflow-auto max-h-48"><strong>Details:</strong><pre>${data.output}</pre></div>` : '';
              throw new Error(errorMessage + detailedOutput);
          }
          
          setCompletedState(data);

      } catch (error) {
          if (error.name === 'AbortError') {
              console.log('Fetch aborted by user.');
              setStoppedState();
          } else {
              console.error('Test run error:', error);
              setFailedState(error);
          }
      }
  }
  
  // Initial UI setup
  setIdleState();
});