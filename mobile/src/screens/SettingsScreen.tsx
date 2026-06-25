import { View, Text, TouchableOpacity, StyleSheet, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useVoice } from "../context/VoiceContext";
import LowpassIcon from "../components/LowpassIcon";

export default function SettingsScreen() {
  const { logout } = useAuth();
  const { isDark, toggleTheme, C } = useTheme();
  const { gender, toggleVoice } = useVoice();
  const S = makeStyles(C);

  return (
    <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
      <View style={S.header}>
        <Text style={S.title}>SETTINGS</Text>
      </View>

      <View style={S.body}>

        <View style={S.logoRow}>
          <LowpassIcon size={52} isDark={isDark} />
          <Text style={S.logoText}>LOWPASS</Text>
        </View>

        <View style={S.section}>
          <Text style={S.sectionLabel}>APPEARANCE</Text>

          <View style={S.row}>
            <View>
              <Text style={S.rowLabel}>DARK MODE</Text>
              <Text style={S.rowSub}>{isDark ? "Dark" : "Light"}</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: "#ccc", true: C.text }}
              thumbColor={C.card}
            />
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionLabel}>PODCAST VOICE</Text>

          <View style={S.row}>
            <Text style={S.rowLabel}>{gender === "female" ? "FEMALE VOICE" : "MALE VOICE"}</Text>
            <Switch
              value={gender === "female"}
              onValueChange={toggleVoice}
              trackColor={{ false: "#ccc", true: C.text }}
              thumbColor={C.card}
            />
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionLabel}>ACCOUNT</Text>

          <TouchableOpacity style={S.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <Text style={S.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof import("../context/ThemeContext").useTheme>["C"]) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    header: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 2,
      borderBottomColor: C.border,
    },
    title: { fontSize: 18, fontWeight: "900", color: C.text, letterSpacing: 3 },

    body: { flex: 1, paddingHorizontal: 20, paddingTop: 32 },

    logoRow: {
      flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 40,
    },
    logoText: { fontSize: 24, fontWeight: "900", color: C.text, letterSpacing: 5 },

    section: { marginBottom: 36 },
    sectionLabel: {
      fontSize: 10, fontWeight: "900", color: C.muted,
      letterSpacing: 2, marginBottom: 14,
    },

    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      borderTopWidth: 2,
      borderBottomWidth: 2,
      borderColor: C.border,
    },
    rowLabel: { fontSize: 13, fontWeight: "900", color: C.text, letterSpacing: 1 },
    rowSub: { fontSize: 11, color: C.muted, marginTop: 2 },

    logoutBtn: {
      borderWidth: 2,
      borderColor: C.border,
      padding: 16,
      alignItems: "center",
      shadowColor: C.text,
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 4,
      backgroundColor: C.card,
    },
    logoutText: { fontSize: 13, fontWeight: "900", color: C.text, letterSpacing: 2 },
  });
}
