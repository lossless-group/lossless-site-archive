import { defineCollection, z } from 'astro:content';

const pagesCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
  }),
});

const reportsCollection = defineCollection({
  type: 'content',
  schema: ({ image }) => z.object({
    title: z.string(),
    datetime: z.string().optional(),
    authors: z.union([z.string(), z.array(z.string())]).optional(),
    augmented_with: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = {
  'pages': pagesCollection,
  'reports': reportsCollection,
};
