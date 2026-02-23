"use client";

import { useEffect, useRef, useState } from "react";
import type { ClaudeSession, ComputedTask } from "@/types";
import { useSSEEvents, useSSEConnected } from "./useSSEEvents";
import { getLatestSessions } from "./useSessions";
import { getLatestSnapshot } from "./usePlanSnapshot";

function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

const BASE_TITLE = "claudedash";

function updateTabTitle(blockedCount: number, failedCount: number) {
  if (typeof document === "undefined") return;
  if (failedCount > 0) {
    document.title = `[⚠ ${failedCount} failed] ${BASE_TITLE}`;
  } else if (blockedCount > 0) {
    document.title = `[⚠ ${blockedCount} blocked] ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
}

function diffLiveTasks(
  prev: Map<string, string>,
  sessions: ClaudeSession[],
): Array<{ subject: string; project: string | null }> {
  const changes: Array<{ subject: string; project: string | null }> = [];
  for (const session of sessions) {
    for (const task of session.tasks) {
      const key = `${session.id}:${task.id}`;
      const prevStatus = prev.get(key);
      if (prevStatus && prevStatus !== task.status && task.status === "completed") {
        changes.push({ subject: task.subject, project: session.projectName ?? null });
      }
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
  const sseConnected = useSSEConnected();
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

  useSSEEvents((event) => {
    if (event.type === "sessions") {
      // Read from module-level store updated by useSessions — no duplicate fetch
      const sessionList = getLatestSessions();

      if (initializedLive.current) {
        const changes = diffLiveTasks(prevLiveMap.current, sessionList);
        for (const change of changes) {
          const key = `live:${change.subject}`;
          if (!notifiedSet.current.has(key)) {
            notifiedSet.current.add(key);
            const body = change.project
              ? `${change.subject}\n${change.project}`
              : change.subject;
            notify("Task completed ✓", body);
          }
        }
      }

      updateTabTitle(0, 0);

      const newMap = new Map<string, string>();
      for (const session of sessionList) {
        for (const task of session.tasks) newMap.set(`${session.id}:${task.id}`, task.status);
      }
      prevLiveMap.current = newMap;
      initializedLive.current = true;
    }

    if (event.type === "task-blocked") {
      const ev = event as { type: string; task_id?: string; reason?: string; agent?: string };
      const key = `blocked:${ev.task_id}:${ev.reason ?? ""}`;
      if (!notifiedSet.current.has(key)) {
        notifiedSet.current.add(key);
        const title = `Task BLOCKED: ${ev.task_id ?? "?"}`;
        const body = ev.reason ? `${ev.reason}` : `Reported by ${ev.agent ?? "agent"}`;
        notify(title, body);
      }
    }

    if (event.type === "plan") {
      // Read from module-level store updated by usePlanSnapshot — no duplicate fetch
      const snapshotData = getLatestSnapshot();
      const tasks = snapshotData?.snapshot?.tasks ?? [];

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

      const failedCount = snapshotData?.snapshot?.summary.failed ?? 0;
      const blockedCount = snapshotData?.snapshot?.summary.blocked ?? 0;
      updateTabTitle(blockedCount, failedCount);

      const newMap = new Map<string, string>();
      for (const task of tasks) newMap.set(task.id, task.status);
      prevPlanMap.current = newMap;
      initializedPlan.current = true;
    }
  });

  return {
    showDeniedBanner,
    dismissDeniedBanner: () => setShowDeniedBanner(false),
    sseConnected,
  };
}
