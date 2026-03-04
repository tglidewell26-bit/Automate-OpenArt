import { openai, MODEL_NAME } from "./openai";
import type { BookBoundaries, PromptVariation, ExtractedCharacter } from "@shared/schema";

const VARIATION_DELAY_MS = 450;

type SubjectBucket = {
  person: string[];
  place: string[];
  objects: string[];
  colors: string[];
  environment: string[];
  action: string[];
  physicalTraits: string[];
  emotions: string[];
};

function isLikelyCharacterName(value: string): boolean {
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(value);
}

const SUBJECT_PATTERNS: Record<keyof SubjectBucket, RegExp[]> = {
  person: [
    /\b(?:mr|mrs|ms|miss|dr|sir|lady|captain|king|queen|prince|princess|mother|father|brother|sister|boy|girl|child|children|man|woman)\b/gi,
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g,
  ],
  place: [
    /\b(?:house|home|room|kitchen|forest|woods|river|lake|sea|ocean|shore|street|city|town|village|school|castle|mountain|garden|bridge|cave|island|ship|train)\b/gi,
    /\b(?:in|at|inside|outside|near|across|toward|into)\s+(?:the\s+)?([a-z][a-z\-\s]{2,30})\b/gi,
  ],
  objects: [
    /\b(?:book|letter|door|window|table|chair|lamp|clock|key|sword|bag|hat|coat|dress|ring|cup|bread|boat|carriage|machine|toy|flower|lantern)\b/gi,
  ],
  colors: [
    /\b(?:red|blue|green|yellow|orange|purple|violet|pink|black|white|gray|grey|brown|gold|silver|amber|scarlet|crimson|teal|indigo)\b/gi,
  ],
  environment: [
    /\b(?:rain|storm|wind|fog|mist|snow|sunlight|moonlight|night|day|dawn|dusk|dark|bright|cold|warm|fire|smoke|shadow|silence)\b/gi,
  ],
  action: [
    /\b(?:run|ran|walk|walked|jump|jumped|climb|climbed|open|opened|close|closed|grab|gripped|hold|held|look|looked|turn|turned|scream|shout|whisper|smile|cried|cry|laughed|laugh|chase|chased|hide|hid|fight|fought|reach|reached)\b/gi,
  ],
  physicalTraits: [
    /\b(?:tall|short|small|large|thin|round|curly|straight|dark-haired|blonde|freckled|scar|beard|wrinkled|young|old|tiny|strong|weak)\b/gi,
  ],
  emotions: [
    /\b(?:happy|sad|angry|afraid|fear|scared|calm|excited|curious|anxious|nervous|brave|lonely|hopeful|worried|relieved|surprised|joyful|tense)\b/gi,
  ],
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function normalizeEntity(value: string): string {
  return value
    .replace(/[“”"'.,;:!?()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueKeepOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const norm = value.toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    output.push(value);
  }
  return output;
}

function splitSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return sentences.length > 0 ? sentences : [text.trim()].filter(Boolean);
}

function extractSubjectSignals(text: string): SubjectBucket {
  const buckets: SubjectBucket = {
    person: [],
    place: [],
    objects: [],
    colors: [],
    environment: [],
    action: [],
    physicalTraits: [],
    emotions: [],
  };

  for (const [subject, patterns] of Object.entries(SUBJECT_PATTERNS) as Array<[keyof SubjectBucket, RegExp[]]>) {
    for (const pattern of patterns) {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      const regex = new RegExp(pattern.source, flags);
      let match: RegExpExecArray | null = regex.exec(text);
      while (match) {
        const candidate = normalizeEntity(match[1] || match[0] || "");
        if (candidate) {
          if (subject === "person") {
            if (candidate.length < 3 || /^[A-Z][a-z]+$/.test(candidate) === false) {
              if (!/\b(?:mr|mrs|ms|miss|dr|sir|lady|captain|king|queen|prince|princess|mother|father|brother|sister|boy|girl|child|children|man|woman)\b/i.test(candidate)) {
                match = regex.exec(text);
                continue;
              }
            }
          }
          buckets[subject].push(candidate);
        }
        match = regex.exec(text);
      }
    }
    buckets[subject] = uniqueKeepOrder(buckets[subject]);

    if (subject === "person") {
      const prioritizedCharacters = buckets.person
        .filter((candidate) => isLikelyCharacterName(candidate))
        .sort((a, b) => b.length - a.length);
      const supportingPeople = buckets.person.filter((candidate) => !isLikelyCharacterName(candidate));
      buckets.person = [...prioritizedCharacters, ...supportingPeople].slice(0, 10);
    } else {
      buckets[subject] = buckets[subject].slice(0, 8);
    }
  }

  return buckets;
}

function scoreSentence(sentence: string, subjects: SubjectBucket): number {
  const lower = sentence.toLowerCase();
  let score = 0;

  const weights: Record<keyof SubjectBucket, number> = {
    person: 8,
    place: 3,
    objects: 2,
    colors: 2,
    environment: 2,
    action: 3,
    physicalTraits: 2,
    emotions: 3,
  };

  for (const [subject, entities] of Object.entries(subjects) as Array<[keyof SubjectBucket, string[]]>) {
    for (const entity of entities) {
      if (entity && lower.includes(entity.toLowerCase())) {
        score += weights[subject];
      }
    }
  }

  const sentenceLengthBonus = Math.min(3, Math.floor(sentence.length / 80));
  return score + sentenceLengthBonus;
}

function formatSubjects(subjects: SubjectBucket): string[] {
  const labels: Array<[keyof SubjectBucket, string]> = [
    ["person", "People"],
    ["place", "Places"],
    ["objects", "Objects"],
    ["colors", "Colors"],
    ["environment", "Environment"],
    ["action", "Actions"],
    ["physicalTraits", "Physical traits"],
    ["emotions", "Emotions"],
  ];

  return labels.map(([key, label]) => {
    if (key === "person" && subjects.person.length > 0) {
      return `${label} (highest priority): ${subjects[key].join(", ")}`;
    }
    return `${label}: ${subjects[key].length > 0 ? subjects[key].join(", ") : "none detected"}`;
  });
}

function summarizeContextText(contextText: string): string {
  const normalized = contextText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return "No page text extracted.";
  }

  const pageMarkers = normalized.filter((line) => /^\[Page\s+\d+\]$/i.test(line));
  const contentLines = normalized.filter((line) => !/^\[Page\s+\d+\]$/i.test(line));
  const condensed = contentLines.join(" ").replace(/\s+/g, " ").trim();

  if (!condensed) {
    return pageMarkers.length > 0 ? `Source pages: ${pageMarkers.join(", ")}\nNo page text extracted.` : "No page text extracted.";
  }

  const subjects = extractSubjectSignals(condensed);
  const sentences = splitSentences(condensed);
  const rankedSentences = [...sentences]
    .sort((a, b) => scoreSentence(b, subjects) - scoreSentence(a, subjects))
    .slice(0, 6);

  const summaryParts = [
    pageMarkers.length > 0 ? `Source pages: ${pageMarkers.join(", ")}.` : "Source pages unavailable.",
    "Subject coverage:",
    ...formatSubjects(subjects),
    `Narrative summary: ${rankedSentences.join(" ")}`,
  ];

  return summaryParts.join("\n");
}

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

