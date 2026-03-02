import { z } from "zod";

export const bookBoundariesSchema = z.object({
  startPage: z.number().min(1),
  endPage: z.number().min(1),
});

export type BookBoundaries = z.infer<typeof bookBoundariesSchema>;

export interface IllustrationBlock {
  index: number;
  pageRange: [number, number];
  contextPages: [number, number];
  prompts: PromptVariation[];
  isGenerating?: boolean;
}

export interface PromptVariation {
  type: "moment" | "atmosphere" | "emotion";
  label: string;
  text: string;
}

export interface ExtractedCharacter {
  id: string;
  name: string;
  aliases: string[];
  physicalTraits: string;
  clothing: string;
  recurringFeatures: string;
}

export interface ProjectData {
  id: string;
  fileName: string;
  totalPages: number;
  boundaries: BookBoundaries | null;
  illustrations: IllustrationBlock[];
  characters: ExtractedCharacter[];
  settings: ProjectSettings;
  pageTexts: Record<number, string>;
}

export interface ProjectSettings {
  model: "openai";
  forbiddenPhrases: string[];
  promptTone: "neutral" | "whimsical" | "dramatic" | "gentle";
}

export const defaultSettings: ProjectSettings = {
  model: "openai",
  forbiddenPhrases: [
    "oil painting", "watercolor", "digital art", "acrylic",
    "realistic", "anime style", "cinematic style", "cartoon style",
    "4k", "8k", "ultra-HD", "photorealistic", "high resolution",
    "camera angle", "wide-angle lens", "depth of field", "bokeh",
    "render", "CGI", "3D render", "unreal engine",
  ],
  promptTone: "neutral",
};
