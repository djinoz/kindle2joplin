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

    // Fetch all notebooks for the dropdown
    const folders = await joplin.data.get(['folders']);
    const notebookOptions: Record<string, string> = {};
    
    // Add notebooks to options
    for (const folder of folders.items) {
      notebookOptions[folder.id] = folder.title;
    }

    // Fetch all tags for the multi-select
    const tags = await joplin.data.get(['tags']);
    const tagOptions: Record<string, string> = {};
    
    // Add tags to options
    for (const tag of tags.items) {
      tagOptions[tag.id] = tag.title;
    }

    await joplin.settings.registerSettings({
      "lastClippingsPath": {
        value: "",
        type: SettingItemType.String,
        section: "kindleImport",
        public: false,
        label: "Last used clippings path"
      },
      "notebookId": {
        value: "",
        type: SettingItemType.String,
        section: "kindleImport",
        public: true,
        label: "Default notebook for imported notes",
        isEnum: true,
        options: notebookOptions
      },
      "tagWithAuthor": {
        value: true,
        type: SettingItemType.Bool,
        section: "kindleImport",
        public: true,
        label: "Add author tags to notes"
      },
      "additionalTags": {
        value: [],
        type: SettingItemType.Array,
        section: "kindleImport",
        public: false, // Changed to false since we'll manage this through the import dialog
        label: "Additional tags to add to imported notes",
        description: "This setting stores the selected tags but is managed through the import dialog"
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
          
          // Get settings values for the form
          const selectedNotebookId = await joplin.settings.value('notebookId');
          const tagWithAuthorValue = await joplin.settings.value('tagWithAuthor');
          const selectedTags = await joplin.settings.value('additionalTags') || [];
          
          // Create notebook options HTML
          const notebookOptionsHtml = Object.entries(notebookOptions).map(([id, title]) => 
            `<option value="${id}" ${id === selectedNotebookId ? 'selected' : ''}>${title}</option>`
          ).join('');
          
          // Create tag options HTML
          const tagOptionsHtml = Object.entries(tagOptions).map(([id, title]) => `
            <div class="tag-item">
              <label>
                <input type="checkbox" name="tag-${id}" value="${id}" ${selectedTags.includes(id) ? 'checked' : ''}>
                ${title}
              </label>
            </div>
          `).join('');
          
          // Set the HTML content with a proper form
          await joplin.views.dialogs.setHtml(bookSelectionHandle, `
            <form id="book-selection-form">
              <div id="book-selection">
                <h1>Import Kindle Highlights</h1>
                
                <div style="margin-top: 20px;">
                  <label>
                    Import to notebook:
                    <select name="notebookId">
                      <option value="">-- Select a notebook --</option>
                      ${notebookOptionsHtml}
                    </select>
                  </label>
                </div>
                
                <div style="margin-top: 10px;">
                  <label>
                    <input type="checkbox" name="tagWithAuthor" ${tagWithAuthorValue ? 'checked' : ''}>
                    Add author tags
                  </label>
                </div>
                
                <div style="margin-top: 10px; margin-bottom: 20px;">
                  <label>Additional tags:</label>
                  <div style="margin-top: 5px; margin-bottom: 5px;">
                    <button id="select-all-tags" type="button" class="tag-button">Select All Tags</button>
                    <button id="select-none-tags" type="button" class="tag-button">Select None Tags</button>
                  </div>
                  <div class="tag-list" style="max-height: 150px; overflow-y: auto; border: 1px solid #ccc; padding: 5px; margin-top: 5px;">
                    ${tagOptionsHtml}
                  </div>
                </div>
                
                <h2>Select Books to Import</h2>
                <p>Choose which books you want to import from the ${books.size} books found in your clippings file.</p>
                
                <div class="actions">
                  <button id="select-all" type="button">Select All</button>
                  <button id="select-none" type="button">Select None</button>
                </div>
                
                <div class="book-list">
                  ${bookListHtml}
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
          
          // Save the notebook ID setting
          const notebookId = formData.notebookId || bookSelectionResult.formData.notebookId;
          await joplin.settings.setValue('notebookId', notebookId);
          console.info("Saved notebook ID:", notebookId);
          
          // Save the tag with author setting
          const tagWithAuthor = !!formData.tagWithAuthor || !!bookSelectionResult.formData.tagWithAuthor;
          await joplin.settings.setValue('tagWithAuthor', tagWithAuthor);
          console.info("Saved tag with author setting:", tagWithAuthor);
          
          // Process selected tags
          const selectedTagIds: string[] = [];
          for (const key in formData) {
            if (key.startsWith('tag-') && (formData[key] === 'true' || formData[key] === true || formData[key] === '1')) {
              const tagId = key.substring(4); // Remove 'tag-' prefix
              selectedTagIds.push(tagId);
            }
          }
          
          // Save selected tags
          await joplin.settings.setValue('additionalTags', selectedTagIds);
          console.info("Saved selected tags:", selectedTagIds);
          
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
            
            // Get notebook name if needed (for backward compatibility)
            let notebookName;
            if (!notebookId && formData.notebookName) {
              notebookName = formData.notebookName;
              await joplin.settings.setValue('notebookName', notebookName);
              console.info("Saved notebook name:", notebookName);
            }
            
            // Create the export options
            const exportOptions: ExportOptions = {
              notebookId,
              notebookName,
              skipDuplicates: true,
              tagWithAuthor,
              additionalTags: selectedTagIds,
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
