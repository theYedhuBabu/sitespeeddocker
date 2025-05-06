const additionalOptionsContainer = document.getElementById('additionalOptionsContainer');
const addOptionButton = document.getElementById('addOptionButton');
const optionCountSpan = document.getElementById('optionCount');
let optionCounter = 0; // To keep track of the number of options

const MAX_OPTIONS = 30;

// Function to create a new option input group
function createOptionInput() {
    optionCounter++;

    const div = document.createElement('div');
    div.classList.add('option-input-group', 'flex', 'items-center', 'space-x-2'); // Add flex layout for the remove button

    // const label = document.createElement('label');
    // label.setAttribute('for', `additionalOption${optionCounter}`);
    // label.classList.add('block', 'text-sm', 'font-medium', 'text-gray-700');
    // label.textContent = `Option ${optionCounter}:`; // Dynamic label

    const input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('id', `additionalOption${optionCounter}`);
    input.setAttribute('name', 'additionalOption');
    input.setAttribute('placeholder', 'key=value');
    input.classList.add('mt-1', 'block', 'w-full', 'rounded-md', 'border-gray-300', 'shadow-sm', 'focus:border-blue-500', 'focus:ring-blue-500', 'p-2');

    // Create the remove button (X)
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.classList.add('text-red-500', 'hover:text-red-700', 'focus:outline-none');
    removeButton.textContent = 'X';

    // Attach event listener to the remove button
    removeButton.addEventListener('click', function () {
        div.remove(); // Remove the option input div
        optionCounter--; // Decrease the option counter
        updateOptionUI(); // Update the UI for option count
    });

    // div.appendChild(label);
    div.appendChild(input);
    div.appendChild(removeButton); // Append the remove button next to the input

    return div;
}


// Function to update the option count display and button state
function updateOptionUI() {
    optionCountSpan.textContent = `${optionCounter}/${MAX_OPTIONS}`;
    if (optionCounter >= MAX_OPTIONS) {
        addOptionButton.disabled = true;
    } else {
        addOptionButton.disabled = false;
    }
}


// Event listener for the Add Option button
addOptionButton.addEventListener('click', function() {
    if (optionCounter < MAX_OPTIONS) {
        const newOptionInput = createOptionInput();
        additionalOptionsContainer.appendChild(newOptionInput);
        updateOptionUI();
    }
});

// Optionally add a few initial options on page load
// For now, we start with 0 and let the user add them.

// Update UI initially
updateOptionUI();


document.getElementById('sitespeedConfigForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent default form submission

    const form = event.target;
    const formData = new FormData(form);

    // Collect all form data into a simple object
    const config = {};

    // Collect basic options
    if (formData.get('url')) config.url = formData.get('url');
    if (formData.get('browser')) config.browser = formData.get('browser');
    if (formData.get('iterations')) config.iterations = formData.get('iterations');

    // Collect additional options
    // Use form.querySelectorAll to get all inputs with the name 'additionalOption'
    const additionalOptions = form.querySelectorAll('input[name="additionalOption"]');
    config.additionalOptions = []; // Initialize an array for additional options
    additionalOptions.forEach(input => {
        if (input.value) { // Only include if the input has a value
            config.additionalOptions.push(input.value); // Collect the key=value string
        }
    });


    console.log("Collected Configuration:", config);

    // Display a waiting message
    const resultsDiv = document.getElementById('results');
    const resultsContent = document.getElementById('resultsContent');
    resultsContent.textContent = 'Running sitespeed.io test... Please wait.';
    resultsDiv.classList.remove('hidden');

    // Send the configuration to the backend
    fetch('/run-sitespeed-test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
    })
    .then(response => {
        // Check if the response is OK (status 200-299)
        if (!response.ok) {
            // If not OK, parse the error response
            return response.json().then(err => { throw new Error(err.message || 'Backend error'); });
        }
        // If OK, parse the success response
        return response.json();
    })
    .then(data => {
        console.log('Success:', data);
        // Display results in the #results div
        resultsContent.textContent = 'Status: ' + data.status + '\n\n';
        resultsContent.textContent += 'Message: ' + data.message + '\n\n';
        resultsContent.textContent += '--- Sitespeed.io Output (stdout) ---\n' + data.stdout + '\n\n';
        resultsContent.textContent += '--- Sitespeed.io Errors (stderr) ---\n' + data.stderr;
    })
    .catch((error) => {
        console.error('Error:', error);
        // Display error message
        resultsContent.textContent = 'Error running test: ' + error;
    });
});

const browseBtn = document.getElementById('browseBtn');
const fileInput = document.getElementById('filePicker');
const urlInput = document.getElementById('url');

browseBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/upload-file', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.filePath) {
        urlInput.value = result.filePath; // This will be passed as config.url
      } else {
        alert('File upload failed.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file.');
    }
  }
});
