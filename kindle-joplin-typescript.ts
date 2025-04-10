/**
 * Kindle Clippings to Joplin Exporter - TypeScript Implementation
 * 
 * Features:
 * - Parse Kindle My Clippings.txt file
 * - Export highlights and notes to Joplin with one note per book
 * - Avoid duplicates through content hashing and metadata comparison
 * - Designed to run as a Joplin plugin
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// For Joplin Plugin integration
interface JoplinData {
  get: (path: string[], query?: any) => Promise<any>;
  post: (path: string[], body?: any, query?: any) => Promise<any>;
  put: (path: string[], body?: any, query?: any) => Promise<any>;
}

interface JoplinSettings {
  namespace: string;
  value: string;
}

interface JoplinWorkspace {
  selectedFolder: () => Promise<any>;
}

interface JoplinPluginContext {
  data: JoplinData;
  settings: JoplinSettings;
  workspace: JoplinWorkspace;
}

// Types for Kindle clippings
interface KindleClipping {
  bookTitle: string;
  author: string | null;
  clipType: 'Highlight' | 'Note' | 'Bookmark';
  page: string | null;
  locationStart: string;
  locationEnd: string;
  addedDate: Date | null;
  content: string;
  hash: string;
}

interface BookData {
  title: string;
  author: string | null;
  clippings: KindleClipping[];
}

interface ExportOptions {
  notebookId?: string;
  notebookName?: string;
  skipDuplicates: boolean;
  tagWithAuthor: boolean;
  outputDir?: string;
  progressCallback?: (current: number, total: number, bookTitle: string) => Promise<void>;
}

// Constants
const SEPARATOR = "==========";
const TITLE_PATTERN = /^(.+?)(\s+\((.+?)\))?$/;
const METADATA_PATTERN = /- Your (Highlight|Note|Bookmark)(?: on Page (\d+))? \| Location (\d+)-(\d+) \| Added on (.+)$/;

/**
 * Parse the My Clippings.txt file and return an array of KindleClipping objects
 */
function parseClippingsFile(filePath: string): KindleClipping[] {
  const clippings: KindleClipping[] = [];
  
  // Read file with UTF-8 encoding (with BOM handling)
  let content = fs.readFileSync(filePath, { encoding: 'utf8' });
  
  // Remove BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  
  // Split the file by the separator
  const entries = content.split(SEPARATOR);
  
  for (const entry of entries) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) continue;
    
    const lines = trimmedEntry.split('\n');
    if (lines.length < 2) continue;
    
    // Parse the title line
    const titleLine = lines[0].trim();
    const titleMatch = titleLine.match(TITLE_PATTERN);
    if (!titleMatch) continue;
    
    const bookTitle = titleMatch[1].trim();
    const author = titleMatch[3] ? titleMatch[3].trim() : null;
    
    // Parse the metadata line
    const metadataLine = lines[1].trim();
    const metadataMatch = metadataLine.match(METADATA_PATTERN);
    if (!metadataMatch) continue;
    
    const clipType = metadataMatch[1] as 'Highlight' | 'Note' | 'Bookmark';
    const page = metadataMatch[2] || null;
    const locationStart = metadataMatch[3];
    const locationEnd = metadataMatch[4];
    const addedDateStr = metadataMatch[5];
    
    // Parse the added date
    let addedDate: Date | null = null;
    try {
      // Format: "Month Day, Year Time AM/PM"
      addedDate = new Date(addedDateStr);
    } catch (e) {
      // If date parsing fails, leave as null
    }
    
    // Get the content (everything after the metadata line)
    const content = lines.slice(2).join('\n').trim();
    
    // Create a hash for duplicate detection
    // Use book title, location, and content for uniqueness
    const hashSource = `${bookTitle}|${locationStart}-${locationEnd}|${content}`;
    const hash = crypto.createHash('md5').update(hashSource).digest('hex');
    
    clippings.push({
      bookTitle,
      author,
      clipType,
      page,
      locationStart,
      locationEnd,
      addedDate,
      content,
      hash
    });
  }
  
  return clippings;
}