async function generateSinglePrompt(
  contextSummary: string,
  pageRange: [number, number],
  tone: string,
  forbiddenPhrases: string[],
  variationIndex: number,
  existingPrompts: string[]
): Promise<string> {
  const forbiddenList = forbiddenPhrases.join(", ");

  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      {
        role: "system",
        content: `## Role
You are an expert visual prompt engineer specializing in OpenArt.ai image generation for **Classic Books for All** — a company that adapts classic literature (Frankenstein, The Time Machine, and similar works) into illustrated books for children. Your sole function is to receive a page of text and output a ready-to-use image prompt.

## Task
When given a page of text, generate one precise, detailed image prompt optimized for OpenArt.ai that will produce a high-quality illustration faithful to the scene, mood, and tone of that page.

## Context
Classic Books for All takes iconic literary works and simplifies them for young readers. Illustrations must honor the source material's atmosphere while remaining warm and accessible. Your prompts translate written narrative into vivid, generatable imagery on OpenArt.ai without including technical parameters, style references, or medium descriptors already preset in the platform.

## Instructions
- Return a single prompt as plain text (no JSON, no markdown, no numbering).
- Prompts can be up to 300 words — use every word to add visual information.
- Include a negative prompt section at the end beginning with "Negative prompt:".
- Match this tone preference: ${tone}.
- Ensure this variation is distinct from other generated prompts while staying faithful to the same pages.
- Identify the main subject, setting, characters, action, and emotional tone.
- Translate narrative into concrete visual descriptors: colors, lighting, composition, expressions, and environment.
- Reference characters by name with action from the source scene.
- Convert abstract emotions into visible concrete details.

Do NOT include:
- Character physical descriptions or appearance details
- Illustration style descriptors
- Art medium references
- Quality or mood tags
- Camera equipment references
- Resolution or technical specs
- Any of these forbidden phrases: ${forbiddenList}

Edge cases:
- If the source text is sparse, infer scene details from context and still produce a rich, concrete prompt.
- If multiple scenes appear, focus on the most visually dominant or emotionally significant moment.
- Always generate immediately without asking follow-up questions.`
      },
      {
        role: "user",
        content: `Generate variation ${variationIndex + 1} for pages ${pageRange[0]}-${pageRange[1]} using this summary:\n\n${contextSummary}\n\nAlready generated variations (do not repeat wording or composition):\n${existingPrompts.join("\n---\n") || "None yet."}`
      }
    ],
    max_completion_tokens: 900,
  });

  return (response.choices[0]?.message?.content || "").trim();
}

export async function generatePrompts(
  contextText: string,
  pageRange: [number, number],
  tone: string,
  forbiddenPhrases: string[]
): Promise<PromptVariation[]> {
  const contextSummary = summarizeContextText(contextText);
  const labels = ["Prompt Variation 1", "Prompt Variation 2", "Prompt Variation 3"] as const;
  const types = ["variation1", "variation2", "variation3"] as const;
  const promptTexts: string[] = [];

  for (let i = 0; i < 3; i++) {
    try {
      const text = await generateSinglePrompt(contextSummary, pageRange, tone, forbiddenPhrases, i, promptTexts);
      promptTexts.push(text || "Failed to generate prompt. Please try again.");
    } catch {
      promptTexts.push("Failed to generate prompt. Please try again.");
    }

    if (i < 2) {
      await sleep(VARIATION_DELAY_MS);
    }
  }

  return promptTexts.map((text, idx) => ({
    type: types[idx],
    label: labels[idx],
    text,
  }));
}

export async function extractCharacters(
  bookTitle: string
): Promise<ExtractedCharacter[]> {
  const { perplexity, PERPLEXITY_MODEL } = await import("./perplexity");

  const response = await perplexity.chat.completions.create({
    model: PERPLEXITY_MODEL,
    messages: [
      {
        role: "system",
        content: `You are a children's book expert. Look up the book and identify all characters.

For each character found, provide:
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

If no characters are found or the book cannot be identified, return an empty array [].`
      },
      {
        role: "user",
        content: `Look up the children's book titled "${bookTitle}" and list all characters with their details.`
      }
    ],
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
