import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking,
  Dimensions, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path, G, Rect } from "react-native-svg";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useHistory } from "../context/HistoryContext";
import type { DigestResult } from "../types";

const { height: SCREEN_H } = Dimensions.get("window");

const C = {
  bg: "#F5F4EF",
  white: "#FFFFFF",
  black: "#0A0A0A",
  muted: "#888",
  border: "#0A0A0A",
  accent: "#0A0A0A",
};

function LowpassIcon({ size = 52 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Rect width="1024" height="1024" rx="220" fill="#FAFAF8" />
      <G fill="#1A1A1A" opacity={0.35}>
        <Circle cx={246} cy={318} r={24} />
        <Circle cx={386} cy={252} r={29} />
        <Circle cx={544} cy={299} r={24} />
        <Circle cx={702} cy={246} r={29} />
        <Circle cx={842} cy={308} r={24} />
        <Circle cx={322} cy={440} r={24} />
        <Circle cx={480} cy={412} r={24} />
        <Circle cx={640} cy={440} r={24} />
        <Circle cx={780} cy={412} r={24} />
      </G>
      <Path
        d="M 196 516 L 504 824 L 504 910 L 580 910 L 580 824 L 888 516"
        fill="none" stroke="#1A1A1A" strokeWidth={44}
        strokeLinejoin="round" strokeLinecap="round"
      />
      <Circle cx={540} cy={970} r={38} fill="#F5B82E" />
    </Svg>
  );
}

function Card({ children, style }: any) {
  return (
    <View style={[styles.cardShadow, style]}>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export default function DigestScreen() {
  const { token } = useAuth();
  const { addRun, history } = useHistory();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DigestResult[] | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  async function handleRun() {
    const t = topic.trim();
    if (!t) return Alert.alert("Enter a topic first");
    setLoading(true);
    setResults(null);
    try {
      const data: DigestResult[] = await api.runDigest(token!, t);
      setResults(data);
      addRun({ id: Date.now().toString(), topic: t, timestamp: new Date(), results: data });
      setTimeout(() => scrollRef.current?.scrollTo({ y: SCREEN_H * 0.4, animated: true }), 100);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  const recent = history.slice(0, 3);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Spacer pushes everything lower */}
          <View style={{ height: SCREEN_H * 0.22 }} />

          {/* Logo sits right above input */}
          <View style={styles.logo}>
            <LowpassIcon size={72} />
            <Text style={styles.logoText}>LOWPASS</Text>
          </View>

          {/* Input area */}
          <View style={styles.inputSection}>
            <View style={styles.inputShadow}>
              <TextInput
                style={styles.input}
                placeholder="What do you want to know about?"
                placeholderTextColor={C.muted}
                value={topic}
                onChangeText={setTopic}
                onSubmitEditing={handleRun}
                returnKeyType="go"
                multiline={false}
              />
            </View>
            <TouchableOpacity
              style={[styles.runBtn, loading && styles.runBtnDisabled]}
              onPress={handleRun}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.runBtnInner}>
                  <ActivityIndicator color={C.bg} size="small" />
                  <Text style={styles.runBtnText}>FILTERING…</Text>
                </View>
              ) : (
                <Text style={styles.runBtnText}>FILTER THE NOISE</Text>
              )}
            </TouchableOpacity>
            {loading && (
              <Text style={styles.loadingHint}>
                First run may take ~30s while the server wakes up.
              </Text>
            )}
          </View>

          {/* Results */}
          {results && (
            <View style={styles.resultsSection}>
              {results.map((result) => (
                <View key={result.topic}>
                  <Text style={styles.sectionLabel}>{result.topic.toUpperCase()}</Text>
                  {result.clusters.map((cluster) => (
                    <Card key={cluster.rank} style={{ marginBottom: 10 }}>
                      <View style={styles.clusterMeta}>
                        <Text style={styles.clusterSources}>{cluster.sources.join(" · ")}</Text>
                        <Text style={styles.clusterScore}>↑{cluster.composite_score}</Text>
                      </View>
                      <TouchableOpacity onPress={() => Linking.openURL(cluster.url)}>
                        <Text style={styles.clusterTitle}>{cluster.title}</Text>
                      </TouchableOpacity>
                      <Text style={styles.clusterSummary}>{cluster.summary}</Text>
                    </Card>
                  ))}
                  {result.themes ? (
                    <Card style={{ marginBottom: 10, backgroundColor: C.black }}>
                      <Text style={[styles.sectionLabel, { color: C.bg, marginBottom: 6 }]}>THEMES</Text>
                      <Text style={[styles.clusterSummary, { color: "#ccc" }]}>{result.themes}</Text>
                    </Card>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* Recent history */}
          {recent.length > 0 && (
            <View style={styles.recentSection}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>RECENT</Text>
              </View>
              {recent.map((run) => (
                <TouchableOpacity
                  key={run.id}
                  style={styles.recentItem}
                  onPress={() => {
                    setTopic(run.topic);
                    setResults(run.results);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.recentTopic}>{run.topic}</Text>
                  <Text style={styles.recentTime}>
                    {new Date(run.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },

  logo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "900",
    color: C.black,
    letterSpacing: 6,
  },

  inputSection: { marginBottom: 24 },
  inputShadow: {
    shadowColor: C.black,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
    marginBottom: 10,
  },
  input: {
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.border,
    padding: 16,
    fontSize: 16,
    color: C.black,
    fontWeight: "500",
  },
  runBtn: {
    backgroundColor: C.black,
    borderWidth: 2,
    borderColor: C.black,
    padding: 16,
    alignItems: "center",
    shadowColor: C.black,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  runBtnDisabled: { opacity: 0.6 },
  runBtnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  runBtnText: {
    color: C.bg,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 2,
  },
  loadingHint: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },

  resultsSection: { marginBottom: 32 },

  cardShadow: {
    shadowColor: C.black,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  card: {
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.border,
    padding: 14,
  },

  clusterMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  clusterSources: { fontSize: 11, color: C.muted, fontWeight: "600", letterSpacing: 0.5 },
  clusterScore: { fontSize: 11, color: C.muted },
  clusterTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.black,
    marginBottom: 6,
    lineHeight: 22,
    textDecorationLine: "underline",
  },
  clusterSummary: { fontSize: 13, color: "#444", lineHeight: 20 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: C.black,
    letterSpacing: 2,
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  recentSection: { borderTopWidth: 2, borderTopColor: C.black, paddingTop: 20 },
  recentItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  recentTopic: { fontSize: 14, fontWeight: "700", color: C.black },
  recentTime: { fontSize: 12, color: C.muted },
});
