import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { parsePdf } from "./pdf";
import { detectBookBoundaries, calculateIllustrationBlocks, generatePrompts, extractCharacters } from "./prompts";
import type { IllustrationBlock, PromptVariation } from "@shared/schema";

const BLOCK_DELAY_MS = 600; // delay between sequential LLM calls to avoid rate limits

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function fallbackPrompts(reason: string): PromptVariation[] {
  return [
    { type: "idea1", label: "Prompt Idea 1", text: `[${reason}] Please regenerate this block.` },
    { type: "idea2", label: "Prompt Idea 2", text: `[${reason}] Please regenerate this block.` },
    { type: "idea3", label: "Prompt Idea 3", text: `[${reason}] Please regenerate this block.` },
  ];
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/upload", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No PDF file uploaded" });
      }

      const { totalPages, pageTexts, fullText } = await parsePdf(req.file.buffer);

      const project = await storage.createProject(req.file.originalname, totalPages, pageTexts);

      const boundaries = await detectBookBoundaries(pageTexts, totalPages);
      await storage.updateBoundaries(project.id, boundaries);

      const blocks = calculateIllustrationBlocks(boundaries.startPage, boundaries.endPage);
      const illustrations: IllustrationBlock[] = blocks.map(b => ({
        ...b,
        prompts: [],
      }));
      await storage.updateIllustrations(project.id, illustrations);

      res.json({
        id: project.id,
        fileName: project.fileName,
        totalPages,
        boundaries,
        illustrations,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message || "Failed to process PDF" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    const { pageTexts, ...safeProject } = project;
    res.json(safeProject);
  });

  app.patch("/api/projects/:id/boundaries", async (req, res) => {
    const startPage = Math.floor(Number(req.body.startPage));
    const endPage = Math.floor(Number(req.body.endPage));

    if (!Number.isFinite(startPage) || !Number.isFinite(endPage) || startPage < 1 || endPage < 1 || startPage > endPage) {
      return res.status(400).json({ error: "Invalid boundaries: startPage and endPage must be positive integers with startPage <= endPage" });
    }

    const existingProject = await storage.getProject(req.params.id);
    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (startPage > existingProject.totalPages || endPage > existingProject.totalPages) {
      return res.status(400).json({ error: `Page numbers must be within 1-${existingProject.totalPages}` });
    }

    const project = await storage.updateBoundaries(req.params.id, { startPage, endPage });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const blocks = calculateIllustrationBlocks(startPage, endPage);
    const illustrations: IllustrationBlock[] = blocks.map(b => ({
      ...b,
      prompts: [],
    }));
    await storage.updateIllustrations(req.params.id, illustrations);

    res.json({ boundaries: project.boundaries, illustrations });
  });

  app.post("/api/projects/:id/illustrations/generate", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project || !project.boundaries) {
      return res.status(400).json({ error: "Project not found or boundaries not set" });
    }

    const blocks = calculateIllustrationBlocks(project.boundaries.startPage, project.boundaries.endPage);
    const illustrations: IllustrationBlock[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      let contextText = "";
      for (let p = block.contextPages[0]; p <= block.contextPages[1]; p++) {
        const pageText = project.pageTexts[p] || "";
        if (pageText) {
          contextText += `[Page ${p}]\n${pageText}\n\n`;
        }
      }

      if (!contextText.trim()) {
        contextText = `Pages ${block.pageRange[0]} to ${block.pageRange[1]} (no text extracted)`;
      }

      let prompts: PromptVariation[];
      try {
        prompts = await generatePrompts(
          contextText,
          block.pageRange,
          project.settings.promptTone,
          project.settings.forbiddenPhrases
        );
      } catch (err: any) {
        const reason = err?.status === 429 ? "Rate limit hit" : "Generation failed";
        console.error(`Block ${block.index} (pages ${block.pageRange[0]}-${block.pageRange[1]}) failed: ${err?.message}`);
        // Save whatever we have so far so partial progress isn't lost
        await storage.updateIllustrations(project.id, illustrations);
        prompts = fallbackPrompts(reason);
      }

      illustrations.push({ ...block, prompts });

      // Throttle: pause between blocks to avoid overloading the LLM API
      if (i < blocks.length - 1) {
        await sleep(BLOCK_DELAY_MS);
      }
    }

    await storage.updateIllustrations(project.id, illustrations);
    res.json({ illustrations });
  });

  app.post("/api/projects/:id/illustrations/:index/regenerate", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project || !project.boundaries) {
      return res.status(400).json({ error: "Project not found or boundaries not set" });
    }

    const index = parseInt(req.params.index);
    if (index < 0 || index >= project.illustrations.length) {
      return res.status(400).json({ error: "Invalid illustration index" });
    }

    const block = project.illustrations[index];
    let contextText = "";
    for (let p = block.contextPages[0]; p <= block.contextPages[1]; p++) {
      const pageText = project.pageTexts[p] || "";
      if (pageText) {
        contextText += `[Page ${p}]\n${pageText}\n\n`;
      }
    }

    if (!contextText.trim()) {
      contextText = `Pages ${block.pageRange[0]} to ${block.pageRange[1]} (no text extracted)`;
    }

    const prompts = await generatePrompts(
      contextText,
      block.pageRange,
      project.settings.promptTone,
      project.settings.forbiddenPhrases
    );

    const updatedBlock: IllustrationBlock = { ...block, prompts };
    await storage.updateSingleIllustration(project.id, index, updatedBlock);

    res.json({ illustration: updatedBlock });
  });

  app.post("/api/projects/:id/characters/extract", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const bookTitle = project.fileName.replace(/\.pdf$/i, "");
    const characters = await extractCharacters(bookTitle);
    await storage.updateCharacters(project.id, characters);

    res.json({ characters });
  });

  app.patch("/api/projects/:id/characters", async (req, res) => {
    const { characters } = req.body;
    const project = await storage.updateCharacters(req.params.id, characters);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({ characters: project.characters });
  });

  app.patch("/api/projects/:id/settings", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const settings = { ...project.settings, ...req.body };
    const updated = await storage.updateSettings(req.params.id, settings);
    res.json({ settings: updated?.settings });
  });

  return httpServer;
}
