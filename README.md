# Kindle Highlights to Joplin

A Joplin plugin that imports highlights and notes from your Kindle device directly into Joplin notes.

## Features

- Import highlights and notes directly from Kindle's "My Clippings.txt" file
- Organize highlights with one Joplin note per Kindle book
- Select which books to import with a user-friendly interface
- Avoid duplicates when importing multiple times or from synced Kindles
- Preserve important metadata (page numbers, locations, timestamps)
- Add tags automatically (book, kindle, author)
- Select target notebook from a dropdown of existing notebooks
- Add additional tags to imported notes from a multi-select checklist
- User-friendly import dialog with settings at the top for easy access

## Hold on, why are you importing from a text file?

There is an excellent way to view your highlights on the web using https://read.amazon.com/notebook. But it has some problems:
1. Your highlights aren't yours. Amazon could rug-pull you anytime they like.
2. It only works for Amazon purchased books.
3. By implication of #2 people who use "Send to Kindle" do not get their highlights and notes anywhere but on the text file. I personally send (HEAPS of) web pages and PDFs to Kindle so this is a key part of my workflow.

## Installation

1. Download the latest .jpl from the https://github.com/djinoz/kindle2joplin/publish
2. Open Joplin
3. Go to Tools → Options → Plugins
4. Click "Install from file" and select the downloaded .jpl file
5. Restart Joplin

## Usage

1. Connect your Kindle device to your computer via USB
2. In Joplin, go to Tools → Import Kindle Highlights
3. Use the file picker to navigate to your Kindle device and select "My Clippings.txt"
   - This may be found in the root or documents(?) directory of your Kindle
