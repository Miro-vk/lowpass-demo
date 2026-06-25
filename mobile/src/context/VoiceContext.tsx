import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VOICE_KEY = "lowpass_voice";

export type VoiceGender = "male" | "female";

const VOICE_NAMES: Record<VoiceGender, string> = {
  male: "en-US-Chirp3-HD-Charon",
  female: "en-US-Chirp3-HD-Aoede",
};

type VoiceContextType = {
  gender: VoiceGender;
  toggleVoice: () => void;
  voiceName: string;
};

const VoiceContext = createContext<VoiceContextType>({
  gender: "male",
  toggleVoice: () => {},
  voiceName: VOICE_NAMES.male,
});

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [gender, setGender] = useState<VoiceGender>("male");

  useEffect(() => {
    AsyncStorage.getItem(VOICE_KEY).then((v) => {
      if (v === "female") setGender("female");
    });
  }, []);

  function toggleVoice() {
    setGender((prev) => {
      const next: VoiceGender = prev === "male" ? "female" : "male";
      AsyncStorage.setItem(VOICE_KEY, next);
      return next;
    });
  }

  return (
    <VoiceContext.Provider value={{ gender, toggleVoice, voiceName: VOICE_NAMES[gender] }}>
      {children}
    </VoiceContext.Provider>
  );
}

export const useVoice = () => useContext(VoiceContext);
