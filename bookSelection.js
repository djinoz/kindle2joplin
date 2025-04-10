// bookSelection.js
document.addEventListener('DOMContentLoaded', function() {
  // Handle select all button
  document.getElementById('select-all').addEventListener('click', function() {
    const checkboxes = document.querySelectorAll('.book-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  });
  
  // Handle select none button
  document.getElementById('select-none').addEventListener('click', function() {
    const checkboxes = document.querySelectorAll('.book-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
  });
  
  // Update form data when submitting
  document.addEventListener('beforeDialogSubmit', function(event) {
    const formData = event.formData;
    const checkboxes = document.querySelectorAll('.book-checkbox');
    
    checkboxes.forEach(checkbox => {
      formData['book-' + checkbox.dataset.index] = checkbox.checked;
    });
  });
});
