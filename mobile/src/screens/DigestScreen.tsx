import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking,
  Dimensions, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useHistory } from "../context/HistoryContext";
import { useTheme, Colors } from "../context/ThemeContext";
import LowpassIcon from "../components/LowpassIcon";
import type { DigestResult } from "../types";

const { height: SCREEN_H } = Dimensions.get("window");

export default function DigestScreen() {
  const { token } = useAuth();
  const { addRun, history } = useHistory();
  const { isDark, C } = useTheme();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DigestResult[] | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const S = makeStyles(C);

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
    <SafeAreaView style={S.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          style={S.scroll}
          contentContainerStyle={S.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ height: SCREEN_H * 0.22 }} />

          <View style={S.logo}>
            <LowpassIcon size={72} isDark={isDark} />
            <Text style={S.logoText}>LOWPASS</Text>
          </View>

          <View style={S.inputSection}>
            <View style={S.inputShadow}>
              <TextInput
                style={S.input}
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
              style={[S.runBtn, loading && S.runBtnDisabled]}
              onPress={handleRun}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={S.runBtnInner}>
                  <ActivityIndicator color={C.bg} size="small" />
                  <Text style={S.runBtnText}>FILTERING…</Text>
                </View>
              ) : (
                <Text style={S.runBtnText}>FILTER THE NOISE</Text>
              )}
            </TouchableOpacity>
            {loading && (
              <Text style={S.loadingHint}>First run may take ~30s while the server wakes up.</Text>
            )}
          </View>

          {results && (
            <View style={S.resultsSection}>
              {results.map((result) => (
                <View key={result.topic}>
                  <Text style={S.sectionLabel}>{result.topic.toUpperCase()}</Text>
                  {result.clusters.map((cluster) => (
                    <View key={cluster.rank} style={[S.cardShadow, { marginBottom: 10 }]}>
                      <View style={S.card}>
                        <View style={S.clusterMeta}>
                          <Text style={S.clusterSources}>{cluster.sources.join(" · ")}</Text>
                          <Text style={S.clusterScore}>↑{cluster.composite_score}</Text>
                        </View>
                        <TouchableOpacity onPress={() => Linking.openURL(cluster.url)}>
                          <Text style={S.clusterTitle}>{cluster.title}</Text>
                        </TouchableOpacity>
                        <Text style={S.clusterSummary}>{cluster.summary}</Text>
                      </View>
                    </View>
                  ))}
                  {result.themes ? (
                    <View style={[S.cardShadow, { marginBottom: 10 }]}>
                      <View style={[S.card, { backgroundColor: C.text }]}>
                        <Text style={[S.sectionLabel, { color: C.bg, marginBottom: 6 }]}>THEMES</Text>
                        <Text style={[S.clusterSummary, { color: C.muted }]}>{result.themes}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {recent.length > 0 && (
            <View style={S.recentSection}>
              <Text style={S.sectionLabel}>RECENT</Text>
              {recent.map((run) => (
                <TouchableOpacity
                  key={run.id}
                  style={S.recentItem}
                  onPress={() => { setTopic(run.topic); setResults(run.results); }}
                  activeOpacity={0.75}
                >
                  <Text style={S.recentTopic}>{run.topic}</Text>
                  <Text style={S.recentTime}>
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

function makeStyles(C: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },

    logo: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    logoText: { fontSize: 32, fontWeight: "900", color: C.text, letterSpacing: 6 },

    inputSection: { marginBottom: 24 },
    inputShadow: {
      shadowColor: C.text, shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1, shadowRadius: 0, elevation: 4, marginBottom: 10,
    },
    input: {
      backgroundColor: C.card, borderWidth: 2, borderColor: C.border,
      padding: 16, fontSize: 16, color: C.text, fontWeight: "500",
    },
    runBtn: {
      backgroundColor: C.bg, borderWidth: 2, borderColor: C.text,
      padding: 16, alignItems: "center",
      shadowColor: C.text, shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1, shadowRadius: 0, elevation: 4,
    },
    runBtnDisabled: { opacity: 0.6 },
    runBtnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
    runBtnText: { color: C.text, fontWeight: "900", fontSize: 14, letterSpacing: 2 },
    loadingHint: { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 8 },

    resultsSection: { marginBottom: 32 },
    cardShadow: {
      shadowColor: C.text, shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1, shadowRadius: 0, elevation: 4,
    },
    card: { backgroundColor: C.card, borderWidth: 2, borderColor: C.border, padding: 14 },

    clusterMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    clusterSources: { fontSize: 11, color: C.muted, fontWeight: "600", letterSpacing: 0.5 },
    clusterScore: { fontSize: 11, color: C.muted },
    clusterTitle: {
      fontSize: 15, fontWeight: "700", color: C.text,
      marginBottom: 6, lineHeight: 22, textDecorationLine: "underline",
    },
    clusterSummary: { fontSize: 13, color: C.muted, lineHeight: 20 },

    sectionLabel: { fontSize: 11, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 12 },

    recentSection: { borderTopWidth: 2, borderTopColor: C.border, paddingTop: 20 },
    recentItem: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    recentTopic: { fontSize: 14, fontWeight: "700", color: C.text },
    recentTime: { fontSize: 12, color: C.muted },
  });
}
