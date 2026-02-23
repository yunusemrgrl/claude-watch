"use client";

import { useState, useEffect, useCallback } from "react";
import { Camera, Copy, Check, Trash2, GitCommit, Clock, RefreshCw } from "lucide-react";
import { TypingPrompt } from "@/components/TypingPrompt";

interface SnapshotEntry {
  filename: string;
  commitHash?: string;
  capturedAt: string;
  branch: string;
  taskSummary: { total: number; done: number; ready: number };
  focus?: string;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title={label}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono bg-muted/60 hover:bg-muted border border-border/60 transition-colors text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3 text-chart-2" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy rollback"}
    </button>
  );
}

function SnapshotRow({
  entry,
  onDelete,
}: {
  entry: SnapshotEntry;
  onDelete: (filename: string) => void;
}) {
  const hash = entry.commitHash ?? null;
  const rollbackCmd = hash
    ? `git reset --hard ${hash}\nclaudedash recover ${hash}`
    : null;

  const date = new Date(entry.capturedAt);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const pct = entry.taskSummary.total > 0
    ? Math.round((entry.taskSummary.done / entry.taskSummary.total) * 100)
    : 0;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card hover:border-border transition-colors group">
      {/* Icon */}
      <div className={`mt-0.5 shrink-0 ${hash ? "text-chart-4" : "text-muted-foreground/40"}`}>
        {hash ? <GitCommit className="size-4" /> : <Clock className="size-4" />}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {hash && (
            <code className="text-xs font-mono bg-chart-4/10 text-chart-4 px-1.5 py-0.5 rounded border border-chart-4/20">
              {hash.slice(0, 8)}
            </code>
          )}
          <span className="text-xs text-muted-foreground">{dateStr} {timeStr}</span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs font-mono text-muted-foreground/80">{entry.branch}</span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-chart-2">{entry.taskSummary.done}/{entry.taskSummary.total} done</span>
          {entry.taskSummary.total > 0 && (
            <span className="text-xs text-muted-foreground/50">({pct}%)</span>
          )}
        </div>
        {entry.focus && (
          <p className="text-xs text-muted-foreground italic truncate">{entry.focus}</p>
        )}
        {rollbackCmd && (
          <div className="flex items-center gap-2 pt-1">
            <CopyButton text={rollbackCmd} label="Copy rollback commands" />
            <code className="text-[10px] font-mono text-muted-foreground/50 truncate hidden sm:block">
              git reset --hard {hash?.slice(0, 8)} &amp;&amp; claudedash recover {hash?.slice(0, 8)}
            </code>
          </div>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={() => onDelete(entry.filename)}
        title="Delete snapshot"
        className="shrink-0 p-1.5 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function SnapshotsView() {
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshots = useCallback(() => {
    setLoading(true);
    const controller = new AbortController();
    fetch("/snapshots", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((d: { snapshots: SnapshotEntry[] }) => {
        setSnapshots(d.snapshots);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return fetchSnapshots();
  }, [fetchSnapshots]);

  const handleDelete = (filename: string) => {
    const hash = filename.replace(/\.json$/, "");
    fetch(`/snapshots/${hash}`, { method: "DELETE" })
      .then((r) => { if (r.ok) fetchSnapshots(); })
      .catch(() => { /* ignore */ });
  };

  const commitSnapshots = snapshots.filter((s) => s.commitHash);
  const tsSnapshots = snapshots.filter((s) => !s.commitHash);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Camera className="size-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Context Snapshots</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Roll back your code <em>and</em> Claude context together.
            </p>
          </div>
          <button
            onClick={fetchSnapshots}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>

        {/* Setup tip */}
        <div className="text-xs text-muted-foreground bg-muted/40 border border-border/50 rounded-lg p-3 font-mono space-y-1">
          <p className="text-muted-foreground/70"># Auto-snapshot on every git commit:</p>
          <p>claudedash hooks install --git</p>
          <p className="text-muted-foreground/70 pt-1"># Manual snapshot:</p>
          <p>claudedash snapshot --commit</p>
        </div>

        {loading && <div className="flex-1" />}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            {error}
          </div>
        )}

        {!loading && !error && snapshots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground/40">
            <Camera className="size-10 opacity-20" />
            <p className="text-sm">No snapshots yet</p>
            <TypingPrompt
              lines={[
                "claudedash hooks install --git",
                "claudedash snapshot --commit",
              ]}
            />
          </div>
        )}

        {/* Commit snapshots */}
        {commitSnapshots.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <GitCommit className="size-3.5 text-chart-4" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Commit Snapshots
              </h3>
              <span className="text-xs text-muted-foreground/50 bg-muted/60 px-1.5 rounded-full">
                {commitSnapshots.length}
              </span>
            </div>
            <div className="space-y-2">
              {commitSnapshots.map((s) => (
                <SnapshotRow key={s.filename} entry={s} onDelete={handleDelete} />
              ))}
            </div>
          </section>
        )}

        {/* Timestamp snapshots */}
        {tsSnapshots.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 text-muted-foreground/60" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Manual Snapshots
              </h3>
              <span className="text-xs text-muted-foreground/50 bg-muted/60 px-1.5 rounded-full">
                {tsSnapshots.length}
              </span>
            </div>
            <div className="space-y-2">
              {tsSnapshots.map((s) => (
                <SnapshotRow key={s.filename} entry={s} onDelete={handleDelete} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
