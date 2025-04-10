// bookSelection.js - Simplified version

// Function to initialize the UI
function initializeUI() {
  console.log('Initializing book selection UI');
  
  // Get the buttons
  const selectAllButton = document.getElementById('select-all');
  const selectNoneButton = document.getElementById('select-none');
  
  if (!selectAllButton || !selectNoneButton) {
    console.error('Select All or Select None buttons not found!');
    // Try again in a moment if the DOM isn't ready yet
    setTimeout(initializeUI, 100);
    return;
  }
  
  console.log('Found buttons, adding event listeners');
  
  // Handle select all button
  selectAllButton.addEventListener('click', function(e) {
    console.log('Select All clicked');
    e.preventDefault(); // Prevent form submission
    const checkboxes = document.querySelectorAll('.book-checkbox');
    console.log(`Found ${checkboxes.length} checkboxes`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  });
  
  // Handle select none button
  selectNoneButton.addEventListener('click', function(e) {
    console.log('Select None clicked');
    e.preventDefault(); // Prevent form submission
    const checkboxes = document.querySelectorAll('.book-checkbox');
    console.log(`Found ${checkboxes.length} checkboxes`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
  });
  
  console.log('Event listeners added');
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeUI);

// Also try to initialize immediately in case the DOM is already loaded
initializeUI();

// For debugging - log form data before submission
document.addEventListener('submit', function(event) {
  console.log('Form submitted');
  
  // Get all form elements
  const form = document.getElementById('book-selection-form');
  if (form) {
    const formData = new FormData(form);
    console.log('Form data:');
    for (const [key, value] of formData.entries()) {
      console.log(`${key}: ${value}`);
    }
  }
});
