/**
 * Filesystem Observer: Minimal Frontmatter Extraction Prototype
 *
 * PURPOSE: Watches the content directory for Markdown file additions/changes
 * and uses a static import of extractFrontmatter to aggressively log the extracted frontmatter.
 *
 * This is the first step in implementing the Filesystem Observer for Consistent Metadata in Markdown Files,
 * as specified in content/specs/Filesystem-Observer-for-Consistent-Metadata-in-Markdown-files.md.
 *
 * - NO dynamic imports
 * - NO mutation or destructive actions
 * - NO pipeline or handlers yet
 * - Aggressive, clear logging and commenting
 * - Modular and robust structure for future extension
 */

import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import { extractFrontmatter, writeFrontmatterToFile } from './utils/yamlFrontmatter';
import { addSiteUUID } from './handlers/addSiteUUID';
import { processOpenGraphMetadata } from './services/openGraphService';
import { extractStringValueForFrontmatter } from './utils/extractStringValueForFrontmatter';
import { USER_OPTIONS, DirectoryConfig, UserOptions } from './userOptionsConfig';

/**
 * FileSystemObserver class
 *
 * Watches the tooling directory for Markdown file changes and logs extracted frontmatter.
 * This class is exported for use in the main entrypoint (index.ts).
 */
export class FileSystemObserver {
  /**
   * Cooldown period (ms) for ignoring self-triggered events after writing to a file.
   * Configurable; default is 2000ms (2 seconds).
   *
   * @private
   */
  private modificationCooldownPeriod: number = 2000;

  /**
   * Set of files currently being processed to prevent infinite watcher-triggered loops.
   * This is the core guard for self-triggered events.
   */
  private processingFiles: Set<string> = new Set();

  constructor(
    // These parameters are placeholders for future extensibility
    templateRegistry?: any,
    reportingService?: any,
    contentRoot?: string
  ) {
    // If a custom contentRoot is provided, use it to resolve TOOLING_ROOT
    const baseRoot = contentRoot || path.resolve(__dirname, '../../content');
    // Find the tooling directory config
    const TOOLING_CONFIG = USER_OPTIONS.directories.find(
      (dir) => dir.path === 'tooling/Enterprise Jobs-to-be-Done'
    );
    if (!TOOLING_CONFIG) {
      throw new Error('[Observer] TOOLING_CONFIG not found in USER_OPTIONS.');
    }
    const TOOLING_ROOT = path.resolve(baseRoot, TOOLING_CONFIG.path);
    this.startObserver(TOOLING_ROOT);
  }

