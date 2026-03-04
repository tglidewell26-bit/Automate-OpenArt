import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const MODEL_NAME = process.env.MODEL_NAME || "gpt-4.1-2025-04-14";

console.log(`[LLM] Using OpenAI — model: ${MODEL_NAME}`);
