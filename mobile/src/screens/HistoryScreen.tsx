import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHistory } from "../context/HistoryContext";
import { useTheme, Colors } from "../context/ThemeContext";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function HistoryScreen() {
  const { history, clearHistory } = useHistory();
  const { C } = useTheme();
  const S = makeStyles(C);

  return (
    <SafeAreaView style={S.safe} edges={["top"]}>
      <View style={S.header}>
        <Text style={S.title}>HISTORY</Text>
        {history.length > 0 && (
          <TouchableOpacity onPress={clearHistory}>
            <Text style={S.clearBtn}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {history.length === 0 ? (
          <View style={S.empty}>
            <Text style={S.emptyTitle}>NO HISTORY YET</Text>
            <Text style={S.emptyHint}>Generate a podcast on the Search tab to get started.</Text>
          </View>
        ) : (
          history.map((run) => (
            <View key={run.id} style={S.runCard}>
              <Text style={S.runTopic}>{run.topic}</Text>
              <Text style={S.runMeta}>{formatDate(run.timestamp)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: 2, borderBottomColor: C.border,
    },
    title: { fontSize: 18, fontWeight: "900", color: C.text, letterSpacing: 3 },
    clearBtn: { fontSize: 11, fontWeight: "700", color: C.muted, letterSpacing: 1 },

    content: { padding: 20, paddingBottom: 60 },

    runCard: {
      borderWidth: 2, borderColor: C.border, backgroundColor: C.card,
      padding: 14, marginBottom: 10,
      shadowColor: C.text, shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1, shadowRadius: 0, elevation: 4,
    },
    runTopic: { fontSize: 15, fontWeight: "800", color: C.text, marginBottom: 4 },
    runMeta: { fontSize: 12, color: C.muted },

    empty: { alignItems: "center", paddingTop: 80 },
    emptyTitle: { fontSize: 16, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 8 },
    emptyHint: { fontSize: 13, color: C.muted, textAlign: "center" },
  });
}
