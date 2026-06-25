import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api";

const TOKEN_KEY = "lowpass_token";
const REFRESH_KEY = "lowpass_refresh_token";

type AuthContextType = {
  token: string | null;
  loading: boolean;
  setToken: (token: string | null, refreshToken?: string | null) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  token: null,
  loading: true,
  setToken: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const stored = await AsyncStorage.getItem(TOKEN_KEY);
      const storedRefresh = await AsyncStorage.getItem(REFRESH_KEY);

      if (storedRefresh) {
        try {
          const data = await api.refreshToken(storedRefresh);
          setTokenState(data.access_token);
          await AsyncStorage.setItem(TOKEN_KEY, data.access_token);
          await AsyncStorage.setItem(REFRESH_KEY, data.refresh_token);
        } catch {
          setTokenState(stored);
        }
      } else {
        setTokenState(stored);
      }
      setLoading(false);
    }
    init();
  }, []);

  async function setToken(t: string | null, refreshToken?: string | null) {
    setTokenState(t);
    if (t) {
      await AsyncStorage.setItem(TOKEN_KEY, t);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
    if (refreshToken != null) {
      if (refreshToken) {
        await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
      } else {
        await AsyncStorage.removeItem(REFRESH_KEY);
      }
    }
  }

  async function logout() {
    await setToken(null, null);
  }

  return (
    <AuthContext.Provider value={{ token, loading, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
