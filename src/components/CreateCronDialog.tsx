"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Loader2, Plus, Clock, Repeat, Calendar } from "lucide-react";

const MODELS = [
  { value: "", label: "Default (inherit)" },
  { value: "haiku", label: "Haiku 4.5", color: "bg-green-500" },
  { value: "sonnet", label: "Sonnet 4.5", color: "bg-blue-500" },
  { value: "opus", label: "Opus 4.5", color: "bg-purple-500" },
  { value: "opus-4.6", label: "Opus 4.6", color: "bg-purple-600" },
  { value: "OpenRouter", label: "OpenRouter Auto", color: "bg-gray-500" },
];

const THINKING_LEVELS = [
  { value: "", label: "Default" },
  { value: "off", label: "Off" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const SCHEDULE_TYPES = [
  { value: "once", label: "One-time", icon: Clock, description: "Run once at a specific time" },
  { value: "every", label: "Recurring interval", icon: Repeat, description: "Run every X minutes/hours" },
  { value: "cron", label: "Cron expression", icon: Calendar, description: "Advanced cron schedule" },
];

interface CreateCronDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  prefill?: { scheduleType: string; scheduleValue: string } | null;
}

export function CreateCronDialog({ open, onOpenChange, onCreated, prefill }: CreateCronDialogProps) {
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState("every");
  const [scheduleValue, setScheduleValue] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [model, setModel] = useState("");
  const [sessionTarget, setSessionTarget] = useState<"main" | "isolated">("isolated");
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState("");
  const [announce, setAnnounce] = useState(true);
  const [enabled, setEnabled] = useState(true);

  // Apply prefill when dialog opens with prefilled data
  useEffect(() => {
    if (open && prefill) {
      setScheduleType(prefill.scheduleType);
      setScheduleValue(prefill.scheduleValue);
    }
  }, [open, prefill]);

  const [improving, setImproving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const reset = useCallback(() => {
    setName("");
    setScheduleType("every");
    setScheduleValue("");
    setTimezone("Asia/Kolkata");
    setModel("");
    setSessionTarget("isolated");
    setPrompt("");
    setThinking("");
    setAnnounce(true);
    setEnabled(true);
    setError("");
    setSuccess(false);
  }, []);

  const handleImprovePrompt = useCallback(async () => {
    if (!prompt.trim()) return;
    setImproving(true);
    setError("");
    try {
      const res = await fetch("/api/improve-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, sessionTarget }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.improvedPrompt) {
        setPrompt(data.improvedPrompt);
      }
    } catch {
      setError("Failed to improve prompt");
    } finally {
      setImproving(false);
    }
  }, [prompt, sessionTarget]);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !scheduleValue.trim() || !prompt.trim()) {
      setError("Name, schedule, and prompt are required");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scheduleType,
          scheduleValue: scheduleType === "once" && scheduleValue.includes("T") && !scheduleValue.startsWith("+")
            // datetime-local gives "YYYY-MM-DDTHH:MM" in local (IST) — convert to UTC ISO
            ? new Date(new Date(scheduleValue).getTime() - (5.5 * 60 * 60 * 1000)).toISOString().replace(/\.\d{3}Z$/, "")
            : scheduleValue.trim(),
          timezone: scheduleType === "cron" ? timezone : undefined,
          model: (model && model !== "default") ? model : undefined,
          sessionTarget,
          prompt: prompt.trim(),
          thinking: (thinking && thinking !== "default") ? thinking : undefined,
          announce: sessionTarget === "isolated" ? announce : undefined,
          enabled,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      } else {
        setSuccess(true);
        onCreated?.();
        setTimeout(() => {
          onOpenChange(false);
          reset();
        }, 1500);
      }
    } catch {
      setError("Failed to create cron job");
    } finally {
      setCreating(false);
    }
  }, [name, scheduleType, scheduleValue, timezone, model, sessionTarget, prompt, thinking, announce, enabled, onCreated, onOpenChange, reset]);

  const scheduleHint = scheduleType === "once"
    ? "ISO date (2026-02-12T09:00:00) or relative (+20m, +2h)"
    : scheduleType === "every"
    ? "Duration: 30m, 1h, 6h, 1d"
    : "5-field cron: */30 * * * * (every 30 min)";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create Cron Job
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cron-name">Name</Label>
            <Input
              id="cron-name"
              placeholder="Email Check, Daily Summary..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Schedule Type */}
          <div className="space-y-2">
            <Label>Schedule</Label>
            <div className="grid grid-cols-3 gap-2">
              {SCHEDULE_TYPES.map((st) => {
                const Icon = st.icon;
                return (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => { setScheduleType(st.value); setScheduleValue(""); }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all ${
                      scheduleType === st.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium">{st.label}</span>
                  </button>
                );
              })}
            </div>
            {scheduleType === "once" ? (
              <div className="space-y-2">
                <Input
                  type="datetime-local"
                  value={scheduleValue}
                  onChange={(e) => setScheduleValue(e.target.value)}
                  className="w-full"
                />
                <p className="text-[11px] text-muted-foreground">
                  Time is in IST. Also accepts relative: +20m, +2h
                </p>
              </div>
            ) : scheduleType === "every" ? (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {["15m", "30m", "1h", "2h", "3h", "6h", "12h", "1d"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setScheduleValue(v)}
                      className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        scheduleValue === v
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="Or custom: 45m, 8h, 2d..."
                  value={scheduleValue}
                  onChange={(e) => setScheduleValue(e.target.value)}
                />
              </div>
            ) : (
              <Input
                placeholder={scheduleHint}
                value={scheduleValue}
                onChange={(e) => setScheduleValue(e.target.value)}
              />
            )}
            {scheduleType === "cron" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="tz" className="text-xs text-muted-foreground whitespace-nowrap">Timezone:</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Kolkata">IST (Asia/Kolkata)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">ET (New York)</SelectItem>
                    <SelectItem value="America/Los_Angeles">PT (Los Angeles)</SelectItem>
                    <SelectItem value="Europe/London">GMT (London)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Execution Target */}
          <div className="space-y-2">
            <Label>Run as</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSessionTarget("isolated")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  sessionTarget === "isolated"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="text-sm font-medium">🤖 Sub-agent</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Isolated session, runs independently
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSessionTarget("main")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  sessionTarget === "main"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="text-sm font-medium">💬 System Event</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Injects into main session
                </div>
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value || "default"}>
                      <div className="flex items-center gap-2">
                        {m.color && <div className={`w-2 h-2 rounded-full ${m.color}`} />}
                        {m.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {sessionTarget === "isolated" && (
              <div className="space-y-1.5">
                <Label>Thinking</Label>
                <Select value={thinking} onValueChange={setThinking}>
                  <SelectTrigger>
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    {THINKING_LEVELS.map((t) => (
                      <SelectItem key={t.value} value={t.value || "default"}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cron-prompt">
                {sessionTarget === "main" ? "System Event Text" : "Agent Prompt"}
              </Label>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleImprovePrompt}
                disabled={improving || !prompt.trim()}
                className="text-xs gap-1"
              >
                {improving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Improve
              </Button>
            </div>
            <Textarea
              id="cron-prompt"
              placeholder={
                sessionTarget === "main"
                  ? "Check inbox for urgent emails and notify me if anything important..."
                  : "Search my inbox for urgent emails. If there are any from important contacts, send a summary to Telegram..."
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-y"
            />
          </div>

          {/* Options row */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
              <Label htmlFor="enabled" className="text-sm">Enabled</Label>
            </div>
            {sessionTarget === "isolated" && (
              <div className="flex items-center gap-2">
                <Switch
                  id="announce"
                  checked={announce}
                  onCheckedChange={setAnnounce}
                />
                <Label htmlFor="announce" className="text-sm">Announce result</Label>
              </div>
            )}
          </div>

          {/* Preview */}
          {name && scheduleValue && prompt && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Preview</div>
              <div className="text-sm">
                <span className="font-semibold">{name}</span>
                {" · "}
                <span className="text-muted-foreground">
                  {scheduleType === "once" ? `once at ${scheduleValue}` :
                   scheduleType === "every" ? `every ${scheduleValue}` :
                   scheduleValue}
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {sessionTarget === "main" ? "System Event" : "Sub-agent"}
                </Badge>
                {model && (
                  <Badge variant="outline" className="text-[10px]">
                    {MODELS.find(m => m.value === model)?.label || model}
                  </Badge>
                )}
                {!enabled && (
                  <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
                )}
              </div>
            </div>
          )}

          {/* Error / Success */}
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-500 bg-green-500/10 rounded-lg px-3 py-2">
              ✓ Cron job created successfully!
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !name.trim() || !scheduleValue.trim() || !prompt.trim()}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
