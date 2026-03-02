import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Image, Users, BookOpen } from "lucide-react";
import UploadTab from "@/components/upload-tab";
import IllustrationsTab from "@/components/illustrations-tab";
import CharactersTab from "@/components/characters-tab";
import type { ProjectData } from "@shared/schema";

export default function HomePage() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [activeTab, setActiveTab] = useState("upload");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary text-primary-foreground">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight" data-testid="text-app-title">
              Book Illustration Planner
            </h1>
            <p className="text-sm text-muted-foreground">
              Plan and generate illustration prompts for children's books
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-11" data-testid="tabs-navigation">
            <TabsTrigger value="upload" className="gap-2" data-testid="tab-upload">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </TabsTrigger>
            <TabsTrigger
              value="illustrations"
              className="gap-2"
              disabled={!project}
              data-testid="tab-illustrations"
            >
              <Image className="w-4 h-4" />
              <span className="hidden sm:inline">Illustrations</span>
            </TabsTrigger>
            <TabsTrigger
              value="characters"
              className="gap-2"
              disabled={!project}
              data-testid="tab-characters"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Characters</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <UploadTab
              project={project}
              onProjectCreated={(p) => {
                setProject(p);
              }}
              onBoundariesUpdated={(boundaries, illustrations) => {
                if (project) {
                  setProject({
                    ...project,
                    boundaries,
                    illustrations: illustrations || project.illustrations,
                  });
                  setActiveTab("illustrations");
                }
              }}
            />
          </TabsContent>

          <TabsContent value="illustrations">
            {project && (
              <IllustrationsTab
                project={project}
                onIllustrationsUpdated={(illustrations) =>
                  setProject({ ...project, illustrations })
                }
              />
            )}
          </TabsContent>

          <TabsContent value="characters">
            {project && (
              <CharactersTab
                project={project}
                onCharactersUpdated={(characters) =>
                  setProject({ ...project, characters })
                }
              />
            )}
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
