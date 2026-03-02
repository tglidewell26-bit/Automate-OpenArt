import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, Loader2, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ProjectData, ProjectSettings } from "@shared/schema";

interface SettingsTabProps {
  project: ProjectData;
  onSettingsUpdated: (settings: ProjectSettings) => void;
}

export default function SettingsTab({ project, onSettingsUpdated }: SettingsTabProps) {
  const [settings, setSettings] = useState<ProjectSettings>(project.settings);
  const [isSaving, setIsSaving] = useState(false);
  const [newPhrase, setNewPhrase] = useState("");
  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/projects/${project.id}/settings`, settings);
      const data = await res.json();
      onSettingsUpdated(data.settings);
      toast({ title: "Settings saved" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const addPhrase = () => {
    const trimmed = newPhrase.trim();
    if (trimmed && !settings.forbiddenPhrases.includes(trimmed)) {
      setSettings({
        ...settings,
        forbiddenPhrases: [...settings.forbiddenPhrases, trimmed],
      });
      setNewPhrase("");
    }
  };

  const removePhrase = (phrase: string) => {
    setSettings({
      ...settings,
      forbiddenPhrases: settings.forbiddenPhrases.filter(p => p !== phrase),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-settings-title">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure AI model, forbidden phrases, and prompt tone
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-settings">
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Model</CardTitle>
            <CardDescription>Select which model to use for prompt generation</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={settings.model}
              onValueChange={(value) => setSettings({ ...settings, model: value as "openai" })}
            >
              <SelectTrigger data-testid="select-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI (GPT)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prompt Tone</CardTitle>
            <CardDescription>Set the overall tone for generated prompts</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={settings.promptTone}
              onValueChange={(value) =>
                setSettings({ ...settings, promptTone: value as ProjectSettings["promptTone"] })
              }
            >
              <SelectTrigger data-testid="select-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="whimsical">Whimsical</SelectItem>
                <SelectItem value="dramatic">Dramatic</SelectItem>
                <SelectItem value="gentle">Gentle</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forbidden Phrases</CardTitle>
          <CardDescription>
            These terms will be excluded from all generated prompts. Medium, style, resolution,
            and camera terms are forbidden by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Add a forbidden phrase..."
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addPhrase(); }}
              data-testid="input-new-phrase"
            />
            <Button variant="outline" onClick={addPhrase} data-testid="button-add-phrase">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {settings.forbiddenPhrases.map((phrase) => (
              <Badge
                key={phrase}
                variant="secondary"
                className="gap-1 pr-1 cursor-pointer"
                data-testid={`badge-phrase-${phrase}`}
              >
                {phrase}
                <button
                  onClick={() => removePhrase(phrase)}
                  className="ml-1 rounded-full p-0.5"
                  data-testid={`button-remove-phrase-${phrase}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>

          {settings.forbiddenPhrases.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No forbidden phrases. Add some to filter unwanted terms from prompts.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
