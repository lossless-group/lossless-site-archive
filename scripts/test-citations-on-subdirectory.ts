/**
 * Test Citation Processing on Specific Subdirectory
 * 
 * This script runs the citation processing on a specific subdirectory
 * without affecting other content. It's useful for testing the citation
 * functionality in isolation.
 * 
 * Usage:
 *   ts-node scripts/test-citations-on-subdirectory.ts <subdirectory-path>
 * 
 * Example:
 *   ts-node scripts/test-citations-on-subdirectory.ts content/lost-in-public/prompts
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';
import { processCitations } from '../tidyverse/observers/services/citationService';
import { ReportingService } from '../tidyverse/observers/services/reportingService';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Citation Registry interface
 * Represents the citation registry used by the citation service
 */
interface CitationRegistry {
  getRegistryPath(): string;
  getStatistics?(): Promise<{
    totalCitations: number;
    uniqueSources: number;
    filesWithCitations: number;
  }>;
  loadFromDisk(): Promise<void>;
  saveToDisk(): Promise<void>;
  getAllCitations(): Map<string, any>;
}

/**
 * Get the citation registry instance
 * This is a wrapper around the CitationRegistry.getInstance() method
 * to avoid direct dependency on the CitationRegistry class
 */
async function getCitationRegistry(): Promise<CitationRegistry> {
  // Dynamic import to avoid circular dependencies
  const citationService = await import('../tidyverse/observers/services/citationService');
  const registry = citationService.CitationRegistry.getInstance();
  
  // Add missing methods if needed
  if (!registry.getRegistryPath) {
    registry.getRegistryPath = function() {
      return path.join(process.cwd(), '../../site/src/content/citations/citation-registry.json');
    };
  }
  
  if (!registry.getStatistics) {
    registry.getStatistics = async function() {
      const citations = this.getAllCitations();
      const uniqueFiles = new Set<string>();
      
      // Count unique files
      citations.forEach((citation: any) => {
        citation.files.forEach((file: string) => uniqueFiles.add(file));
      });
      
      // Count unique sources
      const uniqueSources = new Set<string>();
      citations.forEach((citation: any) => {
        if (citation.sourceText) {
          uniqueSources.add(citation.sourceText);
        }
      });
      
      return {
        totalCitations: citations.size,
        uniqueSources: uniqueSources.size,
        filesWithCitations: uniqueFiles.size
      };
    };
  }
  
  return registry;
}

/**
 * Generate a detailed report of the citation processing
 * @param directoryPath The directory that was processed
 * @param files All files that were processed
 * @param changedFiles Files that were changed
 * @param totalCitationsConverted Total number of citations converted
 * @param citationRegistry The citation registry instance
 * @returns The report content
 */
async function generateReport(
  directoryPath: string,
  files: string[],
  changedFiles: string[],
  totalCitationsConverted: number,
  citationRegistry: CitationRegistry
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const reportTitle = `Citation Processing Report - ${timestamp}`;
  
  let report = `# ${reportTitle}\n\n`;
  report += `## Summary\n\n`;
  report += `- **Directory Processed**: \`${directoryPath}\`\n`;
  report += `- **Files Processed**: ${files.length}\n`;
  report += `- **Files Changed**: ${changedFiles.length}\n`;
  report += `- **Citations Converted**: ${totalCitationsConverted}\n`;
  report += `- **Citation Registry Location**: \`${citationRegistry.getRegistryPath()}\`\n\n`;
  
  // Add registry statistics
  const registryStats = await citationRegistry.getStatistics();
  report += `## Citation Registry Statistics\n\n`;
  report += `- **Total Citations**: ${registryStats.totalCitations}\n`;
  report += `- **Unique Sources**: ${registryStats.uniqueSources}\n`;
  report += `- **Files With Citations**: ${registryStats.filesWithCitations}\n\n`;
  
  // List changed files
  if (changedFiles.length > 0) {
    report += `## Files With Citation Changes\n\n`;
    for (const file of changedFiles) {
      const relativePath = path.relative(process.cwd(), file);
      report += `- \`${relativePath}\`\n`;
    }
    report += '\n';
  }
  
  return report;
}

/**
 * Save the report to a file
 * @param report The report content
 * @returns The path to the saved report
 */