4. In the import dialog:
   - Select a target notebook from the dropdown menu
   - Choose whether to add author tags (in hindsight, I think this might pollute Joplin's tags YMMV)
   - Use the "Select All Tags" or "Select None Tags" buttons to quickly select or deselect all tags
   - Select any additional tags you want to apply to all imported notes
   - Use the "Select All" or "Select None" buttons to quickly select or deselect all books
   - Select which books you want to import from the list (all books are selected by default)
5. Click "Import Selected" to start the import process
6. A progress dialog will show the import status
7. When complete, click "Close" to finish

## TODO

1. Merge/Diff: Currently subsequent imports may overwrite the note (if it goes into the same notebook). **WARNING** I am not convinced the "Duplicate Avoidance Strategy" section is entirely true, it needs more testing. The approach may be fine if:
  - the note (title, content, tags, anything) hasn't been updated in Joplin. 
  - you are only using one kindle
  - you are only importing from the text file and not also importing from https://read.amazon.com/notebook
  - So having deltas and merge may be interesting but a bit of an edge case.
2. Some occassional fails on the author tag. Needs investigating...
3. Maybe implement importing from https://read.amazon.com/notebook (with consideration to the points above) 

### Project Structure

```
joplin-kindle-plugin/
├── src/
│   ├── index.ts                # Plugin entry point
│   ├── kindle-to-joplin.ts     # Core functionality
│   ├── bookSelection.js        # Book selection dialog script
│   ├── bookSelection.css       # Book selection dialog styles
├── manifest.json               # Plugin manifest
├── package.json                # NPM package definition
├── tsconfig.json               # TypeScript configuration
├── webpack.config.js           # Webpack configuration
└── README.md                   # This documentation file
```

### Core Components

#### 1. Kindle Clippings Parser

The parser reads and interprets the "My Clippings.txt" file format, which follows this pattern:

```
Title: Book Title (Optional Author Information)
- Your Highlight on Page X | Location Y-Z | Added on Month Day, Year Time AM/PM

The actual highlighted text or note content appears here.
==========
```

Key parsing logic:
- Split the file by the "==========" separator
- Extract title and author information from the first line
- Parse metadata (highlight type, page, location, timestamp) from the second line
- The remaining content is the actual highlight or note
- Create a unique hash for each entry to detect duplicates

#### 2. Import Dialog

This component allows users to configure import settings and select which books to import:
- **Notebook Selection**:
  - Dropdown menu populated with all notebooks from Joplin
  - Allows selecting the target notebook for imported notes
- **Tag Options**:
  - Checkbox to enable/disable author tags
  - Multi-select checklist of all tags from Joplin
  - "Select All Tags" and "Select None Tags" buttons for convenience
- **Book Selection**:
  - Shows a list of all books found in the clippings file
  - Each book has a checkbox to select/deselect
  - Shows book title, author, and number of highlights
  - "Select All" and "Select None" buttons for convenience
- Returns the selected books, notebook, and tags to the main process

#### 3. Import Engine

The import engine handles the actual creation of notes in Joplin:
- Creates one note per book with all highlights organized by location
- Detects duplicate entries using content hashing
- Updates existing notes rather than creating duplicates
- Adds appropriate tags (kindle, book, author)
- Shows progress as it imports each book

### Data Structures

#### KindleClipping

```typescript
interface KindleClipping {
  bookTitle: string;           // Title of the book
  author: string | null;       // Author name if available
  clipType: 'Highlight' | 'Note' | 'Bookmark';  // Type of clipping
  page: string | null;         // Page number if available
  locationStart: string;       // Start Kindle location 
  locationEnd: string;         // End Kindle location
  addedDate: Date | null;      // Timestamp when added
  content: string;             // Actual highlight/note text
  hash: string;                // Unique hash for duplicate detection
}
```

#### BookData

```typescript
interface BookData {
  title: string;              // Book title
  author: string | null;      // Author name
  clippings: KindleClipping[]; // Array of clippings for this book
}
```

#### ExportOptions

```typescript
interface ExportOptions {
  notebookId?: string;        // Target Joplin notebook ID
  notebookName?: string;      // Target notebook name (if ID not provided)
  skipDuplicates: boolean;    // Whether to skip duplicate entries
  tagWithAuthor: boolean;     // Whether to add author tags
  additionalTags?: string[];  // Additional tags to add to all notes
  outputDir?: string;         // For standalone operation
  progressCallback?: (current: number, total: number, bookTitle: string) => Promise<void>;
}
```

### Duplicate Avoidance Strategy

The plugin uses a strategy to avoid duplicate entries:

1. Each clipping gets a unique hash based on book title, location and content
2. These hashes are stored as HTML comments in notes: `<!-- kindle-hash: HASH -->`
3. When importing again, existing notes are checked for these hashes
4. Only new clippings (with unique hashes) are added to existing notes
5. Notes are merged intelligently, maintaining proper location-based organization

This attempts to address that even when importing from different Kindle devices that share the same account (and thus have overlapping highlights), each highlight appears only once in your Joplin notes.

### Note Format

The plugin creates structured, readable notes following this format:

```markdown
# Book Title - Author Name

## Highlights and Notes

### Location 123-125 (Page 42)
> This is the highlighted text.
*Added on 2023-04-15*

### Location 230-232
> Another highlight from later in the book.
*Added on 2023-04-16*

<!-- kindle-hash: 5a1b3c7e9d2f4g6h8i0j -->
<!-- kindle-hash: 1a2b3c4d5e6f7g8h9i0j -->
```

The hash comments at the end are hidden in Joplin's rendered view but allow the plugin to track which highlights have already been imported.

### Joplin Plugin Integration

The plugin integrates with Joplin's plugin API:

1. Using Joplin's dialog API for file picking and import configuration
2. Using Joplin's data API to:
   - Create and update notes
   - Fetch all notebooks for the dropdown selection
   - Fetch all tags for the multi-select checklist
   - Apply tags to imported notes
3. Using Joplin's settings API to:
   - Store user preferences (notebook ID, author tags, additional tags)
   - Restore previous selections when reopening the import dialog
4. Registering commands, menu items, and toolbar buttons for easy access

### Testing Strategy

When developing or testing changes to this plugin, follow these steps:

1. **Parser Testing**:
   - Test with various Kindle clippings files
   - Include different languages, special characters
   - Test with malformed entries to ensure error handling

2. **Duplicate Detection Testing**:
   - Import the same file multiple times
   - Verify no duplicates are created
   - Import from different clippings files with overlapping content

3. **UI Testing**:
   - Verify import dialog shows all books correctly
   - Test book selection with select all/none functionality
   - Verify notebook dropdown shows all notebooks correctly
   - Test tag selection with select all/none functionality
   - Verify selected settings are saved and restored between sessions
   - Test with a large number of books and tags to ensure UI remains usable
   - Verify progress reporting works correctly during import

4. **Performance Testing**:
   - Test with large clippings files (100+ books, 1000+ highlights)
   - Verify memory usage remains reasonable
   - Ensure UI remains responsive during import

5. **Edge Cases**:
   - Test with books having identical titles but different authors
   - Test with unusual metadata (missing pages, very long locations)
   - Test notes containing special formatting or characters

## Building From Source

### Prerequisites

- Node.js 14+
- npm or yarn
- Joplin (for testing and using)

### Build Steps

1. Clone the repository:
   ```
   git clone https://github.com/djinoz/kindle2joplin
   cd joplin-kindle-plugin
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the plugin:
   ```
   npm run dist
   ```

4. The compiled plugin will be available in the `dist` folder

### Development Mode

In Joplin plugins, under "Show Advanced Settings", you can add multiple plugin paths, each separated by a comma. You will need to restart the application for the changes to take effect. Set it to the root of your project (NOT publish or dist)


## License

This plugin is released under the MIT License. See [LICENSE file for details.](https://opensource.org/license/mit)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgements

- The Joplin team for creating an amazing note-taking application
- Cline and Claude 3.7 (who did the bulk of the work)
- All contributors and testers who helped improve this plugin
