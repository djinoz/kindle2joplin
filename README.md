# Kindle Highlights to Joplin

A Joplin plugin that imports highlights and notes from your Kindle device directly into Joplin notes.

## Features

- Import highlights and notes directly from Kindle's "My Clippings.txt" file
- Organize highlights with one note per book
- Select which books to import with a user-friendly interface
- Avoid duplicates when importing multiple times or from synced Kindles
- Group highlights by book location for easy reference
- Preserve important metadata (page numbers, locations, timestamps)
- Add tags automatically (book, kindle, author)
- Select target notebook for importing

## Installation

1. Download the latest release from the [Releases page](https://github.com/yourusername/joplin-kindle-plugin/releases)
2. Open Joplin
3. Go to Tools → Options → Plugins
4. Click "Install from file" and select the downloaded .jpl file
5. Restart Joplin

## Usage

1. Connect your Kindle device to your computer via USB
2. In Joplin, go to Tools → Import Kindle Highlights
3. Use the file picker to navigate to your Kindle device and select "My Clippings.txt"
   - This is typically found in the root directory of your Kindle
4. Select which books you want to import from the list
5. Choose which notebook to import the notes into
6. Click "Import" and wait for the process to complete

## Developer Documentation

This section serves as specification for developers who want to build, maintain or extend this plugin.

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

#### 2. Book Selection Dialog

This component allows users to select which books to import:
- Shows a list of all books found in the clippings file
- Each book has a checkbox to select/deselect
- Shows book title, author, and number of highlights
- "Select All" and "Select None" buttons for convenience
- Returns a list of selected books to the main process

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
  outputDir?: string;         // For standalone operation
  progressCallback?: (current: number, total: number, bookTitle: string) => Promise<void>;
}
```

### Duplicate Avoidance Strategy

The plugin uses a robust strategy to avoid duplicate entries:

1. Each clipping gets a unique hash based on book title, location and content
2. These hashes are stored as HTML comments in notes: `<!-- kindle-hash: HASH -->`
3. When importing again, existing notes are checked for these hashes
4. Only new clippings (with unique hashes) are added to existing notes
5. Notes are merged intelligently, maintaining proper location-based organization

This ensures that even when importing from different Kindle devices that share the same account (and thus have overlapping highlights), each highlight appears only once in your Joplin notes.

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

1. Using Joplin's dialog API for file picking and book selection
2. Using Joplin's data API to create and update notes
3. Using Joplin's settings API to store preferences
4. Registering commands, menu items, and toolbar buttons

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
   - Verify book selection dialog shows all books correctly
   - Test select all/none functionality
   - Verify progress reporting works correctly

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
- Joplin (for testing)

### Build Steps

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/joplin-kindle-plugin.git
   cd joplin-kindle-plugin
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the plugin:
   ```
   npm run build
   ```

4. The compiled plugin will be available in the `dist` folder

### Development Mode

For development, you can use the watch mode to automatically rebuild when files change:

```
npm run start
```

## License

This plugin is released under the MIT License. See the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgements

- The Joplin team for creating an amazing note-taking application
- All contributors and testers who helped improve this plugin
