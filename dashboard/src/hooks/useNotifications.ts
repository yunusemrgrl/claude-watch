"use client";

import { useEffect, useRef, useState } from "react";
import type { ClaudeTask, ComputedTask, SessionsResponse, SnapshotResponse } from "@/types";

function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

const BASE_TITLE = "claudedash";

function updateTabTitle(activeCount: number, failedCount: number) {
  if (typeof document === "undefined") return;
  if (failedCount > 0) {
    document.title = `[⚠ ${failedCount} failed] ${BASE_TITLE}`;
  } else if (activeCount > 0) {
    document.title = `[${activeCount} active] ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
}

function diffLiveTasks(
  prev: Map<string, string>,
  tasks: ClaudeTask[],
): Array<{ subject: string; status: string }> {
  const changes: Array<{ subject: string; status: string }> = [];
  for (const task of tasks) {
    const prevStatus = prev.get(task.id);
    if (prevStatus && prevStatus !== task.status && task.status === "completed") {
      changes.push({ subject: task.subject, status: task.status });
    }
  }
  return changes;
}

function diffPlanTasks(
  prev: Map<string, string>,
  tasks: ComputedTask[],
): Array<{ id: string; description: string; status: string }> {
  const changes: Array<{ id: string; description: string; status: string }> = [];
  for (const task of tasks) {
    const prevStatus = prev.get(task.id);
    if (prevStatus && prevStatus !== task.status) {
      if (task.status === "DONE" || task.status === "FAILED" || task.status === "BLOCKED") {
        changes.push({ id: task.id, description: task.description, status: task.status });
      }
    }
  }
  return changes;
}

export function useNotifications() {
  const [showDeniedBanner, setShowDeniedBanner] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const prevLiveMap = useRef<Map<string, string>>(new Map());
  const prevPlanMap = useRef<Map<string, string>>(new Map());
  const initializedLive = useRef(false);
  const initializedPlan = useRef(false);
  // Track already-notified task+status pairs to prevent spam
  const notifiedSet = useRef<Set<string>>(new Set());

  // Request permission once on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "denied") {
      setShowDeniedBanner(true);
      return;
    }
    if (Notification.permission === "default") {
      void Notification.requestPermission().then((perm) => {
        if (perm === "denied") setShowDeniedBanner(true);
      });
    }
  }, []);

  // SSE listener for task changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const es = new EventSource("/events/");
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as { type: string };

        if (parsed.type === "sessions") {
          void fetch("/sessions")
            .then((r) => r.json())
            .then((data: SessionsResponse) => {
              const allTasks = data.sessions.flatMap((s) => s.tasks);

              if (initializedLive.current) {
                const changes = diffLiveTasks(prevLiveMap.current, allTasks);
                for (const change of changes) {
                  const key = `live:${change.subject}:${change.status}`;
                  if (!notifiedSet.current.has(key)) {
                    notifiedSet.current.add(key);
                    notify("Task completed ✓", change.subject);
                  }
                }
              }

              const activeCount = allTasks.filter((t) => t.status === "in_progress").length;
              updateTabTitle(activeCount, 0);

              const newMap = new Map<string, string>();
              for (const task of allTasks) newMap.set(task.id, task.status);
              prevLiveMap.current = newMap;
              initializedLive.current = true;
            });
        }

        if (parsed.type === "plan") {
          void fetch("/snapshot")
            .then((r) => r.json())
            .then((data: SnapshotResponse) => {
              const tasks = data.snapshot?.tasks ?? [];

              if (initializedPlan.current) {
                const changes = diffPlanTasks(prevPlanMap.current, tasks);
                for (const change of changes) {
                  const key = `plan:${change.id}:${change.status}`;
                  if (notifiedSet.current.has(key)) continue;
                  notifiedSet.current.add(key);
                  if (change.status === "DONE") {
                    notify("Plan task done ✓", `${change.id}: ${change.description}`);
                  } else if (change.status === "FAILED") {
                    notify("Task failed ✗", `${change.id}: ${change.description}`);
                  } else if (change.status === "BLOCKED") {
                    notify("Task blocked ⚠", `${change.id}: ${change.description}`);
                  }
                }
              }

              const failedCount = data.snapshot?.summary.failed ?? 0;
              const activeCount = data.snapshot?.summary.ready ?? 0;
              updateTabTitle(activeCount, failedCount);

              const newMap = new Map<string, string>();
              for (const task of tasks) newMap.set(task.id, task.status);
              prevPlanMap.current = newMap;
              initializedPlan.current = true;
            });
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, []);

  return {
    showDeniedBanner,
    dismissDeniedBanner: () => setShowDeniedBanner(false),
    sseConnected,
  };
}
