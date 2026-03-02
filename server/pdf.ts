export async function parsePdf(buffer: Buffer): Promise<{
  totalPages: number;
  pageTexts: Record<number, string>;
  fullText: string;
}> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  await parser.load();

  try {
    const info = await parser.getInfo();
    const totalPages = info.total || 1;

    const pageTexts: Record<number, string> = {};
    let fullText = "";

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

    return {
      totalPages,
      pageTexts,
      fullText: fullText.trim(),
    };
  } finally {
    parser.destroy();
  }
}
