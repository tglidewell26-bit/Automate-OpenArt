import { openai, MODEL_NAME } from "./openai";
import type { BookBoundaries, PromptVariation, ExtractedCharacter } from "@shared/schema";

export async function detectBookBoundaries(
  pageTexts: Record<number, string>,
  totalPages: number
): Promise<BookBoundaries> {
  const earlyPages = Object.entries(pageTexts)
    .filter(([p]) => parseInt(p) <= Math.min(15, totalPages))
    .map(([p, text]) => `--- Page ${p} ---\n${text.substring(0, 800)}`)
    .join("\n\n");

  const latePages = Object.entries(pageTexts)
    .filter(([p]) => parseInt(p) >= Math.max(1, totalPages - 10))
    .map(([p, text]) => `--- Page ${p} ---\n${text.substring(0, 800)}`)
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      {
        role: "system",
        content: `You are analyzing a children's book PDF to find the book's actual content boundaries.This information will be used to generate illustrations for the book.

Your task:
1. Look at the Table of Contents to find where Chapter 1 (or the first actual story content) begins. This page number is important, because it will be used to determine the start of the book.
2. Now find the end of the story. This is the last page of the actual story content.Usually this is followed by the Author's biography. 

Respond with ONLY valid JSON in this format:
{"startPage": <number>, "endPage": <number>}

If you cannot determine start or end pages, return 'cannot determine'`
      },
      {
        role: "user",
        content: `Total pages: ${totalPages}\n\n=== EARLY PAGES ===\n${earlyPages}\n\n=== LATE PAGES ===\n${latePages}`
      }
    ],
    max_completion_tokens: 800,
  });

  const content = response.choices[0]?.message?.content || "";

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        startPage: Math.max(1, Math.min(parsed.startPage || 1, totalPages)),
        endPage: Math.max(1, Math.min(parsed.endPage || totalPages, totalPages)),
      };
    }
  } catch {}

  return { startPage: 1, endPage: totalPages };
}

export function calculateIllustrationBlocks(
  startPage: number,
  endPage: number
): Array<{ index: number; pageRange: [number, number]; contextPages: [number, number] }> {
  const blocks: Array<{ index: number; pageRange: [number, number]; contextPages: [number, number] }> = [];
  let blockIndex = 0;

  for (let page = startPage; page <= endPage; page += 3) {
    const blockEnd = Math.min(page + 2, endPage);
    const contextStart = Math.max(startPage, page - 2);
    blocks.push({
      index: blockIndex,
      pageRange: [page, blockEnd],
      contextPages: [contextStart, blockEnd],
    });
    blockIndex++;
  }

  return blocks;
}

export async function generatePrompts(
  contextText: string,
  pageRange: [number, number],
  tone: string,
  forbiddenPhrases: string[]
): Promise<PromptVariation[]> {
  const forbiddenList = forbiddenPhrases.join(", ");

  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      {
        role: "system",
        content: `## Role
You are an expert visual prompt engineer specializing in OpenArt.ai image generation for **Classic Books for All** — a company that adapts classic literature (Frankenstein, The Time Machine, and similar works) into illustrated books for children. Your sole function is to receive a page of text and output a ready-to-use image prompt.

## Task
When given a page of text, generate a precise, detailed image prompt optimized for OpenArt.ai that will produce a high-quality illustration faithful to the scene, mood, and tone of that page.

## Context
Classic Books for All takes iconic literary works and simplifies them for young readers. Illustrations must honor the source material's atmosphere while remaining warm and accessible. Your prompts translate written narrative into vivid, generatable imagery on OpenArt.ai without including any technical parameters, style references, or medium descriptors that are already preset in the platform.

## Instructions

**When given a page of text:**
- Identify the main subject, setting, characters, action, and emotional tone
- Translate all narrative elements into concrete visual descriptors: colors, lighting, composition, expressions, environment
- Reference characters by name with action (e.g., "Victor Frankenstein steps back as the creature opens its eyes" or "the Time Traveller grips the machine's lever as the world blurs around him")
- Convert abstract emotions into visible, concrete details (e.g., "fear" → "wide eyes, trembling hands, a single step backward")
- Prompts can be up to 300 words — use every word to add visual information
- Include a negative prompt to exclude elements that should not appear in the image

**Do NOT include in any prompt:**
- Character physical descriptions or appearance details
- Illustration style descriptors (e.g., whimsical, storybook, digital art)
- Art medium references (e.g., watercolor, charcoal, oil paint, gouache)
- Quality or mood tags (e.g., children's book illustration, storybook art, vibrant colors)
- Camera equipment references (e.g., lens type, focal length, shot type)
- Resolution or technical specs (e.g., 4K, 8K, high resolution)

**Tone and visual guidance:**
- Match the energy of the text: quiet or somber scenes get soft muted palettes; adventure or action scenes get bold saturated colors

**Edge cases:**
- If the page text is sparse, infer setting and mood from the source work's context and generate the richest possible visual scene
- If multiple scenes appear on one page, focus on the most visually dominant or emotionally significant moment
- Always generate a prompt immediately — never ask for more information or clarification`
      },
      {
        role: "user",
        content: `Generate illustration prompts for pages ${pageRange[0]}-${pageRange[1]} based on this text context:\n\n${contextText}`
      }
    ],
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content || "";

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((p: any) => ({
        type: p.type || "moment",
        label: p.label || p.type || "Prompt",
        text: p.text || "",
      }));
    }
  } catch {}

  return [
    { type: "moment", label: "Moment / Action", text: "Failed to generate prompt. Please try again." },
    { type: "atmosphere", label: "Atmosphere / Environment", text: "Failed to generate prompt. Please try again." },
    { type: "emotion", label: "Emotion / Symbolism", text: "Failed to generate prompt. Please try again." },
  ];
}

export async function extractCharacters(
  fullText: string
): Promise<ExtractedCharacter[]> {
  const truncatedText = fullText.substring(0, 15000);

  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      {
        role: "system",
        content: `You are extracting character references from a children's book for use in image generation tools.

For each character found, extract:
- name: The character's primary name
- aliases: Alternative names or nicknames (array of strings)
- physicalTraits: Physical appearance details (hair, eyes, build, age, etc.)
- clothing: Typical clothing or accessories described
- recurringFeatures: Objects, pets, or notable recurring visual elements associated with this character

Merge duplicates (e.g. "Mr. Gulliver" and "Gulliver" should be one entry).

Respond with ONLY valid JSON array:
[
  {
    "name": "...",
    "aliases": ["..."],
    "physicalTraits": "...",
    "clothing": "...",
    "recurringFeatures": "..."
  }
]

If no characters are found, return an empty array [].`
      },
      {
        role: "user",
        content: `Extract all characters from this book text:\n\n${truncatedText}`
      }
    ],
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content || "";

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((c: any, i: number) => ({
        id: `char-${i}`,
        name: c.name || "Unknown",
        aliases: c.aliases || [],
        physicalTraits: c.physicalTraits || "",
        clothing: c.clothing || "",
        recurringFeatures: c.recurringFeatures || "",
      }));
    }
  } catch {}

  return [];
}
