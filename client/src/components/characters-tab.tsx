import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2, Sparkles, Copy, Check, Save, UserCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ProjectData, ExtractedCharacter } from "@shared/schema";

interface CharactersTabProps {
  project: ProjectData;
  onCharactersUpdated: (characters: ExtractedCharacter[]) => void;
}

export default function CharactersTab({ project, onCharactersUpdated }: CharactersTabProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingChars, setEditingChars] = useState<ExtractedCharacter[]>(project.characters);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleExtract = async () => {
    setIsExtracting(true);
    try {
      const res = await apiRequest("POST", `/api/projects/${project.id}/characters/extract`);
      const data = await res.json();
      setEditingChars(data.characters);
      onCharactersUpdated(data.characters);
      toast({ title: "Characters extracted", description: `${data.characters.length} characters found` });
    } catch (error: any) {
      toast({ title: "Extraction failed", description: error.message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/projects/${project.id}/characters`, {
        characters: editingChars,
      });
      const data = await res.json();
      onCharactersUpdated(data.characters);
      toast({ title: "Characters saved" });
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateCharacter = (index: number, field: keyof ExtractedCharacter, value: any) => {
    const updated = [...editingChars];
    updated[index] = { ...updated[index], [field]: value };
    setEditingChars(updated);
  };

  const handleCopy = async (char: ExtractedCharacter) => {
    const text = [
      `Name: ${char.name}`,
      char.aliases.length ? `Aliases: ${char.aliases.join(", ")}` : "",
      `Physical Traits: ${char.physicalTraits}`,
      `Clothing: ${char.clothing}`,
      `Recurring Features: ${char.recurringFeatures}`,
    ].filter(Boolean).join("\n");

    await navigator.clipboard.writeText(text);
    setCopiedId(char.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isExtracting) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Character References</h2>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-characters-title">
            Character References
          </h2>
          <p className="text-sm text-muted-foreground">
            {editingChars.length > 0
              ? `${editingChars.length} character${editingChars.length !== 1 ? "s" : ""} found — edit details as needed`
              : "Extract character references from your book for use in OpenArt"
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editingChars.length > 0 && (
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isSaving}
              data-testid="button-save-characters"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
          <Button
            onClick={handleExtract}
            disabled={isExtracting}
            data-testid="button-extract-characters"
          >
            {isExtracting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {editingChars.length > 0 ? "Re-extract" : "Extract Characters"}
          </Button>
        </div>
      </div>

      {editingChars.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
              <UserCircle className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">No characters extracted yet</p>
            <p className="text-sm text-muted-foreground">
              Click "Extract Characters" to scan your book for character references
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {editingChars.map((char, idx) => (
            <Card key={char.id} data-testid={`card-character-${idx}`}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      {char.name.charAt(0)}
                    </div>
                    <CardTitle className="text-base">{char.name}</CardTitle>
                    {char.aliases.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({char.aliases.join(", ")})
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(char)}
                    data-testid={`button-copy-character-${idx}`}
                  >
                    {copiedId === char.id ? (
                      <>
                        <Check className="w-3 h-3 mr-1 text-green-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={char.name}
                      onChange={(e) => updateCharacter(idx, "name", e.target.value)}
                      data-testid={`input-character-name-${idx}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Aliases (comma-separated)</Label>
                    <Input
                      value={char.aliases.join(", ")}
                      onChange={(e) =>
                        updateCharacter(idx, "aliases", e.target.value.split(",").map(s => s.trim()).filter(Boolean))
                      }
                      data-testid={`input-character-aliases-${idx}`}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Physical Traits</Label>
                  <Textarea
                    value={char.physicalTraits}
                    onChange={(e) => updateCharacter(idx, "physicalTraits", e.target.value)}
                    className="resize-none"
                    rows={2}
                    data-testid={`input-character-traits-${idx}`}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Clothing</Label>
                    <Textarea
                      value={char.clothing}
                      onChange={(e) => updateCharacter(idx, "clothing", e.target.value)}
                      className="resize-none"
                      rows={2}
                      data-testid={`input-character-clothing-${idx}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Recurring Features</Label>
                    <Textarea
                      value={char.recurringFeatures}
                      onChange={(e) => updateCharacter(idx, "recurringFeatures", e.target.value)}
                      className="resize-none"
                      rows={2}
                      data-testid={`input-character-features-${idx}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
