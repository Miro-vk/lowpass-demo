import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHistory } from "../context/HistoryContext";
import { useTheme, Colors } from "../context/ThemeContext";
import type { DigestRun } from "../types";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function RunCard({ run, C }: { run: DigestRun; C: Colors }) {
  const [open, setOpen] = useState(false);
  const S = makeStyles(C);

  return (
    <View style={S.runCard}>
      <TouchableOpacity style={S.runHeader} onPress={() => setOpen((o) => !o)} activeOpacity={0.8}>
        <View style={S.runHeaderLeft}>
          <Text style={S.runTopic}>{run.topic}</Text>
          <Text style={S.runMeta}>
            {run.results[0]?.clusters.length ?? 0} clusters · {formatDate(run.timestamp)}
          </Text>
        </View>
        <Text style={S.chevron}>{open ? "↑" : "↓"}</Text>
      </TouchableOpacity>

      {open && (
        <View style={S.runBody}>
          {run.results.map((result) =>
            result.clusters.map((cluster) => (
              <TouchableOpacity
                key={cluster.rank}
                style={S.clusterRow}
                onPress={() => Linking.openURL(cluster.url)}
                activeOpacity={0.75}
              >
                <View style={S.clusterDot} />
                <View style={{ flex: 1 }}>
                  <Text style={S.clusterTitle} numberOfLines={2}>{cluster.title}</Text>
                  <Text style={S.clusterSources}>{cluster.sources.join(" · ")}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
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
            <Text style={S.emptyHint}>Run a digest on the Search tab to get started.</Text>
          </View>
        ) : (
          history.map((run) => <RunCard key={run.id} run={run} C={C} />)
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
      marginBottom: 10,
      shadowColor: C.text, shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1, shadowRadius: 0, elevation: 4,
    },
    runHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
    runHeaderLeft: { flex: 1 },
    runTopic: { fontSize: 15, fontWeight: "800", color: C.text, marginBottom: 3 },
    runMeta: { fontSize: 12, color: C.muted },
    chevron: { fontSize: 16, fontWeight: "700", color: C.text, marginLeft: 12 },

    runBody: { borderTopWidth: 2, borderTopColor: C.border, padding: 14, gap: 12 },
    clusterRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    clusterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.text, marginTop: 6 },
    clusterTitle: { fontSize: 13, fontWeight: "600", color: C.text, lineHeight: 19 },
    clusterSources: { fontSize: 11, color: C.muted, marginTop: 2 },

    empty: { alignItems: "center", paddingTop: 80 },
    emptyTitle: { fontSize: 16, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 8 },
    emptyHint: { fontSize: 13, color: C.muted, textAlign: "center" },
  });
}