async function saveReport(report: string): Promise<string> {
  // Create reports directory if it doesn't exist
  const reportsDir = path.resolve(process.cwd(), '../../content/reports');
  await fs.mkdir(reportsDir, { recursive: true });
  
  // Create report file
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const reportPath = path.join(reportsDir, `citation-report-${timestamp}.md`);
  await fs.writeFile(reportPath, report, 'utf8');
  
  return reportPath;
}

/**
 * Find all Markdown files in a directory recursively
 * @param directoryPath The directory to search
 * @returns Array of file paths
 */
async function findMarkdownFiles(directoryPath: string): Promise<string[]> {
  const result: string[] = [];
  
  // Read directory contents
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  
  // Process each entry
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively search subdirectories
      const subDirFiles = await findMarkdownFiles(entryPath);
      result.push(...subDirFiles);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // Add markdown files to the result
      result.push(entryPath);
    }
  }
  
  return result;
}

/**
 * Process citations in a specific directory
 * @param directoryPath The directory to process
 * @param reportingService The reporting service to use
 * @returns Statistics about the processing
 */
async function processCitationsInDirectory(directoryPath: string, reportingService: ReportingService) {
  console.log(`Processing citations in directory: ${directoryPath}`);
  
  // Get citation registry instance
  const citationRegistry = await getCitationRegistry();
  console.log(`Citation registry location: ${citationRegistry.getRegistryPath()}`);
  
  // Load existing registry from disk
  await citationRegistry.loadFromDisk();
  const stats = await citationRegistry.getStatistics();
  console.log(`Loaded citation registry with ${stats.totalCitations} citations`);
  
  // Find all markdown files in the directory
  const files = await findMarkdownFiles(directoryPath);
  console.log(`Found ${files.length} markdown files to process`);
  
  // Process each file
  let totalCitationsConverted = 0;
  let totalFilesChanged = 0;
  const changedFiles: string[] = [];
  
  for (const filePath of files) {
    try {
      console.log(`Processing file: ${filePath}`);
      
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // Process citations
      const result = await processCitations(content, filePath);
      
      // Update the file if needed
      if (result.changed) {
        await fs.writeFile(filePath, result.updatedContent, 'utf8');
        console.log(`Updated file: ${filePath} (converted ${result.stats.citationsConverted} citations)`);
        totalCitationsConverted += result.stats.citationsConverted;
        totalFilesChanged++;
        changedFiles.push(filePath);
        
        // Log citation conversion to reporting service
        reportingService.logCitationConversion(filePath, result.stats.citationsConverted);
      } else {
        console.log(`No changes needed for file: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }
  
  // Save the citation registry
  await citationRegistry.saveToDisk();
  console.log(`Saved citation registry to ${citationRegistry.getRegistryPath()}`);
  
  console.log('\nCitation Processing Summary:');
  console.log(`Total files processed: ${files.length}`);
  console.log(`Total files changed: ${totalFilesChanged}`);
  console.log(`Total citations converted: ${totalCitationsConverted}`);
  
  return {
    filesProcessed: files.length,
    filesChanged: totalFilesChanged,
    citationsConverted: totalCitationsConverted,
    changedFiles
  };
}

/**
 * Main function
 */
async function main() {
  // Get directory path from command line arguments
  const directoryPath = process.argv[2];
  
  if (!directoryPath) {
    console.error('Error: No directory path provided');
    console.log('Usage: ts-node scripts/test-citations-on-subdirectory.ts <subdirectory-path>');
    console.log('Example: ts-node scripts/test-citations-on-subdirectory.ts content/lost-in-public/prompts');
    process.exit(1);
  }
  
  // Resolve to absolute path
  const absolutePath = path.resolve(process.cwd(), '../..', directoryPath);
  
  // Check if directory exists
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      console.error(`Error: ${absolutePath} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: Directory ${absolutePath} does not exist`);
    process.exit(1);
  }
  
  console.log(`Starting citation processing on directory: ${absolutePath}`);
  
  // Initialize reporting service
  const reportsDir = path.resolve(process.cwd(), '../../content/reports');
  const reportingService = new ReportingService(reportsDir);
  
  // Process citations in the directory
  const results = await processCitationsInDirectory(absolutePath, reportingService);
  
  // Generate a report
  const reportPath = await reportingService.writeReport();
  if (reportPath) {
    console.log(`Report saved to: ${reportPath}`);
  } else {
    console.log('No report was generated.');
  }
  
  console.log('Citation processing complete');
}

// Run the main function
main().catch(error => {
  console.error('Error running citation processor:', error);
  process.exit(1);
});
