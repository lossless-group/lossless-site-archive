import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

/**
 * Process markdown content into HTML slides
 */
export async function processMarkdownToSlides(content: string): Promise<string> {
  try {
    const result = await remark()
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process(content);

    return String(result);
  } catch (error) {
    console.error('Error processing markdown slides:', error);
    return `<div class="error">Error processing slides: ${error.message}</div>`;
  }
}

/**
 * Convert markdown content to RevealJS slide format
 */
export async function markdownToRevealSlides(content: string): Promise<string> {
  // First, extract the frontmatter if it exists
  const frontmatterEnd = content.startsWith('---') ? content.indexOf('---', 3) + 3 : 0;
  const markdownContent = frontmatterEnd > 0 ? content.slice(frontmatterEnd) : content;

  // Split content by slide separators (--- or ***)
  const slides = markdownContent.split(/\n\s*[-*]{3,}\s*\n/);
  
  // Wrap each non-empty slide in a section tag for RevealJS
  const slideSections = slides
    .filter(slide => slide.trim())
    .map(slide => `\n<section data-markdown>\n\`\`\`markdown\n${slide.trim()}\n\`\`\`\n</section>`);

  return slideSections.join('\n');
}
