import { useState, useEffect, useCallback } from "react";
import type { SnapshotResponse } from "@/types";

export function usePlanSnapshot() {
  const [data, setData] = useState<SnapshotResponse | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await fetch("/snapshot");
      if (!response.ok) return;
      const result: SnapshotResponse = await response.json();
      setData(result);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const es = new EventSource("/events/");
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "plan") fetchSnapshot();
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, [fetchSnapshot]);

  return { data, refresh: fetchSnapshot };
}
