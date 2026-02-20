"use client";

import { useState, useEffect, useRef } from "react";
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  GitCommit,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypingPrompt } from "@/components/TypingPrompt";
import type { WorktreeState } from "@/types";

interface WorktreesResponse {
  worktrees: WorktreeState[];
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

// ── Left: Worktree card ───────────────────────────────────────────────────────
function WorktreeCard({
  wt,
  selected,
  onClick,
}: {
  wt: WorktreeState;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        selected
          ? "bg-accent border-ring"
          : "bg-card border-border hover:bg-accent/50"
      }`}
    >
      {/* Branch name — prominent */}
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="size-3.5 text-chart-4 shrink-0" />
        <span className="text-sm font-semibold text-foreground truncate font-mono">
          {wt.branch}
        </span>
      </div>

      {/* Path */}
      <div className="text-[11px] text-muted-foreground/60 font-mono truncate mb-2">
        {wt.path}
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Dirty / Clean */}
        {wt.dirty ? (
          <span className="flex items-center gap-1 text-[11px] text-chart-3 bg-chart-3/10 px-1.5 py-0.5 rounded">
            <AlertCircle className="size-2.5" />
            dirty
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-chart-2 bg-chart-2/10 px-1.5 py-0.5 rounded">
            <CheckCircle className="size-2.5" />
            clean
          </span>
        )}

        {/* Ahead / Behind */}
        {wt.aheadCount > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] text-chart-2">
            <ArrowUp className="size-2.5" />
            {wt.aheadCount}
          </span>
        )}
        {wt.behindCount > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] text-chart-5">
            <ArrowDown className="size-2.5" />
            {wt.behindCount}
          </span>
        )}
        {wt.aheadCount === 0 && wt.behindCount === 0 && (
          <span className="text-[11px] text-muted-foreground/40">synced</span>
        )}

        {/* Task count */}
        {(wt.associatedTasks?.length ?? 0) > 0 && (
          <span className="ml-auto text-[11px] bg-chart-4/20 text-chart-4 px-1.5 py-0.5 rounded">
            {wt.associatedTasks!.length} task{wt.associatedTasks!.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Right: Detail panel ───────────────────────────────────────────────────────
function WorktreeDetail({ wt }: { wt: WorktreeState }) {
  return (
    <div className="h-full flex flex-col">
      {/* Detail header */}
      <div className="px-5 py-4 border-b border-border bg-sidebar/40 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="size-4 text-chart-4" />
          <span className="text-base font-semibold text-foreground font-mono">{wt.branch}</span>
        </div>
        <div className="text-xs text-muted-foreground/60 font-mono">{wt.path}</div>

        {/* Status row */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {wt.dirty ? (
            <span className="flex items-center gap-1 text-xs text-chart-3 bg-chart-3/10 px-2 py-0.5 rounded-full border border-chart-3/20">
              <AlertCircle className="size-3" />
              Uncommitted changes
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-chart-2 bg-chart-2/10 px-2 py-0.5 rounded-full border border-chart-2/20">
              <CheckCircle className="size-3" />
              Working tree clean
            </span>
          )}
          {wt.aheadCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-chart-2">
              <ArrowUp className="size-3" />
              {wt.aheadCount} ahead
            </span>
          )}
          {wt.behindCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-chart-5">
              <ArrowDown className="size-3" />
              {wt.behindCount} behind
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          {/* HEAD commit */}
          {wt.head && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">HEAD Commit</h4>
              <div className="flex items-center gap-2 bg-card border border-border rounded px-3 py-2">
                <GitCommit className="size-3.5 text-chart-4 shrink-0" />
                <code className="text-xs text-chart-4 font-mono">{wt.head.slice(0, 12)}</code>
                <span className="text-xs text-muted-foreground font-mono">{wt.head}</span>
              </div>
            </div>
          )}

          {/* Full path */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Full Path</h4>
            <div className="bg-card border border-border rounded px-3 py-2">
              <code className="text-xs text-muted-foreground font-mono break-all">{wt.path}</code>
            </div>
          </div>

          {/* Associated tasks */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Associated Tasks
              {(wt.associatedTasks?.length ?? 0) > 0 && (
                <span className="ml-1.5 text-muted-foreground/40 normal-case">({wt.associatedTasks!.length})</span>
              )}
            </h4>
            {(wt.associatedTasks?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground/40 py-2">No tasks associated with this worktree</p>
            ) : (
              <div className="space-y-2">
                {wt.associatedTasks!.map((t, i) => (
                  <div
                    key={`${t.sessionId}-${t.taskId}-${i}`}
                    className="flex items-center gap-2 p-3 rounded bg-card border border-border"
                  >
                    <span className="font-mono text-xs text-muted-foreground shrink-0">#{t.taskId}</span>
                    <span className="text-xs text-foreground truncate flex-1">{t.taskSubject}</span>
                    <span className="text-[10px] text-muted-foreground/40 font-mono shrink-0">
                      {t.sessionId.slice(0, 8)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main WorktreePanel ────────────────────────────────────────────────────────
export function WorktreePanel() {
  const [worktrees, setWorktrees] = useState<WorktreeState[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedWt, setSelectedWt] = useState<WorktreeState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWorktrees = async () => {
    try {
      const res = await fetch("/worktrees");
      if (!res.ok) return;
      const data: WorktreesResponse = await res.json();
      const wts = data.worktrees ?? [];
      setWorktrees(wts);
      setLastRefresh(new Date());
      // Keep selected in sync
      setSelectedWt((prev) => {
        if (!prev) return wts[0] ?? null;
        return wts.find((w) => w.path === prev.path) ?? wts[0] ?? null;
      });
    } catch {
      /* degrade gracefully */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWorktrees();
    timerRef.current = setInterval(fetchWorktrees, 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-sidebar border-b border-sidebar-border px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Git Worktrees
          </span>
          {worktrees.length > 0 && (
            <span className="text-xs text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
              {worktrees.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-muted-foreground/40">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchWorktrees}
            className="p-1 rounded hover:bg-sidebar-accent transition-colors"
            title="Refresh worktrees"
          >
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground/40 text-xs">
          Loading...
        </div>
      ) : worktrees.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <TypingPrompt
            lines={[
              "No git worktrees detected",
              "git worktree add ../my-project-feat feature/xyz",
              "Run agents in parallel across branches",
              "Each worktree gets its own task list here",
            ]}
          />
        </div>
      ) : (
        /* 2-column grid layout */
        <div className="flex-1 flex overflow-hidden">
          {/* Left: card list */}
          <div className="w-72 min-w-[240px] border-r border-border flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {worktrees.map((wt) => (
                  <WorktreeCard
                    key={wt.path}
                    wt={wt}
                    selected={selectedWt?.path === wt.path}
                    onClick={() => setSelectedWt(wt)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right: detail */}
          <div className="flex-1 overflow-hidden">
            {selectedWt ? (
              <WorktreeDetail wt={selectedWt} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground/40 text-xs">
                Select a worktree to see details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
