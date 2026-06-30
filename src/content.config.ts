import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()),
    github: z.string().optional(),
    cover: z.string().optional(),
    drivenBy: z.string(),
    keyInsight: z.string(),
  }),
});

export const collections = { posts };
