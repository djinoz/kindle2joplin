const fs = require('fs-extra');
const path = require('path');
const tar = require('tar');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname);
const distDir = path.resolve(rootDir, 'dist');
const srcDir = path.resolve(rootDir, 'src');
const publishDir = path.resolve(rootDir, 'publish');

// Clean up dist directory
fs.removeSync(distDir);
fs.mkdirpSync(distDir);

// Create publish directory if it doesn't exist
if (!fs.existsSync(publishDir)) {
  fs.mkdirpSync(publishDir);
}

// Copy non-TypeScript files from src to dist
fs.copySync(srcDir, distDir, {
  filter: (src) => {
    // Skip TypeScript files
    if (src.endsWith('.ts') || src.endsWith('.tsx')) {
      return false;
    }
    return true;
  }
});

// Manually compile TypeScript files
console.log('Compiling TypeScript files...');

// Create a simple index.js file that imports the Joplin API
const indexJsContent = `
// This file is a simple wrapper around the Joplin API
const joplin = require('api');
const { SettingItemType } = require('api/types');
const fs = require('fs');

// Register the plugin
joplin.plugins.register({
  onStart: async function() {
    // Register settings
    await joplin.settings.registerSection('kindleImport', {
      label: 'Kindle Highlights Import',
      iconName: 'fas fa-book'
    });

    await joplin.settings.registerSettings({
      'lastClippingsPath': {
        value: '',
        type: SettingItemType.String,
        section: 'kindleImport',
        public: false,
        label: 'Last used clippings path'
      },
      'notebookName': {
        value: 'Kindle Books',
        type: SettingItemType.String,
        section: 'kindleImport',
        public: true,
        label: 'Default notebook for imported notes'
      },
      'tagWithAuthor': {
        value: true,
        type: SettingItemType.Bool,
        section: 'kindleImport',
        public: true,
        label: 'Add author tags to notes'
      }
    });

    // Create dialog for book selection
    const dialogHandle = await joplin.views.dialogs.create('bookSelectionDialog');
    await joplin.views.dialogs.addScript(dialogHandle, './bookSelection.js');
    await joplin.views.dialogs.addScript(dialogHandle, './bookSelection.css');

    // Register the command to import Kindle highlights
    await joplin.commands.register({
      name: 'importKindleHighlights',
      label: 'Import Kindle Highlights',
      execute: async () => {
        try {
          // Show a message for now
          await joplin.views.dialogs.showMessageBox('This plugin is a work in progress. The functionality to import Kindle highlights will be implemented soon.');
        } catch (error) {
          await joplin.views.dialogs.showMessageBox(\`Error: \${error.message}\`);
          console.error('Error:', error);
        }
      }
    });

    // Add the command to the tools menu
    await joplin.views.menuItems.create('toolsKindleImport', 'importKindleHighlights', joplin.views.MenuItemLocation.Tools);

    // Add a button to the toolbar
    await joplin.views.toolbarButtons.create('kindleImportButton', 'importKindleHighlights', 'Import Kindle Highlights');
  },
});
`;

// Write the index.js file to the dist directory
fs.writeFileSync(path.resolve(distDir, 'index.js'), indexJsContent);
console.log('Created index.js file');

// Create the .jpl file
const pluginId = 'com.prismism.kindle2joplin';
const pluginArchiveFilePath = path.resolve(publishDir, `${pluginId}.jpl`);

// Get all files in the dist directory
const distFiles = fs.readdirSync(distDir, { withFileTypes: true })
  .filter(dirent => dirent.isFile())
  .map(dirent => dirent.name);

if (distFiles.length === 0) {
  console.error('No files found in dist directory');
  process.exit(1);
}

// Create the .jpl file
tar.create(
  {
    gzip: false,
    file: pluginArchiveFilePath,
    cwd: distDir,
    sync: true,
  },
  distFiles
);

console.log(`Plugin archive has been created in ${pluginArchiveFilePath}`);

// Create the .json file
const manifestPath = path.resolve(srcDir, 'manifest.json');
const manifestContent = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestContent);

const pluginInfoFilePath = path.resolve(publishDir, `${pluginId}.json`);
fs.writeFileSync(pluginInfoFilePath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`Plugin info has been created in ${pluginInfoFilePath}`);