/**
 * Organize clippings by book title and return a Map
 */
function organizeByBook(clippings: KindleClipping[]): Map<string, BookData> {
  const books = new Map<string, BookData>();
  
  for (const clip of clippings) {
    const key = clip.bookTitle;
    
    if (!books.has(key)) {
      books.set(key, {
        title: clip.bookTitle,
        author: clip.author,
        clippings: []
      });
    }
    
    const book = books.get(key)!;
    book.clippings.push(clip);
  }
  
  return books;
}

/**
 * Create a markdown note from book data
 */
function createMarkdownNote(book: BookData): string {
  const { title, author, clippings } = book;
  
  // Sort clippings by location
  clippings.sort((a, b) => {
    return parseInt(a.locationStart, 10) - parseInt(b.locationStart, 10);
  });
  
  const noteTitle = author ? `${title} - ${author}` : title;
  
  let lines: string[] = [
    `# ${noteTitle}`,
    "",
    "## Highlights and Notes",
    ""
  ];
  
  for (const clip of clippings) {
    if (clip.clipType === "Bookmark") continue; // Skip bookmarks
    
    let locationInfo = `Location ${clip.locationStart}-${clip.locationEnd}`;
    if (clip.page) {
      locationInfo += ` (Page ${clip.page})`;
    }
    
    lines.push(`### ${locationInfo}`);
    
    if (clip.clipType === "Highlight") {
      lines.push(`> ${clip.content}`);
    } else { // Note
      lines.push(clip.content);
    }
    
    if (clip.addedDate) {
      const dateStr = clip.addedDate.toISOString().split('T')[0];
      lines.push(`*Added on ${dateStr}*`);
    }
    
    lines.push("");
  }
  
  return lines.join('\n');
}

/**
 * Check for existing notes in Joplin to avoid duplicates
 */
async function findExistingNote(joplin: JoplinData, title: string): Promise<any | null> {
  // Search for exact title match
  const searchResults = await joplin.get(['search'], { 
    query: title, 
    type: 'note',
    fields: ['id', 'title', 'body']
  });
  
  if (searchResults && searchResults.items && searchResults.items.length > 0) {
    // Find exact title match
    for (const note of searchResults.items) {
      if (note.title === title) {
        return note;
      }
    }
  }
  
  return null;
}

/**
 * Extract existing clipping hashes from a note
 */
function extractExistingHashes(noteBody: string): Set<string> {
  const hashes = new Set<string>();
  
  // Look for hash metadata in the note body
  // Format: <!-- kindle-hash: HASH -->
  const hashRegex = /<!-- kindle-hash: ([a-f0-9]{32}) -->/g;
  let match;
  
  while ((match = hashRegex.exec(noteBody)) !== null) {
    hashes.add(match[1]);
  }
  
  return hashes;
}

/**
 * Merge new clippings with existing note content
 */
