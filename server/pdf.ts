import { PDFParse } from "pdf-parse";

export async function parsePdf(buffer: Buffer): Promise<{
  totalPages: number;
  pageTexts: Record<number, string>;
  fullText: string;
}> {
  const parser = new PDFParse({ data: buffer });

  try {
    const info = await parser.getInfo();
    const totalPages = Math.max(1, info.total || 1);

    const fullTextResult = await parser.getText();
    const fullText = (fullTextResult.text || "").trim();
    const pageTexts: Record<number, string> = {};

    for (let i = 1; i <= totalPages; i++) {
      try {
        const pageResult = await parser.getText({ partial: [i] });
        pageTexts[i] = (pageResult.text || "").trim();
      } catch {
        pageTexts[i] = "";
      }
    }

    if (Object.values(pageTexts).every((text) => !text) && fullText) {
      const lines = fullText.split("\n").filter((line: string) => line.trim().length > 0);
      const linesPerPage = Math.max(1, Math.ceil(lines.length / totalPages));

      for (let i = 1; i <= totalPages; i++) {
        const start = (i - 1) * linesPerPage;
        const end = start + linesPerPage;
        pageTexts[i] = lines.slice(start, end).join("\n");
      }
    }

    return {
      totalPages,
      pageTexts,
      fullText,
    };
  } finally {
    await parser.destroy();
  }
}
