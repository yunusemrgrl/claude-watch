"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save,
  RefreshCw,
  FileText,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ClaudeMdResponse } from "@/types";

type FileKey = "plan" | "project";

interface SaveState {
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
}

export function ClaudeMdView() {
  const [data, setData] = useState<ClaudeMdResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FileKey>("plan");
  const [planContent, setPlanContent] = useState("");
  const [projectContent, setProjectContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const load = useCallback(() => {
    setLoading(true);
    fetch("/claudemd")
      .then((r) => r.json())
      .then((d: ClaudeMdResponse) => {
        setData(d);
        setPlanContent(d.plan.content);
        setProjectContent(d.project.content);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (file: FileKey) => {
    setSaveState({ status: "saving" });
    const content = file === "plan" ? planContent : projectContent;
    try {
      const r = await fetch("/claudemd", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, content }),
      });
      if (r.ok) {
        setSaveState({ status: "saved" });
        setTimeout(() => setSaveState({ status: "idle" }), 2000);
      } else {
        const err = (await r.json()) as { error?: string };
        setSaveState({ status: "error", message: err.error ?? "Save failed" });
      }
    } catch {
      setSaveState({ status: "error", message: "Network error" });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  const tabs: { key: FileKey; label: string; subtitle: string }[] = [
    {
      key: "plan",
      label: ".claudedash/CLAUDE.md",
      subtitle: "Plan mode instructions injected into every agent context",
    },
    {
      key: "project",
      label: "CLAUDE.md",
      subtitle: "Project root — global agent instructions for this repository",
    },
  ];

  const activeFile = data?.[activeTab];
  const content = activeTab === "plan" ? planContent : projectContent;
  const setContent = activeTab === "plan" ? setPlanContent : setProjectContent;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between shrink-0 bg-background">
        <div className="flex items-center gap-3">
          <FileText className="size-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium text-foreground">
              CLAUDE.md Editor
            </h2>
            <p className="text-xs text-muted-foreground">
              Edit agent instruction files
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveState.status === "saved" && (
            <div className="flex items-center gap-1 text-xs text-chart-2">
              <CheckCircle className="size-3" /> Saved
            </div>
          )}
          {saveState.status === "error" && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="size-3" /> {saveState.message}
            </div>
          )}
          <button
            onClick={load}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            title="Reload from disk"
          >
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => void save(activeTab)}
            disabled={saveState.status === "saving" || !activeFile?.path}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="size-3" />
            {saveState.status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-4 flex items-center gap-1 shrink-0 bg-background">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Subtitle */}
      {tabs.find((t) => t.key === activeTab) && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border shrink-0">
          <p className="text-xs text-muted-foreground">
            {tabs.find((t) => t.key === activeTab)?.subtitle}
            {activeFile?.path && (
              <span className="ml-2 font-mono opacity-60">
                {activeFile.path}
              </span>
            )}
          </p>
          {!activeFile?.exists && (
            <p className="text-xs text-amber-500 mt-0.5">
              File does not exist yet — saving will create it.
            </p>
          )}
        </div>
      )}

      {/* Editor */}
      <ScrollArea className="flex-1">
        <div className="p-4 h-full">
          {!activeFile?.path ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Plan mode not configured — run{" "}
              <code className="mx-1 bg-muted px-1 rounded">
                claudedash init
              </code>{" "}
              first.
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="w-full min-h-[75vh] bg-transparent text-sm font-mono text-foreground placeholder-muted-foreground resize-none focus:outline-none leading-relaxed"
              placeholder="# CLAUDE.md&#10;&#10;Start writing agent instructions..."
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
