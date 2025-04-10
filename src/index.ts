import joplin from "api";
import { SettingItemType, MenuItemLocation, ToolbarButtonLocation } from "api/types";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { parseClippingsFile, organizeByBook, exportToJoplin, KindleClipping, BookData, ExportOptions } from "./kindle-to-joplin";

joplin.plugins.register({
  onStart: async function() {
    console.info("Kindle to Joplin plugin started!");
    
    // Register settings
    await joplin.settings.registerSection("kindleImport", {
      label: "Kindle Highlights Import",
      iconName: "fas fa-book"
    });

    await joplin.settings.registerSettings({
      "lastClippingsPath": {
        value: "",
        type: SettingItemType.String,
        section: "kindleImport",
        public: false,
        label: "Last used clippings path"
      },
      "notebookName": {
        value: "Kindle Books",
        type: SettingItemType.String,
        section: "kindleImport",
        public: true,
        label: "Default notebook for imported notes"
      },
      "tagWithAuthor": {
        value: true,
        type: SettingItemType.Bool,
        section: "kindleImport",
        public: true,
        label: "Add author tags to notes"
      }
    });

    // Register the command to import Kindle highlights
    await joplin.commands.register({
      name: "importKindleHighlights",
      label: "Import Kindle Highlights...",
      execute: async () => {
        try {
          // 1. Use file picker to get the clippings file
          console.info("Opening file picker dialog...");
          const result = await joplin.views.dialogs.showOpenDialog({
            filters: [
              { name: "Text files", extensions: ["txt"] }
            ]
          });
          console.info("File picker dialog result:", result);

          if (!result[0] || !result[0].length) {
            console.info("No file selected, user cancelled");
            return; // User cancelled
          }

          const clippingsPath = result[0];
          console.info("Selected file path:", clippingsPath);
          
          // Save the path for next time
          await joplin.settings.setValue("lastClippingsPath", clippingsPath);
          console.info("Saved path to settings");
          
          // Check if file exists and is readable
          if (!fs.existsSync(clippingsPath)) {
            console.error("File not found:", clippingsPath);
            await joplin.views.dialogs.showMessageBox("File not found: " + clippingsPath);
            return;
          }
          
          // 2. Parse the clippings file
          console.info("Parsing clippings file...");
          const clippings = parseClippingsFile(clippingsPath);
          console.info(`Found ${clippings.length} clippings`);
          
          if (clippings.length === 0) {
            await joplin.views.dialogs.showMessageBox("No clippings found in the file. Please check that you selected the correct file.");
            return;
          }
          
          // 3. Organize clippings by book
          const books = organizeByBook(clippings);
          console.info(`Found ${books.size} books`);
          
          // 4. Show book selection dialog with a unique ID to prevent conflicts
          const uniqueId = Date.now().toString();
          const bookSelectionHandle = await joplin.views.dialogs.create(`bookSelectionDialog-${uniqueId}`);
          
          // Set dialog to be wider
          await joplin.views.dialogs.setFitToContent(bookSelectionHandle, false);
          
          // Add the CSS
          await joplin.views.dialogs.addScript(bookSelectionHandle, './bookSelection.css');
          
          // Create HTML for book selection
          let bookListHtml = '';
          let index = 0;
          
          for (const [_, book] of books) {
            const bookTitle = book.title;
            const author = book.author ? book.author : 'Unknown Author';
            const clippingCount = book.clippings.length;
            
            bookListHtml += `
              <div class="book-item">
                <label>
                  <input type="checkbox" class="book-checkbox" name="book-${index}" value="1" checked>
                  <span class="book-title">${bookTitle}</span>
                  <span class="book-author">by ${author}</span>
                  <span class="clipping-count">(${clippingCount} clippings)</span>
                </label>
              </div>
            `;
            
            index++;
          }
          
          // Set the HTML content with a proper form
          await joplin.views.dialogs.setHtml(bookSelectionHandle, `
            <form id="book-selection-form">
              <div id="book-selection">
                <h1>Select Books to Import</h1>
                <p>Choose which books you want to import from the ${books.size} books found in your clippings file.</p>
                
                <div class="actions">
                  <button id="select-all" type="button">Select All</button>
                  <button id="select-none" type="button">Select None</button>
                </div>
                
                <div class="book-list">
                  ${bookListHtml}
                </div>
                
                <div style="margin-top: 20px;">
                  <label>
                    Import to notebook:
                    <input type="text" name="notebookName" value="${await joplin.settings.value('notebookName')}">
                  </label>
                </div>
                
                <div style="margin-top: 10px;">
                  <label>
                    <input type="checkbox" name="tagWithAuthor" ${await joplin.settings.value('tagWithAuthor') ? 'checked' : ''}>
                    Add author tags
                  </label>
                </div>
              </div>
            </form>
          `);
          
          // Add the script
          await joplin.views.dialogs.addScript(bookSelectionHandle, './bookSelection.js');
          
          // Set the buttons
          await joplin.views.dialogs.setButtons(bookSelectionHandle, [
            {
              id: 'cancel',
              title: 'Cancel'
            },
            {
              id: 'ok',
              title: 'Import Selected'
            }
          ]);
          
          // Show the dialog
          console.info("Opening book selection dialog");
          const bookSelectionResult = await joplin.views.dialogs.open(bookSelectionHandle);
          console.info("Book selection dialog result:", bookSelectionResult);
          
          // If user cancelled, stop here
          if (bookSelectionResult.id !== 'ok') {
            console.info("User cancelled book selection");
            return;
          }
          
          // Get the selected books
          const selectedBooks = new Map<string, BookData>();
          let bookIndex = 0;
          
          console.info("Form data:", bookSelectionResult.formData);
          
          // Handle the case where form data is nested under a "null" key
          const formData = bookSelectionResult.formData.null || bookSelectionResult.formData;
          console.info("Processed form data:", formData);
          
          for (const [key, book] of books) {
            const formKey = `book-${bookIndex}`;
            const formValue = formData[formKey];
            console.info(`Book ${bookIndex} (${book.title}) form value:`, formValue);
            
            // Check if the book is selected (value could be 'true', true, or '1')
            if (formValue === 'true' || formValue === true || formValue === '1') {
              console.info(`Adding book ${book.title} to selected books`);
              selectedBooks.set(key, book);
            }
            bookIndex++;
          }
          
          console.info(`Selected ${selectedBooks.size} books for import`);
          
          if (selectedBooks.size === 0) {
            await joplin.views.dialogs.showMessageBox("No books selected for import.");
            return;
          }
          
          // Save the notebook name setting
          const notebookName = formData.notebookName || bookSelectionResult.formData.notebookName;
          await joplin.settings.setValue('notebookName', notebookName);
          console.info("Saved notebook name:", notebookName);
          
          // Save the tag with author setting
          const tagWithAuthor = !!formData.tagWithAuthor || !!bookSelectionResult.formData.tagWithAuthor;
          await joplin.settings.setValue('tagWithAuthor', tagWithAuthor);
          console.info("Saved tag with author setting:", tagWithAuthor);
          
          // 5. Show progress dialog with a unique ID
          const progressHandle = await joplin.views.dialogs.create(`importProgressDialog-${uniqueId}`);
          
          await joplin.views.dialogs.setHtml(progressHandle, `
            <div id="import-progress">
              <h1>Importing Kindle Highlights</h1>
              <div class="progress-bar">
                <div class="progress-bar-inner" style="width: 0%"></div>
              </div>
              <p class="book-status">Preparing to import...</p>
            </div>
          `);
          
          // No buttons - we'll close it programmatically
          await joplin.views.dialogs.setButtons(progressHandle, []);
          
          // Show the dialog (don't await, so we can update it)
          const progressPromise = joplin.views.dialogs.open(progressHandle);
          
          // 6. Import the selected books
          try {
            // Create a progress callback
            const progressCallback = async (current: number, total: number, bookTitle: string) => {
              const percent = Math.round((current / total) * 100);
              
              // Update the progress dialog
              await joplin.views.dialogs.setHtml(progressHandle, `
                <div id="import-progress">
                  <h1>Importing Kindle Highlights</h1>
                  <div class="progress-bar">
                    <div class="progress-bar-inner" style="width: ${percent}%"></div>
                  </div>
                  <p class="book-status">Importing ${bookTitle} (${current}/${total})</p>
                </div>
              `);
            };
            
            // Create the export options
            const exportOptions: ExportOptions = {
              notebookName,
              skipDuplicates: true,
              tagWithAuthor,
              progressCallback
            };
            
            // Get the Joplin data API
            const joplinData = joplin.data;
            
            // Export to Joplin
            await exportToJoplin(selectedBooks, joplinData, exportOptions);
            
            // Update the progress dialog to show completion
            await joplin.views.dialogs.setHtml(progressHandle, `
              <div id="import-progress">
                <h1>Import Complete</h1>
                <p>Successfully imported highlights from ${selectedBooks.size} books.</p>
              </div>
            `);
            
            // Add a close button
            await joplin.views.dialogs.setButtons(progressHandle, [
              {
                id: 'ok',
                title: 'Close'
              }
            ]);
            
            // Wait for the dialog to close
            await progressPromise;
            
          } catch (error) {
            // Close the progress dialog
            await joplin.views.dialogs.setButtons(progressHandle, [
              {
                id: 'ok',
                title: 'Close'
              }
            ]);
            
            // Wait for the dialog to close
            await progressPromise;
            
            // Show error message
            throw error;
          }
        } catch (error) {
          await joplin.views.dialogs.showMessageBox(`Error importing highlights: ${error.message}`);
          console.error("Error importing Kindle highlights:", error);
        }
      }
    });

    // Add the command to the tools menu with a more descriptive ID
    await joplin.views.menuItems.create("kindle2joplin.tools", "importKindleHighlights", MenuItemLocation.Tools, {
      accelerator: "CmdOrCtrl+Option+K"
    });
    
    // Also add to the File menu for better visibility
    await joplin.views.menuItems.create("kindle2joplin.file", "importKindleHighlights", MenuItemLocation.File);

    // Add a button to the toolbar
    await joplin.views.toolbarButtons.create("kindleImportButton", "importKindleHighlights", ToolbarButtonLocation.NoteToolbar);
  },
});
