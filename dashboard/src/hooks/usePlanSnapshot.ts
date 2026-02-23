import { useState, useEffect, useCallback } from "react";
import type { SnapshotResponse } from "@/types";
import { useSSEEvents } from "./useSSEEvents";

// Module-level store — updated after every successful fetch so useNotifications
// can read the latest snapshot without its own duplicate /snapshot request.
let _latestSnapshot: SnapshotResponse | null = null;
export function getLatestSnapshot(): SnapshotResponse | null { return _latestSnapshot; }

export function usePlanSnapshot() {
  const [data, setData] = useState<SnapshotResponse | null>(() => _latestSnapshot);
  const [loading, setLoading] = useState(() => _latestSnapshot === null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await fetch("/snapshot");
      if (!response.ok) return;
      const result: SnapshotResponse = await response.json();
      _latestSnapshot = result;
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useSSEEvents((data) => {
    if (data.type === "plan") void fetchSnapshot();
  });

  return { data, loading, refresh: fetchSnapshot };
}
