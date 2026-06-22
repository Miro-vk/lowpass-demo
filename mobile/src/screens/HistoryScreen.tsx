import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHistory } from "../context/HistoryContext";
import type { DigestRun } from "../types";

const C = {
  bg: "#F5F4EF",
  white: "#FFFFFF",
  black: "#0A0A0A",
  muted: "#888",
  border: "#0A0A0A",
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function RunCard({ run }: { run: DigestRun }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.runCard}>
      <TouchableOpacity
        style={styles.runHeader}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.8}
      >
        <View style={styles.runHeaderLeft}>
          <Text style={styles.runTopic}>{run.topic}</Text>
          <Text style={styles.runMeta}>
            {run.results[0]?.clusters.length ?? 0} clusters · {formatDate(run.timestamp)}
          </Text>
        </View>
        <Text style={styles.chevron}>{open ? "↑" : "↓"}</Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.runBody}>
          {run.results.map((result) =>
            result.clusters.map((cluster) => (
              <TouchableOpacity
                key={cluster.rank}
                style={styles.clusterRow}
                onPress={() => Linking.openURL(cluster.url)}
                activeOpacity={0.75}
              >
                <View style={styles.clusterDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clusterTitle} numberOfLines={2}>
                    {cluster.title}
                  </Text>
                  <Text style={styles.clusterSources}>
                    {cluster.sources.join(" · ")}
                  </Text>
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>HISTORY</Text>
        {history.length > 0 && (
          <TouchableOpacity onPress={clearHistory}>
            <Text style={styles.clearBtn}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {history.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>NO HISTORY YET</Text>
            <Text style={styles.emptyHint}>Run a digest on the Chats tab to get started.</Text>
          </View>
        ) : (
          history.map((run) => <RunCard key={run.id} run={run} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: C.black,
  },
  title: { fontSize: 18, fontWeight: "900", color: C.black, letterSpacing: 3 },
  clearBtn: { fontSize: 11, fontWeight: "700", color: C.muted, letterSpacing: 1 },

  content: { padding: 20, paddingBottom: 60 },

  runCard: {
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: C.white,
    marginBottom: 10,
    shadowColor: C.black,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  runHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  runHeaderLeft: { flex: 1 },
  runTopic: { fontSize: 15, fontWeight: "800", color: C.black, marginBottom: 3 },
  runMeta: { fontSize: 12, color: C.muted },
  chevron: { fontSize: 16, fontWeight: "700", color: C.black, marginLeft: 12 },

  runBody: {
    borderTopWidth: 2,
    borderTopColor: C.border,
    padding: 14,
    gap: 12,
  },
  clusterRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  clusterDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: C.black, marginTop: 6,
  },
  clusterTitle: { fontSize: 13, fontWeight: "600", color: C.black, lineHeight: 19 },
  clusterSources: { fontSize: 11, color: C.muted, marginTop: 2 },

  empty: { alignItems: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: C.black, letterSpacing: 2, marginBottom: 8 },
  emptyHint: { fontSize: 13, color: C.muted, textAlign: "center" },
});
