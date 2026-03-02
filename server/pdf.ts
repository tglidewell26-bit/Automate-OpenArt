import { createRequire } from "module";

// pdf-parse is a CommonJS module — use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ numpages: number; text: string }>;

export async function parsePdf(buffer: Buffer): Promise<{
  totalPages: number;
  pageTexts: Record<number, string>;
  fullText: string;
}> {
  const data = await pdfParse(buffer);

  const totalPages: number = data.numpages || 1;
  const fullText: string = data.text || "";

  // Split the full text into per-page chunks by distributing lines evenly.
  // This is an approximation — pdf-parse v1 doesn't expose hard page breaks,
  // but the line distribution is accurate enough for illustration context windows.
  const pageTexts: Record<number, string> = {};

  if (fullText.length > 0) {
    const lines = fullText.split("\n").filter((l) => l.trim().length > 0);
    const linesPerPage = Math.max(1, Math.ceil(lines.length / totalPages));

    for (let i = 1; i <= totalPages; i++) {
      const start = (i - 1) * linesPerPage;
      const end = Math.min(i * linesPerPage, lines.length);
      pageTexts[i] = lines.slice(start, end).join("\n").trim();
    }
  } else {
    for (let i = 1; i <= totalPages; i++) {
      pageTexts[i] = "";
    }
  }

  return { totalPages, pageTexts, fullText: fullText.trim() };
}
