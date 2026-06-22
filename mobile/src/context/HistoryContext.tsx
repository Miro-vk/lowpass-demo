import React, { createContext, useContext, useState } from "react";
import type { DigestRun } from "../types";

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

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<DigestRun[]>([]);

  function addRun(run: DigestRun) {
    setHistory((prev) => [run, ...prev]);
  }

  function clearHistory() {
    setHistory([]);
  }

  return (
    <HistoryContext.Provider value={{ history, addRun, clearHistory }}>
      {children}
    </HistoryContext.Provider>
  );
}

export const useHistory = () => useContext(HistoryContext);
