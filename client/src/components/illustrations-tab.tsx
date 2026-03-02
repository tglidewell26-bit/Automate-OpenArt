import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Image, Loader2, Copy, Check, RefreshCw, Sparkles, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ProjectData, IllustrationBlock } from "@shared/schema";

interface IllustrationsTabProps {
  project: ProjectData;
  onIllustrationsUpdated: (illustrations: IllustrationBlock[]) => void;
}

export default function IllustrationsTab({ project, onIllustrationsUpdated }: IllustrationsTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerateAll = async () => {
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", `/api/projects/${project.id}/illustrations/generate`);
      const data = await res.json();
      onIllustrationsUpdated(data.illustrations);
      toast({ title: "Prompts generated", description: `${data.illustrations.length} illustration prompts created` });
    } catch (error: any) {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async (index: number) => {
    setRegeneratingIndex(index);
    try {
      const res = await apiRequest("POST", `/api/projects/${project.id}/illustrations/${index}/regenerate`);
      const data = await res.json();
      const updated = [...project.illustrations];
      updated[index] = data.illustration;
      onIllustrationsUpdated(updated);
      toast({ title: "Regenerated", description: `Prompts for illustration ${index + 1} updated` });
    } catch (error: any) {
      toast({ title: "Regeneration failed", description: error.message, variant: "destructive" });
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!project.boundaries) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">No boundaries set</p>
          <p className="text-sm text-muted-foreground">
            Go to the Upload tab and set the book boundaries first
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasPrompts = project.illustrations.some(ill => ill.prompts.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-illustrations-title">
            Illustration Prompts
          </h2>
          <p className="text-sm text-muted-foreground">
            Pages {project.boundaries.startPage}–{project.boundaries.endPage}
            {" "}·{" "}
            {project.illustrations.length} illustration blocks
          </p>
        </div>
        <Button
          onClick={handleGenerateAll}
          disabled={isGenerating}
          data-testid="button-generate-all"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {hasPrompts ? "Regenerate All" : "Generate All Prompts"}
        </Button>
      </div>

      {isGenerating ? (
        <div className="space-y-4">
          {Array.from({ length: project.illustrations.length }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-60 mt-1" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {project.illustrations.map((block, idx) => (
            <Card key={idx} data-testid={`card-illustration-${idx}`}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="tabular-nums">
                      #{idx + 1}
                    </Badge>
                    <CardTitle className="text-base">
                      Pages {block.pageRange[0]}–{block.pageRange[1]}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Context: pp. {block.contextPages[0]}–{block.contextPages[1]}
                    </span>
                    {block.prompts.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRegenerate(idx)}
                        disabled={regeneratingIndex === idx}
                        data-testid={`button-regenerate-${idx}`}
                      >
                        {regeneratingIndex === idx ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {block.prompts.length > 0 && (
                <CardContent className="space-y-3">
                  {block.prompts.map((prompt, pi) => {
                    const copyId = `${idx}-${pi}`;
                    const typeColors: Record<string, string> = {
                      moment: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
                      atmosphere: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
                      emotion: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800",
                    };

                    return (
                      <div
                        key={pi}
                        className={`rounded-md border p-4 ${typeColors[prompt.type] || ""}`}
                        data-testid={`prompt-${idx}-${pi}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <Badge variant="outline" className="text-xs shrink-0">
                            {prompt.label}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(prompt.text, copyId)}
                            data-testid={`button-copy-${idx}-${pi}`}
                          >
                            {copiedId === copyId ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-sm leading-relaxed">{prompt.text}</p>
                      </div>
                    );
                  })}
                </CardContent>
              )}
              {block.prompts.length === 0 && (
                <CardContent>
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    <Image className="w-5 h-5 mx-auto mb-2 opacity-40" />
                    No prompts generated yet
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
