import { createRequire } from "module";

// pdf-parse is a CommonJS module — use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ numpages: number; text: string }>;

type TextItem = {
  str?: string;
  transform?: number[];
};

async function renderPage(pageData: any): Promise<string> {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });

  let text = "";
  let lastY: number | undefined;

  for (const item of textContent.items as TextItem[]) {
    const value = item.str?.trim();
    if (!value) continue;

    const y = item.transform?.[5];
    if (text.length > 0) {
      text += y === lastY ? " " : "\n";
    }

    text += value;
    lastY = y;
  }

  return text.trim();
}

export async function parsePdf(buffer: Buffer): Promise<{
  totalPages: number;
  pageTexts: Record<number, string>;
  fullText: string;
}> {
  const perPageText: string[] = [];
  const data = await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const text = await renderPage(pageData);
      perPageText.push(text);
      return text;
    },
  });

  try {
    const info = await parser.getInfo();
    const totalPages = info.total || 1;

  const pageTexts: Record<number, string> = {};

  if (perPageText.length === totalPages) {
    for (let i = 1; i <= totalPages; i++) {
      pageTexts[i] = perPageText[i - 1] || "";
    }
  } else if (fullText.includes("\f")) {
    const pages = fullText.split("\f");
    for (let i = 1; i <= totalPages; i++) {
      pageTexts[i] = (pages[i - 1] || "").trim();
    }
  } else {
    const lines = fullText.split("\n").filter((l) => l.trim().length > 0);
    const linesPerPage = Math.max(1, Math.ceil(lines.length / totalPages));

    for (let i = 1; i <= totalPages; i++) {
      try {
        const pageText = await parser.getPageText(i);
        const text = typeof pageText === "string" ? pageText.trim() : String(pageText || "").trim();
        pageTexts[i] = text;
        fullText += text + "\n\n";
      } catch {
        pageTexts[i] = "";
      }
    }
  }

    return {
      totalPages,
      pageTexts,
      fullText: fullText.trim(),
    };
  } finally {
    parser.destroy();
  }
}
