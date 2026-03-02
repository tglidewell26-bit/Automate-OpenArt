import OpenAI from "openai";

// Primary client — uses Replit's injected OpenAI credentials by default.
// To switch to Groq instead, set these env vars:
//   GROQ_API_KEY=<your key from console.groq.com>
//   USE_GROQ=true
//
// Groq is OpenAI API-compatible and significantly faster for text tasks.
// Free-tier models: llama-3.3-70b-versatile, llama-3.1-8b-instant, gemma2-9b-it

const useGroq = process.env.USE_GROQ === "true" && !!process.env.GROQ_API_KEY;

export const openai = useGroq
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

// Model to use. Groq models are specified separately since the naming differs.
// Override with MODEL_NAME env var if needed.
export const MODEL_NAME =
  process.env.MODEL_NAME ||
  (useGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

if (useGroq) {
  console.log(`[LLM] Using Groq — model: ${MODEL_NAME}`);
} else {
  console.log(`[LLM] Using OpenAI — model: ${MODEL_NAME}`);
}
