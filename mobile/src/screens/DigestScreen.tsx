import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

type Cluster = {
  rank: number;
  title: string;
  url: string;
  sources: string[];
  composite_score: number;
  summary: string;
};

type DigestResult = {
  topic: string;
  clusters: Cluster[];
  themes: string;
};

export default function DigestScreen({ navigation }: any) {
  const { token } = useAuth();
  const [results, setResults] = useState<DigestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function handleRun() {
    setLoading(true);
    setRan(false);
    try {
      const data = await api.runDigest(token!);
      setResults(data);
      setRan(true);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Topics</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Digest</Text>
        <TouchableOpacity onPress={handleRun} disabled={loading}>
          <Text style={styles.run}>{loading ? "..." : "Run"}</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Fetching and summarising…</Text>
        </View>
      )}

      {!loading && !ran && (
        <View style={styles.center}>
          <Text style={styles.empty}>Tap Run to generate your digest</Text>
        </View>
      )}

      {!loading && ran && results.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>Nothing new since your last run.</Text>
        </View>
      )}

      <ScrollView>
        {results.map((result) => (
          <View key={result.topic} style={styles.section}>
            <Text style={styles.topicLabel}>{result.topic}</Text>

            {result.clusters.map((cluster) => (
              <View key={cluster.rank} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.rank}>#{cluster.rank}</Text>
                  <Text style={styles.sources}>{cluster.sources.join(" + ")}</Text>
                  <Text style={styles.score}>{cluster.composite_score}</Text>
                </View>
                <Text style={styles.clusterTitle}>{cluster.title}</Text>
                <Text style={styles.summary}>{cluster.summary}</Text>
              </View>
            ))}

            {result.themes ? (
              <View style={styles.themes}>
                <Text style={styles.themesLabel}>Themes</Text>
                <Text style={styles.themesText}>{result.themes}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 60 },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingHorizontal: 16, marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "700" },
  back: { color: "#555", fontSize: 15 },
  run: { color: "#000", fontSize: 15, fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  loadingText: { marginTop: 12, color: "#888", fontSize: 14 },
  empty: { color: "#aaa", fontSize: 15 },
  section: { marginBottom: 24 },
  topicLabel: {
    fontSize: 13, fontWeight: "700", color: "#888",
    textTransform: "uppercase", letterSpacing: 1,
    paddingHorizontal: 16, marginBottom: 8,
  },
  card: {
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  rank: { fontWeight: "700", fontSize: 13, marginRight: 8 },
  sources: { flex: 1, fontSize: 12, color: "#888" },
  score: { fontSize: 12, color: "#aaa" },
  clusterTitle: { fontSize: 15, fontWeight: "600", marginBottom: 6 },
  summary: { fontSize: 14, color: "#444", lineHeight: 20 },
  themes: {
    marginHorizontal: 16, backgroundColor: "#f8f8f8",
    borderRadius: 10, padding: 14,
  },
  themesLabel: { fontWeight: "700", fontSize: 13, marginBottom: 6 },
  themesText: { fontSize: 14, color: "#444", lineHeight: 20 },
});