  /**
   * Aggressively logs the result of extracting frontmatter from a Markdown file.
   * @param filePath Absolute path to the Markdown file
   * @param templateOrder Optional array of keys for ordering
   * @param reportingService Optional reporting service for logging
   * @param logging Optional logging flags
   */
  async logExtractedFrontmatter(filePath: string, templateOrder?: string[], reportingService?: any, logging?: { addSiteUUID?: boolean; openGraph?: boolean }): Promise<void> {
    // === Infinite loop prevention: do not process if already processing ===
    if (this.processingFiles.has(filePath)) {
      console.log(`[Observer] Skipping processing for ${filePath} (already processing)`);
      return;
    }
    // Add file to processing set BEFORE processing
    this.processingFiles.add(filePath);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const frontmatter = extractFrontmatter(content);
      console.log('\n==============================');
      console.log(`[Observer] File: ${filePath}`);
      if (frontmatter) {
        // Trigger addSiteUUID if site_uuid is missing and persist the change
        let updatedFrontmatter = frontmatter;
        let siteUuidAdded = false;

        if (!frontmatter.site_uuid) {
          updatedFrontmatter = addSiteUUID(frontmatter, filePath);
          siteUuidAdded = true;
          await writeFrontmatterToFile(filePath, updatedFrontmatter, templateOrder, reportingService);
          if (logging?.addSiteUUID) {
            console.log('After addSiteUUID:\n', JSON.stringify(updatedFrontmatter, null, 2));
          }
        }

        // === OpenGraph & Screenshot Pipeline Step ===
        // Determine if OpenGraph or Screenshot API calls are needed
        const ogFields = [
          'og_image', 'og_url', 'video', 'favicon', 'site_name', 'title', 'description', 'og_images'
        ];
        // Use robust, normalized presence check for all API enrichment
        // Integrate extractStringValueForFrontmatter utility for clarity and maintainability
        const needsOpenGraph = ogFields.some(
          (field) => !extractStringValueForFrontmatter(updatedFrontmatter[field])
        );
        let openGraphPromise: Promise<any> | null = null;
        let screenshotPromise: Promise<any> | null = null;
        let screenshotUrl: string | null = null;
        let ogApiError: unknown = null;
        let screenshotApiError: unknown = null;
        const needsScreenshot = !extractStringValueForFrontmatter(updatedFrontmatter['og_screenshot_url']);

        if (needsOpenGraph) {
          openGraphPromise = processOpenGraphMetadata(updatedFrontmatter, filePath)
            .then((ogResult: any) => {
              return { ogResult, changed: ogResult && ogResult.changed };
            })
            .catch((err: unknown) => {
              ogApiError = err;
              console.error('[Observer] OpenGraph API error:', err);
              return null;
            });
        }
        if (needsScreenshot) {
          // Inline fetchScreenshotUrl (not background) for merge
          const { fetchScreenshotUrl } = require('./services/openGraphService');
          screenshotPromise = fetchScreenshotUrl(updatedFrontmatter.url || updatedFrontmatter.link)
            .then((result: string | null) => {
              screenshotUrl = result;
              if (result) {
                console.log('[Observer] Returned Screenshot object:', result);
              } else {
                console.log('[Observer] Screenshot API returned null');
              }
              return result;
            })
            .catch((err: unknown) => {
              screenshotApiError = err;
              console.error('[Observer] Screenshot API error:', err);
              return null;
            });
        }

        // Await both in parallel if both needed
        let mergedFrontmatter = { ...updatedFrontmatter };
        // === CRITICAL: Flatten all OpenGraph fields using extractStringValueForFrontmatter ===
        // This ensures no nested objects or [object Object] issues in the frontmatter
        if (openGraphPromise && screenshotPromise) {
          const [ogResult, screenshotResult] = await Promise.all([openGraphPromise, screenshotPromise]);
          if (ogResult && ogResult.ogResult) {
            for (const [key, value] of Object.entries(ogResult.ogResult)) {
              mergedFrontmatter[key] = extractStringValueForFrontmatter(value);
              /*
                [Function Call List]
                - Called here for every OpenGraph field merged into frontmatter
                [Function Definition]
                - See tidyverse/observers/utils/extractStringValueForFrontmatter.ts for logic
                [Purpose]
                - Flattens nested OpenGraph responses, ensures only strings are merged
              */
            }
          }
          if (screenshotResult) mergedFrontmatter.og_screenshot_url = extractStringValueForFrontmatter(screenshotResult);
        } else if (openGraphPromise) {
          const ogResult = await openGraphPromise;
          if (ogResult && ogResult.ogResult) {
            for (const [key, value] of Object.entries(ogResult.ogResult)) {
              mergedFrontmatter[key] = extractStringValueForFrontmatter(value);
              /*
                [Function Call List]
                - Called here for every OpenGraph field merged into frontmatter
                [Function Definition]
                - See tidyverse/observers/utils/extractStringValueForFrontmatter.ts for logic
                [Purpose]
                - Flattens nested OpenGraph responses, ensures only strings are merged
              */
            }
          }
        } else if (screenshotPromise) {
          const screenshotResult = await screenshotPromise;
          if (screenshotResult) mergedFrontmatter.og_screenshot_url = extractStringValueForFrontmatter(screenshotResult);
        }

        // === Idempotent Write Logic ===
        // Aggressively log original and merged frontmatter before comparison
        console.log('[Observer] Original frontmatter:', JSON.stringify(frontmatter, null, 2));
        console.log('[Observer] Merged frontmatter:', JSON.stringify(mergedFrontmatter, null, 2));
        const mergedStr = JSON.stringify(mergedFrontmatter);
        const origStr = JSON.stringify(frontmatter);
        if (mergedStr !== origStr) {
          console.log('[Observer] Final merged frontmatter (before write):', JSON.stringify(mergedFrontmatter, null, 2));
          await writeFrontmatterToFile(filePath, mergedFrontmatter, templateOrder, reportingService);
          console.log('[Observer] File updated with new data (OpenGraph and/or Screenshot as available)');
        } else {
          // Aggressively log which fields are identical and which (if any) are not
          const diffFields = Object.keys(mergedFrontmatter).filter(
            key => JSON.stringify(mergedFrontmatter[key]) !== JSON.stringify(frontmatter[key])
          );
          if (diffFields.length === 0) {
            console.log('[Observer] No changes to frontmatter, skipping write. (All fields identical)');
          } else {
            console.log('[Observer] Skipping write. Only differing fields:', diffFields);
          }
        }
      } else {
        console.warn('[Observer] No valid frontmatter found.');
      }
      console.log('==============================\n');
    } catch (err: unknown) {
      console.error(`[Observer] ERROR reading or extracting frontmatter from ${filePath}:`, err);
    } finally {
      // === Infinite loop prevention: cooldown after processing ===
      // Remove file from processingFiles only AFTER cooldown period to ignore self-triggered events
      setTimeout(() => {
        this.processingFiles.delete(filePath);
        console.log(`[Observer] Cooldown expired, removed ${filePath} from processingFiles`);
      }, this.modificationCooldownPeriod);
    }
  }

  /**
   * Determines if a file is a Markdown file (by extension)
   */
  isMarkdownFile(filePath: string): boolean {
    return filePath.endsWith('.md');
  }

  /**
   * Sets up chokidar watcher for the tooling directory.
   * On file add/change, attempts to extract and log frontmatter.
   */
  startObserver(toolingRoot: string) {
    console.log(`[Observer] Starting minimal filesystem observer for TOOLING directory: ${toolingRoot}`);
    const watcher = chokidar.watch(toolingRoot, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // Only emit for changes after startup
      depth: 10, // Recursively watch subdirectories
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });
    watcher.on('add', (filePath) => {
      if (this.isMarkdownFile(filePath)) {
        if (this.processingFiles.has(filePath)) {
          console.log(`[Observer] Skipping processing for ${filePath} (already processing)`);
          return;
        }
        console.log(`[Observer] New Markdown file detected: ${filePath}`);
        this.logExtractedFrontmatter(filePath);
      }
    });
    watcher.on('change', (filePath) => {
      if (this.isMarkdownFile(filePath)) {
        if (this.processingFiles.has(filePath)) {
          console.log(`[Observer] Skipping processing for ${filePath} (already processing)`);
          return;
        }
        console.log(`[Observer] Markdown file changed: ${filePath}`);
        this.logExtractedFrontmatter(filePath);
      }
    });
    watcher.on('error', (error: unknown) => {
      console.error('[Observer] Watcher error:', error);
    });
    console.log('[Observer] Watching for Markdown file changes...');
  }
}
