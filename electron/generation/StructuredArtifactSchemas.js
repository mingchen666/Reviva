import { z } from 'zod'

const text = z.string().trim().min(1)
const tags = z.array(text).min(1).max(4)

export const qaArtifactSchema = z.object({
  title: text.max(40),
  mode: z.enum(['faq', 'thinking']),
  total_items: z.number().int().min(1).max(24),
  items: z.array(z.object({
    id: text.max(80),
    question: text.max(400),
    answer: text.max(1600),
    key_point: text.max(500),
    tags,
  })).min(1).max(24),
}).passthrough()

export const glossaryArtifactSchema = z.object({
  title: text.max(40),
  total_terms: z.number().int().min(1).max(40),
  terms: z.array(z.object({
    id: text.max(80),
    term: text.max(160),
    aliases: z.array(text.max(160)).max(8),
    definition: text.max(1200),
    context: text.max(1200),
    category: text.max(100),
    importance: z.enum(['high', 'medium', 'low']),
  })).min(1).max(40),
}).passthrough()

export const cheatsheetArtifactSchema = z.object({
  title: text.max(40),
  summary: text.max(600),
  sections: z.array(z.object({
    title: text.max(120),
    items: z.array(z.object({
      kind: z.enum(['formula', 'fact', 'step', 'pitfall', 'rule']),
      label: text.max(180),
      content: text.max(900),
      note: z.string().trim().max(500),
    })).min(1).max(10),
  })).min(2).max(6),
}).passthrough()
