"use client";

import { useState, useEffect } from "react";
import { BarChart3, Brain, RefreshCw } from "lucide-react";
import { TypingPrompt } from "@/components/TypingPrompt";

export function InsightsView() {
  const [reportError, setReportError] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if report exists before rendering iframe
  useEffect(() => {
    fetch("/claude-insights")
      .then((res) => {
        if (!res.ok) {
          setReportError(true);
        } else {
          // Check if response is HTML or JSON
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            setReportError(true);
          }
        }
      })
      .catch(() => setReportError(true))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="size-16 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Minimal Top Bar */}
      <div className="px-4 py-2 border-b border-border bg-sidebar/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Brain className="size-4 text-primary" />
          <span className="text-sm font-medium">Claude Code Insights</span>
          <span className="text-xs text-muted-foreground">
            Usage analytics from /insight command
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            title="Refresh insights"
          >
            <RefreshCw className="size-3" />
            Refresh
          </button>
          <a
            href="/claude-insights"
            target="_blank"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Open in new tab →
          </a>
        </div>
      </div>

      {/* Report Content */}
      {reportError ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-2xl">
            <BarChart3 className="size-16 mx-auto mb-6 text-muted-foreground" />
            <TypingPrompt
              lines={[
                "Unlock deep insights into your Claude Code usage...",
                "Discover what's working, what's slowing you down...",
                "See your most-used tools, friction points, and wins...",
                "Get personalized CLAUDE.md suggestions...",
                "Learn about features you haven't tried yet...",
                "Open Claude Code and run: /insight",
              ]}
            />
            <div className="mt-8 bg-muted/50 border border-border rounded-lg p-6">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Brain className="size-4" />
                How to generate your insights:
              </h3>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Open your terminal with an active Claude Code session</li>
                <li>
                  Type{" "}
                  <code className="bg-background px-2 py-0.5 rounded text-xs font-mono text-foreground">
                    /insight
                  </code>{" "}
                  and press Enter
                </li>
                <li>
                  Wait 10-30 seconds while Claude analyzes your usage patterns
                </li>
                <li>
                  Click{" "}
                  <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <RefreshCw className="size-3" />
                    Refresh
                  </button>{" "}
                  to see your report
                </li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <iframe
          src="/claude-insights"
          className="flex-1 w-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title="Claude Code Insights Report"
        />
      )}
    </div>
  );
}
