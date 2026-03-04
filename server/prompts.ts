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
    max_completion_tokens: 200,
  });

  const content = response.choices[0]?.message?.content || "";

  if (content.toLowerCase().includes("cannot determine")) {
    throw new Error(
      "AI could not determine the book boundaries. The PDF may not contain a clear Table of Contents or recognizable chapter structure. Please check the PDF and try again."
    );
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      "AI returned an unexpected response while detecting book boundaries. Please try uploading again."
    );
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    startPage: Math.max(1, Math.min(parsed.startPage || 1, totalPages)),
    endPage: Math.max(1, Math.min(parsed.endPage || totalPages, totalPages)),
  };
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
- Each prompt must be 150-200 words
- Write in present tense
- Write in prose only (no bullets, no lists)
- Focus on setting, atmosphere, emotion, and symbolic detail
- NEVER mention character appearance (no physical descriptions of characters)
- NEVER include any of these forbidden terms: ${forbiddenList}
- NEVER describe artistic medium, style, resolution, camera terms, or rendering terms

TONE: ${tone}

Generate exactly 3 prompt variations:
1. MOMENT: Focus on the action, movement, and key moment happening in the scene
2. ATMOSPHERE: Focus on the environment, lighting, weather, and spatial details
3. EMOTION: Focus on emotional resonance, symbolism, and thematic depth

Respond with ONLY valid JSON array:
[
  {"type": "moment", "label": "Moment / Action", "text": "..."},
  {"type": "atmosphere", "label": "Atmosphere / Environment", "text": "..."},
  {"type": "emotion", "label": "Emotion / Symbolism", "text": "..."}
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
