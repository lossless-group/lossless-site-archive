import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root, Content, Paragraph, Text } from 'mdast';
import markdownDebugger from './markdownDebugger';
import { DEBUG_SLIDES } from '@utils/envUtils';

interface SlideNode extends Content {
  type: 'slide';
  children: Content[];
  data?: {
    hName?: string;
    hProperties?: {
      className?: string[];
      [key: string]: unknown;
    };
  };
  attributes?: Record<string, string>;
}

/**
 * Remark plugin to parse slide separators and structure slides
 * Supports both `---` and `***` as slide separators
 */
const remarkSlides: Plugin<[], Root> = () => {
  return (tree: Root) => {
    if (DEBUG_MARKDOWN) {
      console.log('=== remarkSlides: Starting slide parsing ===');
    }

    const slides: SlideNode[] = [];
    let currentSlide: Content[] = [];
    let inVertical = false;

    // First pass: Split into slides
    const processNode = (node: Content) => {
      if (node.type === 'thematicBreak') {
        // Skip if it's not a slide break (e.g., horizontal rule in content)
        if (node.position?.start.column !== 1) return;

        // Get the separator text
        const line = node.position.start.line;
        const prevLine = tree.children.find(
          (n) => n.position?.end.line === line - 1
        );

        // Check if it's a vertical slide (4+ dashes/asterisks)
        const isVertical = (node as any).marker?.length >= 4;
        
        if (isVertical) {
          inVertical = true;
          return;
        }

        // Start a new slide
        if (currentSlide.length > 0) {
          slides.push(createSlideNode(currentSlide, inVertical));
          currentSlide = [];
          inVertical = false;
        }
      } else {
        currentSlide.push(node);
      }
    };

    // Process all nodes
    tree.children.forEach(processNode);

    // Add the last slide if not empty
    if (currentSlide.length > 0) {
      slides.push(createSlideNode(currentSlide, inVertical));
    }

    // Replace the original tree with slides
    tree.children = slides;

    if (DEBUG_MARKDOWN) {
      console.log(`Processed ${slides.length} slides`);
    }
  };
};

/**
 * Create a slide node with proper structure
 */
function createSlideNode(children: Content[], isVertical = false): SlideNode {
  return {
    type: 'slide',
    children,
    data: {
      hName: 'section',
      hProperties: {
        className: ['slide', isVertical ? 'vertical' : ''].filter(Boolean),
      },
    },
  };
}

export default remarkSlides;
