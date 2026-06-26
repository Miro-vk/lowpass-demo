import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import type { DigestRun } from "../types";

const HISTORY_KEY = "lowpass_history";
const MAX_ENTRIES = 10;

type HistoryContextType = {
  history: DigestRun[];
  addRun: (run: DigestRun) => void;
  clearHistory: () => void;
};

const HistoryContext = createContext<HistoryContextType>({
  history: [],
  addRun: () => {},
  clearHistory: () => {},
});

function deleteAudio(path?: string) {
  if (path) FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
}

function persist(runs: DigestRun[]) {
  AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(runs)).catch(() => {});
}

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<DigestRun[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed: DigestRun[] = JSON.parse(raw).map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp),
        }));
        setHistory(parsed);
      } catch {}
    });
  }, []);

  function addRun(run: DigestRun) {
    setHistory((prev) => {
      const next = [run, ...prev];
      // Delete audio files for entries that get evicted
      next.slice(MAX_ENTRIES).forEach((e) => deleteAudio(e.audioPath));
      const capped = next.slice(0, MAX_ENTRIES);
      persist(capped);
      return capped;
    });
  }

  function clearHistory() {
    setHistory((prev) => {
      prev.forEach((e) => deleteAudio(e.audioPath));
      persist([]);
      return [];
    });
  }

  return (
    <HistoryContext.Provider value={{ history, addRun, clearHistory }}>
      {children}
    </HistoryContext.Provider>
  );
}

export const useHistory = () => useContext(HistoryContext);