function mergeWithExistingNote(existingNoteBody: string, newClippings: KindleClipping[]): string {
  // Extract existing content sections (everything up to the last section)
  const sections = existingNoteBody.split('### Location ');
  
  // The first section contains the header (title, etc.)
  const headerSection = sections[0];
  
  // Process remaining sections to extract location data and content
  const existingLocations: { [key: string]: string } = {};
  
  for (let i = 1; i < sections.length; i++) {
    const section = '### Location ' + sections[i];
    
    // Extract location information using regex
    const locationMatch = section.match(/### Location (\d+)-(\d+)/);
    if (locationMatch) {
      const locationKey = `${locationMatch[1]}-${locationMatch[2]}`;
      existingLocations[locationKey] = section;
    }
  }
  
  // Sort new clippings
  newClippings.sort((a, b) => {
    return parseInt(a.locationStart, 10) - parseInt(b.locationStart, 10);
  });
  
  // Add new clippings
  for (const clip of newClippings) {
    if (clip.clipType === "Bookmark") continue; // Skip bookmarks
    
    const locationKey = `${clip.locationStart}-${clip.locationEnd}`;
    
    // Skip if location already exists
    if (locationKey in existingLocations) {
      continue;
    }
    
    let locationInfo = `Location ${clip.locationStart}-${clip.locationEnd}`;
    if (clip.page) {
      locationInfo += ` (Page ${clip.page})`;
    }
    
    let content = `### ${locationInfo}\n`;
    
    if (clip.clipType === "Highlight") {
      content += `> ${clip.content}\n`;
    } else { // Note
      content += `${clip.content}\n`;
    }
    
    if (clip.addedDate) {
      const dateStr = clip.addedDate.toISOString().split('T')[0];
      content += `*Added on ${dateStr}*\n`;
    }
    
    // Add hash metadata for future duplicate detection
    content += `<!-- kindle-hash: ${clip.hash} -->\n\n`;
    
    existingLocations[locationKey] = content;
  }
  
  // Reconstruct the note with all locations in order
  const allLocationKeys = Object.keys(existingLocations).sort((a, b) => {
    const [aStart] = a.split('-');
    const [bStart] = b.split('-');
    return parseInt(aStart, 10) - parseInt(bStart, 10);
  });
  
  const locationSections = allLocationKeys.map(key => existingLocations[key]);
  
  return headerSection + locationSections.join('');
}

/**
 * Export book notes to Joplin using the Joplin API
 */
async function exportToJoplin(
  books: Map<string, BookData>, 
  joplin: JoplinData, 
  options: ExportOptions
): Promise<void> {
  let notebookId = options.notebookId;
  
  // Create a notebook if name specified and ID not provided
  if (!notebookId && options.notebookName) {
    const response = await joplin.post(['folders'], { title: options.notebookName });
    if (response && response.id) {
      notebookId = response.id;
    }
  }
  
  // Setup for progress tracking
  let current = 0;
  const total = books.size;
  
  // Process each book
  for (const [_, book] of books) {
    const noteTitle = book.author ? `${book.title} - ${book.author}` : book.title;
    
    // Update progress if callback is provided
    if (options.progressCallback) {
      current++;
      await options.progressCallback(current, total, noteTitle);
    }
    
    // Set up tags
    const tags = ["kindle", "book", "highlights"];
    if (options.tagWithAuthor && book.author) {
      tags.push(`author:${book.author}`);
    }
    
    // Check for existing note to avoid duplicates
    let existingNote = null;
    if (options.skipDuplicates) {
      existingNote = await findExistingNote(joplin, noteTitle);
    }
    
    let noteContent: string;
    let existingHashes = new Set<string>();
    
    if (existingNote) {
      // Extract existing hashes to avoid duplicates
      existingHashes = extractExistingHashes(existingNote.body);
      
      // Filter out clippings that already exist
      const newClippings = book.clippings.filter(clip => !existingHashes.has(clip.hash));
      
      if (newClippings.length === 0) {
        console.log(`No new clippings for: ${noteTitle}`);
        continue;
      }
      
      // Merge with existing note
      noteContent = mergeWithExistingNote(existingNote.body, newClippings);
      
      // Update the note
      await joplin.put(['notes', existingNote.id], {
        title: noteTitle,
        body: noteContent,
        parent_id: notebookId || undefined
      });
      
      console.log(`Updated existing note: ${noteTitle} with ${newClippings.length} new clippings`);
    } else {
      // Create new note content with hash metadata for future duplicate detection
      const baseContent = createMarkdownNote(book);
      
      // Add hash metadata for each clipping
      const hashesContent = book.clippings
        .filter(clip => clip.clipType !== "Bookmark")
        .map(clip => `<!-- kindle-hash: ${clip.hash} -->`)
        .join('\n');
      
      noteContent = baseContent + '\n' + hashesContent;
      
      // Create the note
      const response = await joplin.post(['notes'], {
        title: noteTitle,
        body: noteContent,
        parent_id: notebookId || undefined
      });
      
      if (response && response.id) {
        // Add tags
        for (const tag of tags) {
          await joplin.post(['tags'], { title: tag });
          await joplin.post(['notes', response.id, 'tags'], { title: tag });
        }
        
        console.log(`Created new note: ${noteTitle}`);
      }
    }
  }
}

/**
 * Export book notes to markdown files
 */
async function exportToMarkdown(
  books: Map<string, BookData>, 
  options: ExportOptions
): Promise<void> {
  const outputDir = options.outputDir || 'kindle_notes';
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Process each book
  for (const [_, book] of books) {
    const noteTitle = book.author ? `${book.title} - ${book.author}` : book.title;
    const safeTitle = noteTitle.replace(/[^a-zA-Z0-9 \-_\.]/g, '_');
    
    const filePath = path.join(outputDir, `${safeTitle}.md`);
    
    let noteContent: string;
    let existingHashes = new Set<string>();
    
    // Check if file already exists for duplicate avoidance
    if (options.skipDuplicates && fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, { encoding: 'utf8' });
      
      // Extract existing hashes
      existingHashes = extractExistingHashes(existingContent);
      
      // Filter out clippings that already exist
      const newClippings = book.clippings.filter(clip => !existingHashes.has(clip.hash));
      
      if (newClippings.length === 0) {
        console.log(`No new clippings for: ${noteTitle}`);
        continue;
      }
      
      // Merge with existing content
      noteContent = mergeWithExistingNote(existingContent, newClippings);
      
      fs.writeFileSync(filePath, noteContent);
      console.log(`Updated existing file: ${filePath} with ${newClippings.length} new clippings`);
    } else {
      // Create new note content with hash metadata
      const baseContent = createMarkdownNote(book);
      
      // Add hash metadata for each clipping
      const hashesContent = book.clippings
        .filter(clip => clip.clipType !== "Bookmark")
        .map(clip => `<!-- kindle-hash: ${clip.hash} -->`)
        .join('\n');
      
      noteContent = baseContent + '\n' + hashesContent;
      
      fs.writeFileSync(filePath, noteContent);
      console.log(`Created new file: ${filePath}`);
    }
  }
}

