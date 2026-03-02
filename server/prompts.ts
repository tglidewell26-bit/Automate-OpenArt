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
        content: `You are analyzing a children's book PDF to find the book's actual content boundaries.

Your task:
1. Look at the early pages to find where Chapter 1 (or the first actual story content) begins. Skip title pages, copyright, dedication, and table of contents.
2. Look at the late pages to find the Author Biography or About the Author section. The book ends on the page BEFORE that section begins.

Respond with ONLY valid JSON in this format:
{"startPage": <number>, "endPage": <number>}

If you cannot determine start, use page 1. If you cannot determine end, use the last page number.`
      },
      {
        role: "user",
        content: `Total pages: ${totalPages}\n\n=== EARLY PAGES ===\n${earlyPages}\n\n=== LATE PAGES ===\n${latePages}`
      }
    ],
    max_completion_tokens: 200,
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
        content: `You are an expert at generating OpenArt-optimized image prompts for children's book illustrations.

RULES (STRICT):
- Base every prompt strictly on the provided page text. Do not invent unrelated scenes.
- Each prompt must be 110-170 words
- Write in present tense
- Write in prose only (no bullets, no lists)
- Every prompt must naturally include action, atmosphere, and emotion in one cohesive scene description
- Mention character names when they are present in the source text, and keep details consistent with the text
- NEVER include any of these forbidden terms: ${forbiddenList}
- NEVER describe artistic medium, style, resolution, camera terms, or rendering terms

TONE: ${tone}

Generate exactly 3 DIFFERENT prompt ideas for the same page range:
1. IDEA 1: a faithful interpretation of the most important moment
2. IDEA 2: a different but still text-faithful composition or moment
3. IDEA 3: another text-faithful option emphasizing a different beat

Respond with ONLY valid JSON array:
[
  {"type": "idea1", "label": "Prompt Idea 1", "text": "..."},
  {"type": "idea2", "label": "Prompt Idea 2", "text": "..."},
  {"type": "idea3", "label": "Prompt Idea 3", "text": "..."}
]`
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
      const labels = ["Prompt Idea 1", "Prompt Idea 2", "Prompt Idea 3"] as const;
      const fallbackTypes = ["idea1", "idea2", "idea3"] as const;
      const normalized = parsed.slice(0, 3).map((p: any, idx: number) => ({
        type: (fallbackTypes.includes(p.type) ? p.type : fallbackTypes[idx]) as "idea1" | "idea2" | "idea3",
        label: p.label || labels[idx],
        text: p.text || "",
      }));

      while (normalized.length < 3) {
        const idx = normalized.length;
        normalized.push({
          type: fallbackTypes[idx],
          label: labels[idx],
          text: "Failed to generate prompt. Please try again.",
        });
      }

      return normalized;
    }
  } catch {}

  return [
    { type: "idea1", label: "Prompt Idea 1", text: "Failed to generate prompt. Please try again." },
    { type: "idea2", label: "Prompt Idea 2", text: "Failed to generate prompt. Please try again." },
    { type: "idea3", label: "Prompt Idea 3", text: "Failed to generate prompt. Please try again." },
  ];
}

export async function extractCharacters(
  fullText: string
): Promise<ExtractedCharacter[]> {
  const truncatedText = fullText.substring(0, 50000);

  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      {
        role: "system",
        content: `You are extracting character references from a children's book for use in image generation tools.

For each named or clearly recurring character found, extract:
- name: The character's primary name
- aliases: Alternative names or nicknames (array of strings)
- physicalTraits: Only details explicitly grounded in the text
- clothing: Clothing/accessories explicitly grounded in the text
- recurringFeatures: Recurring props, pets, or motifs from the text

Rules:
- Use only evidence from the supplied text.
- Merge duplicates (e.g. "Mr. Gulliver" and "Gulliver" should be one entry).
- Ignore one-off generic mentions like "a boy" unless that figure becomes recurring.

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
