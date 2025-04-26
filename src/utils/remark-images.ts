import { visit } from 'unist-util-visit';
import type { Root, Text } from 'mdast';
import type { CollectionEntry } from 'astro:content';
import markdownDebugger from './markdownDebugger';

// Regex patterns for different image types
const wikiImageRegex = /!\[\[((.*?\/)?[^/|]+?)(?:\|([0-9]+x[0-9]+))?\]\]/g;
const markdownImageRegex = /!\[(.*?)\]\((https?:\/\/.*?)\)/g;

interface ImagePluginOptions {
  renderInFrontmatter: boolean;
  defaultAltText: string;
  visualsDirectory: string;
  visualsCollection?: CollectionEntry<'visuals'>[];
}

const defaultOptions: ImagePluginOptions = {
  renderInFrontmatter: false,
  defaultAltText: 'Image from URL',
  visualsDirectory: 'content/visuals'
};

interface ImageDimensions {
  width: number;
  height: number;
}

function parseDimensions(dimensionStr: string | undefined): ImageDimensions | null {
  if (!dimensionStr) return null;
  
  const match = dimensionStr.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10)
  };
}

async function transformImagePath(filename: string, options: ImagePluginOptions): Promise<string> {
  // If the path starts with Visuals/ or visuals/, it's from our visuals collection (case insensitive)
  if (filename.match(/^visuals\//i)) {
    // Remove Visuals/ prefix for the actual path
    const actualPath = filename.replace(/^visuals\//i, '');
    
    // Create normalized version for comparison (lowercase)
    const normalizedPath = actualPath.toLowerCase();
    
    // If we have a visuals collection, try to find the image
    if (options.visualsCollection) {
      const visual = options.visualsCollection.find(v => v.id.toLowerCase() === normalizedPath);
      if (visual) {
        // If found in collection, use the collection URL format with original casing
        return `/content/visuals/${visual.id}`;
      }
    }
    
    // Fallback to direct path if not found in collection, preserving original casing
    return `/content/visuals/${actualPath}`;
  }
  
  // If it's a full path starting with content/, preserve casing
  if (filename.startsWith('content/')) {
    return `/${filename}`;
  }
  
  // Otherwise assume it's a visuals file, preserve original casing
  return `/content/visuals/${filename}`;
}

function generateAltText(filename: string): string {
  // Remove any directory paths
  const baseName = filename.split('/').pop() || filename;
  
  // Extract meaningful text from the filename
  // Example: v2__Data-Model-Database--In-Action.png -> Data Model Database In Action
  return baseName
    .replace(/^v\d+__/, '') // Remove version prefix
    .replace(/\.[^.]+$/, '') // Remove extension
    .replace(/--/g, ' ') // Replace double dashes with space
    .replace(/-/g, ' ') // Replace single dashes with space
    .trim();
}

/**
 * Transform wiki-style image embeds and markdown images into proper HTML img tags.
 * Supports:
 * 1. Wiki-style embeds: ![[Visuals/image.png]]
 * 2. Wiki-style embeds with dimensions: ![[Visuals/image.png|100x200]]
 * 3. Standard markdown images: ![alt](https://example.com/image.png)
 */
export default function remarkImages(userOptions: Partial<ImagePluginOptions> = {}) {
  const options = { ...defaultOptions, ...userOptions };
  
  return async function transformer(tree: Root) {
    markdownDebugger.startPlugin('Images');

    const promises: Promise<void>[] = [];

    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === null) return;
      
      const value = node.value;
      const wikiMatches = Array.from(value.matchAll(wikiImageRegex));
      const markdownMatches = Array.from(value.matchAll(markdownImageRegex));
      
      if (wikiMatches.length > 0 || markdownMatches.length > 0) {
        markdownDebugger.log(`\n🔍 Found images in text:`, value.slice(0, 50) + (value.length > 50 ? '...' : ''));
        
        promises.push((async () => {
          const newNodes = [];
          let lastIndex = 0;

          // Handle wiki-style images
          for (const match of wikiMatches) {
            const [fullMatch, filename, _pathComponent, dimensions] = match;
            const startIndex = match.index!;
            
            if (startIndex > lastIndex) {
              newNodes.push({
                type: 'text',
                value: value.slice(lastIndex, startIndex)
              });
            }

            const transformedPath = await transformImagePath(filename.trim(), options);
            const altText = generateAltText(filename.trim());
            const imageDimensions = parseDimensions(dimensions);
            
            markdownDebugger.verbose(`  ↳ Converting wiki image: [[${filename}]] → ${transformedPath}`);
            if (imageDimensions) {
              markdownDebugger.verbose(`    with dimensions: ${dimensions}`);
            }
            
            const imageNode: any = {
              type: 'image',
              url: transformedPath,
              alt: altText,
              title: null
            };

            // If dimensions are specified, add them to the node's data
            if (imageDimensions) {
              imageNode.data = {
                hProperties: {
                  width: imageDimensions.width,
                  height: imageDimensions.height
                }
              };
            }

            newNodes.push(imageNode);
            lastIndex = startIndex + fullMatch.length;
          }

          // Handle markdown-style images with URLs
          markdownMatches.forEach(match => {
            const [fullMatch, alt, url] = match;
            const startIndex = match.index!;
            
            if (startIndex > lastIndex) {
              newNodes.push({
                type: 'text',
                value: value.slice(lastIndex, startIndex)
              });
            }

            markdownDebugger.verbose(`  ↳ Processing URL image: ${url}`);
            
            newNodes.push({
              type: 'image',
              url: url,
              alt: alt || options.defaultAltText,
              title: null
            });

            lastIndex = startIndex + fullMatch.length;
          });

          if (lastIndex < value.length) {
            newNodes.push({
              type: 'text',
              value: value.slice(lastIndex)
            });
          }

          parent.children.splice(index, 1, ...newNodes);
        })());
      }
    });
    
    await Promise.all(promises);
    markdownDebugger.endPlugin('Images');
    return tree;
  };
}
