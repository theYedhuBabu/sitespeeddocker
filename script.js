document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('sitespeedConfigForm');
  const resultsDiv = document.getElementById('results');
  const resultsContent = document.getElementById('resultsContent');
  const browseBtn = document.getElementById('browseBtn');
  const fileInput = document.getElementById('filePicker');
  const urlInput = document.getElementById('url');

  // File upload handling
  browseBtn.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      browseBtn.disabled = true;
      browseBtn.textContent = 'Uploading...';

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      urlInput.value = data.filePath;
    } catch (error) {
      alert('Upload failed: ' + error.message);
    } finally {
      browseBtn.disabled = false;
      browseBtn.textContent = 'Browse';
    }
  });

  // Test submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Show loading state
    resultsDiv.classList.remove('hidden');
    resultsContent.innerHTML = `
      <div class="flex items-center space-x-2 text-blue-600">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="4" opacity="0.25"></circle>
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Running performance test...</span>
      </div>
    `;

    // Collect form data
    const config = {
      url: urlInput.value,
      browser: document.getElementById('browser').value,
      iterations: document.getElementById('iterations').value,
      additionalOptions: Array.from(
        document.querySelectorAll('input[name="additionalOption"]')
      ).map(input => input.value.trim()).filter(Boolean)
    };

    try {
      const response = await fetch('/api/run-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(data.error || 'Test failed');
      }

      // Show results
      resultsContent.innerHTML = `
        <div class="mb-4 p-4 bg-green-50 rounded-lg">
          <h3 class="font-bold text-green-800">✓ Test Completed Successfully</h3>
          ${data.resultUrl ? `
            <a href="${data.resultUrl}" target="_blank" 
               class="inline-block mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              View Full Report
            </a>
          ` : ''}
        </div>
        <div class="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 class="font-bold mb-2">Test Output:</h4>
          <pre class="text-sm whitespace-pre-wrap">${data.output}</pre>
        </div>
      `;
    } catch (error) {
      resultsContent.innerHTML = `
        <div class="p-4 bg-red-50 rounded-lg">
          <h3 class="font-bold text-red-800">✗ Test Failed</h3>
          <p class="mt-2">${error.message}</p>
        </div>
      `;
    }
  });
});