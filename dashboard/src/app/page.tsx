"use client";

import { useState, useEffect } from "react";
import {
  Search,
  RefreshCw,
  Radio,
  ClipboardList,
  BarChart3,
  GitBranch,
  PanelLeft,
  PanelLeftClose,
  type LucideIcon,
} from "lucide-react";
import type { HealthResponse } from "@/types";
import { WorktreePanel } from "@/components/WorktreePanel";
import { LiveView } from "@/views/LiveView";
import { PlanView } from "@/views/PlanView";
import { InsightsView } from "@/views/InsightsView";
import { useNotifications } from "@/hooks/useNotifications";
type ViewMode = "live" | "plan" | "insights" | "worktrees";

export default function Dashboard() {
  const [mode, setMode] = useState<ViewMode>("live");
  const [availableModes, setAvailableModes] = useState({ live: false, plan: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { showDeniedBanner, dismissDeniedBanner } = useNotifications();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => {
        setAvailableModes(data.modes);
        if (data.modes.live) setMode("live");
        else if (data.modes.plan) setMode("plan");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to connect to server");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-destructive-foreground">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Notification permission denied banner */}
      {showDeniedBanner && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center justify-between text-xs text-destructive shrink-0">
          <span>
            Browser notifications are blocked. Enable them in your browser settings to get alerts when tasks fail or complete.
          </span>
          <button
            onClick={dismissDeniedBanner}
            className="ml-4 text-destructive/70 hover:text-destructive font-medium shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Top Bar */}
      <div className="bg-sidebar border-b border-sidebar-border px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-foreground">claudedash</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              v0.5.4
            </span>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(
              [
                { id: "live", icon: Radio, label: "Live", show: availableModes.live },
                { id: "plan", icon: ClipboardList, label: "Plan", show: availableModes.plan },
                { id: "insights", icon: BarChart3, label: "Insights", show: availableModes.live || availableModes.plan },
                { id: "worktrees", icon: GitBranch, label: "Worktrees", show: availableModes.live || availableModes.plan },
              ] as { id: ViewMode; icon: LucideIcon; label: string; show: boolean }[]
            )
              .filter((m) => m.show)
              .map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                    mode === id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3" />
                  {label}
                </button>
              ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring w-48"
            />
          </div>
          <button
            className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {mode === "live" ? (
          <LiveView searchQuery={searchQuery} sidebarCollapsed={sidebarCollapsed} mounted={mounted} />
        ) : mode === "plan" ? (
          <PlanView searchQuery={searchQuery} sidebarCollapsed={sidebarCollapsed} mounted={mounted} />
        ) : mode === "worktrees" ? (
          <WorktreePanel />
        ) : (
          <InsightsView />
        )}
      </div>
    </div>
  );
}
