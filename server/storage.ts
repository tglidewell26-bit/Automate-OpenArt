import { type ProjectData, type ProjectSettings, type IllustrationBlock, type ExtractedCharacter, type BookBoundaries, defaultSettings } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getProject(id: string): Promise<ProjectData | undefined>;
  createProject(fileName: string, totalPages: number, pageTexts: Record<number, string>): Promise<ProjectData>;
  updateBoundaries(id: string, boundaries: BookBoundaries): Promise<ProjectData | undefined>;
  updateIllustrations(id: string, illustrations: IllustrationBlock[]): Promise<ProjectData | undefined>;
  updateCharacters(id: string, characters: ExtractedCharacter[]): Promise<ProjectData | undefined>;
  updateSettings(id: string, settings: ProjectSettings): Promise<ProjectData | undefined>;
  updateSingleIllustration(id: string, illustrationIndex: number, illustration: IllustrationBlock): Promise<ProjectData | undefined>;
}

export class MemStorage implements IStorage {
  private projects: Map<string, ProjectData>;

  constructor() {
    this.projects = new Map();
  }

  async getProject(id: string): Promise<ProjectData | undefined> {
    return this.projects.get(id);
  }

  async createProject(fileName: string, totalPages: number, pageTexts: Record<number, string>): Promise<ProjectData> {
    const id = randomUUID();
    const project: ProjectData = {
      id,
      fileName,
      totalPages,
      boundaries: null,
      illustrations: [],
      characters: [],
      settings: { ...defaultSettings },
      pageTexts,
    };
    this.projects.set(id, project);
    return project;
  }

  async updateBoundaries(id: string, boundaries: BookBoundaries): Promise<ProjectData | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    project.boundaries = boundaries;
    return project;
  }

  async updateIllustrations(id: string, illustrations: IllustrationBlock[]): Promise<ProjectData | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    project.illustrations = illustrations;
    return project;
  }

  async updateCharacters(id: string, characters: ExtractedCharacter[]): Promise<ProjectData | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    project.characters = characters;
    return project;
  }

  async updateSettings(id: string, settings: ProjectSettings): Promise<ProjectData | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    project.settings = settings;
    return project;
  }

  async updateSingleIllustration(id: string, illustrationIndex: number, illustration: IllustrationBlock): Promise<ProjectData | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    if (illustrationIndex >= 0 && illustrationIndex < project.illustrations.length) {
      project.illustrations[illustrationIndex] = illustration;
    }
    return project;
  }
}

export const storage = new MemStorage();
