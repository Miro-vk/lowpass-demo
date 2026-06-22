import React, { createContext, useContext, useState } from "react";

type AuthContextType = {
  token: string | null;
  setToken: (token: string | null) => void;
};

const AuthContext = createContext<AuthContextType>({
  token: null,
  setToken: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>("dev-bypass");
  return (
    <AuthContext.Provider value={{ token, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
