import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Check, Loader2, BookOpen, ArrowRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ProjectData, BookBoundaries, IllustrationBlock } from "@shared/schema";

interface UploadTabProps {
  project: ProjectData | null;
  onProjectCreated: (project: ProjectData) => void;
  onBoundariesUpdated: (boundaries: BookBoundaries, illustrations?: IllustrationBlock[]) => void;
}

export default function UploadTab({ project, onProjectCreated, onBoundariesUpdated }: UploadTabProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const { toast } = useToast();

  const handleUpload = useCallback(async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();

      setStartPage(data.boundaries.startPage);
      setEndPage(data.boundaries.endPage);

      const projectRes = await fetch(`/api/projects/${data.id}`);
      const projectData = await projectRes.json();

      onProjectCreated({ ...projectData, pageTexts: {} });

      toast({ title: "PDF uploaded", description: `${data.fileName} processed (${data.totalPages} pages)` });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [onProjectCreated, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleSaveBoundaries = async () => {
    if (!project) return;
    setIsSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/projects/${project.id}/boundaries`, {
        startPage,
        endPage,
      });
      const data = await res.json();
      onBoundariesUpdated(data.boundaries, data.illustrations);
      toast({ title: "Boundaries updated", description: `Pages ${startPage}–${endPage} set as book range` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {!project ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Your Book
            </CardTitle>
            <CardDescription>
              Upload a PDF of your children's book to begin planning illustrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`relative border-2 border-dashed rounded-md p-12 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25"
              } ${isUploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => {
                if (!isUploading) {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".pdf";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleUpload(file);
                  };
                  input.click();
                }
              }}
              data-testid="dropzone-upload"
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-sm font-medium">Processing your PDF...</p>
                  <p className="text-xs text-muted-foreground">
                    Analyzing pages and detecting book boundaries
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Drop your PDF here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports PDF files up to 50MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{project.fileName}</CardTitle>
                    <CardDescription>{project.totalPages} pages detected</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" data-testid="badge-status">
                  <Check className="w-3 h-3 mr-1" /> Uploaded
                </Badge>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Book Boundaries</CardTitle>
              <CardDescription>
                AI-detected start and end pages. Adjust if needed — the story content
                should start at Chapter 1 and end before the Author Biography.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startPage">Start Page (Chapter 1)</Label>
                  <Input
                    id="startPage"
                    type="number"
                    min={1}
                    max={project.totalPages}
                    value={startPage}
                    onChange={(e) => setStartPage(parseInt(e.target.value) || 1)}
                    data-testid="input-start-page"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endPage">End Page (Before Bio)</Label>
                  <Input
                    id="endPage"
                    type="number"
                    min={1}
                    max={project.totalPages}
                    value={endPage}
                    onChange={(e) => setEndPage(parseInt(e.target.value) || 1)}
                    data-testid="input-end-page"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  {endPage - startPage + 1} pages selected
                  {" "}·{" "}
                  {Math.ceil((endPage - startPage + 1) / 3)} illustration{Math.ceil((endPage - startPage + 1) / 3) !== 1 ? "s" : ""}
                </p>
                <Button
                  onClick={handleSaveBoundaries}
                  disabled={isSaving || startPage >= endPage}
                  data-testid="button-save-boundaries"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Save & Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
