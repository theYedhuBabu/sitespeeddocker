// Wait for the DOM to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
  // Get references to various DOM elements
  const form = document.getElementById('sitespeedConfigForm');
  const resultsDiv = document.getElementById('results');
  const resultsContent = document.getElementById('resultsContent');
  const browseBtn = document.getElementById('browseBtn');
  const fileInput = document.getElementById('filePicker'); // Hidden file input
  const urlInput = document.getElementById('url'); // Text input for URL or file path

  const addOptionButton = document.getElementById('addOptionButton');
  const additionalOptionsContainer = document.getElementById('additionalOptionsContainer');
  const optionCountSpan = document.getElementById('optionCount');
  const MAX_OPTIONS = 20; // Maximum number of additional options allowed
  let currentOptionCount = 0;

  // --- File Upload Handling ---
  // When the "Browse" button is clicked, trigger a click on the hidden file input
  browseBtn.addEventListener('click', () => fileInput.click());
  
  // When a file is selected in the file input
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]; // Get the selected file
    if (!file) return; // If no file is selected, do nothing

    // Create a FormData object to send the file
    const formData = new FormData();
    formData.append('file', file); // 'file' is the field name expected by the backend

    // Disable the browse button and show "Uploading..." text
    browseBtn.disabled = true;
    browseBtn.textContent = 'Uploading...';
    resultsDiv.classList.add('hidden'); // Hide previous results

    try {
      // Make a POST request to the /api/upload endpoint
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) { // Check if the server responded with an error
        const errorData = await response.json().catch(() => ({ message: 'Unknown upload error' }));
        throw new Error(errorData.error || `Upload failed with status: ${response.status}`);
      }

      const data = await response.json(); // Parse the JSON response from the server
      urlInput.value = data.filePath; // Set the URL input field to the path of the uploaded file
      // Optionally, show a success message for upload
      resultsDiv.classList.remove('hidden');
      resultsContent.innerHTML = `<div class="p-2 bg-green-50 text-green-700 rounded-md">File <strong>${file.name}</strong> uploaded successfully. Path: ${data.filePath}</div>`;

    } catch (error) {
      console.error('Upload error:', error);
      // Display an error message to the user
      resultsDiv.classList.remove('hidden');
      resultsContent.innerHTML = `<div class="p-2 bg-red-50 text-red-700 rounded-md">Upload failed: ${error.message}</div>`;
      urlInput.value = ''; // Clear the URL input on failure
    } finally {
      // Re-enable the browse button and restore its text
      browseBtn.disabled = false;
      browseBtn.textContent = 'Browse';
      fileInput.value = ''; // Clear the file input so the same file can be re-selected if needed
    }
  });

  // --- Additional Options Handling ---
  function updateOptionButtonState() {
    addOptionButton.disabled = currentOptionCount >= MAX_OPTIONS;
    optionCountSpan.textContent = `(${currentOptionCount}/${MAX_OPTIONS} added)`;
  }

  addOptionButton.addEventListener('click', () => {
    if (currentOptionCount >= MAX_OPTIONS) return;

    currentOptionCount++;
    const optionId = `additionalOption-${currentOptionCount}`;

    const optionDiv = document.createElement('div');
    optionDiv.className = 'flex items-center space-x-2';
    optionDiv.innerHTML = `
      <input type="text" name="additionalOption" id="${optionId}" 
             placeholder="e.g., --plugins.remove=html" 
             class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 text-sm">
      <button type="button" data-remove="${optionId}" 
              class="remove-option-btn px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-xs">
        Remove
      </button>
    `;
    additionalOptionsContainer.appendChild(optionDiv);
    updateOptionButtonState();

    // Add event listener for the new remove button
    optionDiv.querySelector('.remove-option-btn').addEventListener('click', (e) => {
        additionalOptionsContainer.removeChild(optionDiv);
        currentOptionCount--;
        updateOptionButtonState();
    });
  });
  updateOptionButtonState(); // Initial state

  // --- Test Submission Handling ---
  // When the main configuration form is submitted
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent the default form submission (which would cause a page reload)
    
    // Show a loading indicator in the results area
    resultsDiv.classList.remove('hidden'); // Make the results area visible
    resultsContent.innerHTML = `
      <div class="flex items-center justify-center space-x-2 text-blue-600 p-4">
        <svg class="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-lg">Running performance test, please wait...</span>
      </div>
    `;

    // Collect all the configuration data from the form
    const additionalOptions = Array.from(
        document.querySelectorAll('input[name="additionalOption"]') // Get all input fields for additional options
      )
      .map(input => input.value.trim()) // Get their values and remove leading/trailing whitespace
      .filter(value => value !== ''); // Filter out any empty options

    const config = {
      url: urlInput.value,
      browser: document.getElementById('browser').value,
      iterations: document.getElementById('iterations').value,
      additionalOptions: additionalOptions
    };

    try {
      // Make a POST request to the /api/run-test endpoint with the configuration data
      const response = await fetch('/api/run-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // Indicate that we're sending JSON data
        body: JSON.stringify(config) // Convert the JavaScript config object to a JSON string
      });

      const data = await response.json(); // Parse the JSON response from the server

      // Check if the server indicated an error in its response
      if (data.status === 'error' || !response.ok) {
        // If there's an error, construct an error message and throw it
        const errorMessage = data.error || `Test execution failed with status: ${response.status}.`;
        // Include detailed output if available
        const detailedOutput = data.output ? `<div class="mt-2 p-2 bg-gray-100 border border-gray-300 rounded text-xs overflow-auto max-h-48"><strong>Details:</strong><pre>${data.output}</pre></div>` : '';
        throw new Error(errorMessage + detailedOutput);
      }

      // If the test was successful, display success information and a link to the full report
      let reportLinkHtml = '';
      if (data.resultUrl) {
        reportLinkHtml = `
          <a href="${data.resultUrl}" target="_blank" 
             class="inline-block mt-3 px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium">
            View Full HTML Report for This Test
          </a>
        `;
      } else {
        reportLinkHtml = `<p class="mt-2 text-sm text-gray-600">Full HTML report URL not available.</p>`;
      }

      resultsContent.innerHTML = `
        <div class="mb-4 p-4 bg-green-100 border border-green-300 rounded-lg">
          <h3 class="font-semibold text-lg text-green-800">✓ Test Completed Successfully</h3>
          <p class="text-sm text-green-700 mt-1">Test ID: ${data.testId || 'N/A'}</p>
          ${reportLinkHtml}
        </div>
        <div class="mt-4 p-4 bg-gray-100 border border-gray-300 rounded-lg">
          <h4 class="font-semibold mb-2 text-gray-700">Sitespeed.io Console Output:</h4>
          <pre class="text-xs whitespace-pre-wrap overflow-auto max-h-60 bg-gray-800 text-gray-200 p-3 rounded-md">${data.output || 'No console output received.'}</pre>
        </div>
      `;
    } catch (error) {
      // If an error occurred during the fetch or if the server indicated an error
      console.error('Test run error:', error);
      resultsContent.innerHTML = `
        <div class="p-4 bg-red-100 border border-red-300 rounded-lg">
          <h3 class="font-semibold text-lg text-red-800">✗ Test Execution Failed</h3>
          <div class="mt-2 text-sm text-red-700">${error.message}</div> 
        </div>
      `;
      // The error.message might contain HTML from the 'throw new Error' block above
    }
  });
});
