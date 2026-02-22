"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Lightbulb, Brain, RefreshCw } from "lucide-react";
import { TypingPrompt } from "@/components/TypingPrompt";

// Injected into the raw HTML report to apply the dashboard's dark theme
const DARK_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: dark; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: #18181b;
  color: #e4e4e7;
  margin: 0 auto;
  padding: 2rem 2.5rem;
  line-height: 1.7;
  font-size: 14px;
  max-width: 920px;
}
h1 { font-size: 1.5rem; font-weight: 700; color: #fafafa; margin: 0 0 0.5rem; line-height: 1.3; }
h2 { font-size: 1.125rem; font-weight: 600; color: #fafafa; margin: 2rem 0 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #3f3f46; }
h3 { font-size: 1rem; font-weight: 600; color: #e4e4e7; margin: 1.5rem 0 0.5rem; }
h4, h5, h6 { font-size: 0.75rem; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin: 1rem 0 0.25rem; }
p { margin: 0.5rem 0; }
a { color: #818cf8; text-decoration: none; }
a:hover { color: #a5b4fc; text-decoration: underline; }
strong, b { color: #fafafa; font-weight: 600; }
em, i { color: #d4d4d8; }
code {
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
  background: #27272a;
  padding: 0.15em 0.4em;
  border-radius: 3px;
  font-size: 0.85em;
  color: #e4e4e7;
}
pre {
  background: #27272a;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  margin: 1rem 0;
}
pre code { background: none; padding: 0; }
ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
li { margin: 0.3rem 0; }
hr { border: none; border-top: 1px solid #3f3f46; margin: 2rem 0; }
blockquote {
  border-left: 3px solid #818cf8;
  margin: 1rem 0;
  padding: 0.5rem 1rem;
  color: #a1a1aa;
  background: #27272a;
  border-radius: 0 4px 4px 0;
}
table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #52525b;
  color: #a1a1aa;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #3f3f46; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #27272a; }
img { max-width: 100%; border-radius: 6px; }
`;

function injectTheme(html: string): string {
  const styleTag = `<style>${DARK_CSS}</style>`;
  if (html.includes("</head>")) return html.replace("</head>", `${styleTag}</head>`);
  if (html.includes("<body")) return html.replace("<body", `${styleTag}<body`);
  return styleTag + html;
}

export function InsightsView() {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [reportError, setReportError] = useState(false);
  const [checking, setChecking] = useState(true);

  const loadReport = () => {
    setChecking(true);
    setReportError(false);
    setSrcDoc(null);
    fetch("/claude-insights")
      .then((res) => {
        if (!res.ok) { setReportError(true); return null; }
        const ct = res.headers.get("content-type");
        if (ct?.includes("application/json")) { setReportError(true); return null; }
        return res.text();
      })
      .then((html) => {
        if (html) setSrcDoc(injectTheme(html));
      })
      .catch(() => setReportError(true))
      .finally(() => setChecking(false));
  };

  useEffect(() => { loadReport(); }, []);

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Lightbulb className="size-10 mx-auto mb-3 text-muted-foreground animate-pulse" />
          <p className="text-xs text-muted-foreground">Loading insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-4 py-2 border-b border-border bg-sidebar/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Lightbulb className="size-4 text-chart-3" />
          <span className="text-sm font-medium">Claude Code Insights</span>
          <span className="text-xs text-muted-foreground">
            Usage analytics from /insight command
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadReport}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            title="Refresh report"
          >
            <RefreshCw className="size-3" />
            Refresh
          </button>
          <Link
            href="/claude-insights"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Open in new tab →
          </Link>
        </div>
      </div>

      {/* Report or empty state */}
      {reportError ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-lg w-full">
            <Lightbulb className="size-12 mx-auto mb-5 text-muted-foreground" />
            <TypingPrompt
              lines={[
                "Unlock deep insights into your Claude Code usage...",
                "Discover what's working, what's slowing you down...",
                "See your most-used tools, friction points, and wins...",
                "Get personalized CLAUDE.md suggestions...",
                "Open Claude Code and run: /insight",
              ]}
            />
            <div className="mt-6 bg-muted/50 border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Brain className="size-4" />
                How to generate your report:
              </h3>
              <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Open a Claude Code session in your terminal</li>
                <li>
                  Type{" "}
                  <code className="bg-background px-1.5 py-0.5 rounded font-mono text-foreground">
                    /insight
                  </code>{" "}
                  and press Enter
                </li>
                <li>Wait 10–30 seconds while Claude analyzes your usage</li>
                <li>
                  Click{" "}
                  <button
                    onClick={loadReport}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <RefreshCw className="size-3" />
                    Refresh
                  </button>{" "}
                  above to view your report
                </li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <iframe
          srcDoc={srcDoc ?? ""}
          sandbox="allow-scripts allow-same-origin"
          className="flex-1 w-full border-0 bg-[#18181b]"
          title="Claude Code Insights Report"
        />
      )}
    </div>
  );
}
