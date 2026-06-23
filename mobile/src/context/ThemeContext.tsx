import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "lowpass_theme";

export const LIGHT = {
  bg: "#F5F4EF",
  card: "#FFFFFF",
  text: "#0A0A0A",
  muted: "#888",
  border: "#0A0A0A",
};

export const DARK = {
  bg: "#0A0A0A",
  card: "#1A1A1A",
  text: "#F5F4EF",
  muted: "#666",
  border: "#F5F4EF",
};

export type Colors = typeof LIGHT;

type ThemeContextType = {
  isDark: boolean;
  toggleTheme: () => void;
  C: Colors;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleTheme: () => {},
  C: LIGHT,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v === "dark") setIsDark(true);
    });
  }, []);

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? "dark" : "light");
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, C: isDark ? DARK : LIGHT }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