/**
 * Main export function
 */
export async function exportKindleClippings(
  filePath: string, 
  joplinContext?: JoplinPluginContext, 
  options?: Partial<ExportOptions>
): Promise<void> {
  // Default options
  const defaultOptions: ExportOptions = {
    skipDuplicates: true,
    tagWithAuthor: true,
    outputDir: 'kindle_notes'
  };
  
  const mergedOptions: ExportOptions = { ...defaultOptions, ...options };
  
  // Parse the clippings file
  console.log(`Parsing ${filePath}...`);
  const clippings = parseClippingsFile(filePath);
  console.log(`Found ${clippings.length} clippings`);
  
  // Organize by book
  const books = organizeByBook(clippings);
  console.log(`Found ${books.size} books`);
  
  // Export based on available context
  if (joplinContext) {
    // Running as Joplin plugin
    await exportToJoplin(books, joplinContext.data, mergedOptions);
  } else {
    // Running as standalone script
    await exportToMarkdown(books, mergedOptions);
  }
  
  console.log("Export completed!");
}

// When running as standalone script
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error("Usage: ts-node kindle-to-joplin.ts <path-to-clippings-file> [output-directory]");
    process.exit(1);
  }
  
  const filePath = args[0];
  const outputDir = args[1] || 'kindle_notes';
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  
  exportKindleClippings(filePath, undefined, { outputDir });
}

// Export for Joplin plugin integration
export { KindleClipping, BookData, ExportOptions };
