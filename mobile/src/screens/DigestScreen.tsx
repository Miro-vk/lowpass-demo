import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path, G, Rect } from "react-native-svg";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

const C = {
  bg: "#0A0A0A",
  surface: "#141414",
  border: "#222222",
  borderHover: "#333333",
  textPrimary: "#F2F2ED",
  textSecondary: "#555555",
  textMuted: "#2E2E2E",
  accent: "#F5B82E",
};

function LowpassIcon({ size = 38 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Rect width="1024" height="1024" rx="220" fill="#1C1C1C" />
      <G fill="#FAFAF8" opacity={0.3}>
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
        fill="none"
        stroke="#FAFAF8"
        strokeWidth={44}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={540} cy={970} r={38} fill="#F5B82E" />
    </Svg>
  );
}

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

type ConversationEntry = {
  id: string;
  timestamp: Date;
  preview: string;
  tags: string[];
  results: DigestResult[];
};

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DigestScreen({ navigation }: any) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function handleNewConversation() {
    setLoading(true);
    try {
      const data: DigestResult[] = await api.runDigest(token!);
      const entry: ConversationEntry = {
        id: Date.now().toString(),
        timestamp: new Date(),
        preview: data[0]?.clusters[0]?.title ?? "Digest run",
        tags: data.map((r) => r.topic).slice(0, 3),
        results: data,
      };
      setHistory((prev) => [entry, ...prev]);
      setExpanded(entry.id);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = query.trim()
    ? history.filter(
        (e) =>
          e.preview.toLowerCase().includes(query.toLowerCase()) ||
          e.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))
      )
    : history;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <LowpassIcon size={38} />
          <View style={styles.headerText}>
            <Text style={styles.appName}>LOWPASS</Text>
            <Text style={styles.appSub}>Daily signal · Digest</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Search box */}
        <View style={styles.inputWrap}>
          <Text style={styles.inputIcon}>⌕</Text>
          <TextInput
            style={styles.input}
            placeholder="Search conversations…"
            placeholderTextColor={C.textSecondary}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {/* New conversation button */}
        <TouchableOpacity
          style={[styles.newBtn, loading && styles.newBtnDisabled]}
          onPress={handleNewConversation}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={C.bg} size="small" />
          ) : (
            <Text style={styles.newBtnText}>+ NEW CONVERSATION</Text>
          )}
        </TouchableOpacity>

        {loading && (
          <Text style={styles.loadingHint}>
            First run may take ~30s while the server wakes up.
          </Text>
        )}

        {/* Recent section */}
        {filtered.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>RECENT</Text>
              {history.length > 3 && (
                <TouchableOpacity>
                  <Text style={styles.seeAll}>SEE ALL</Text>
                </TouchableOpacity>
              )}
            </View>

            {filtered.map((entry) => (
              <View key={entry.id}>
                <TouchableOpacity
                  style={[styles.item, expanded === entry.id && styles.itemOpen]}
                  onPress={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.itemIcon}>
                    <View style={styles.itemDot} />
                  </View>
                  <View style={styles.itemBody}>
                    <View style={styles.itemTop}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {entry.preview}
                      </Text>
                      <Text style={styles.itemTime}>{timeAgo(entry.timestamp)}</Text>
                    </View>
                    <Text style={styles.itemSub} numberOfLines={1}>
                      {entry.tags.length} topic{entry.tags.length !== 1 ? "s" : ""} · Digest run
                    </Text>
                    <View style={styles.tags}>
                      {entry.tags.map((tag) => (
                        <View key={tag} style={styles.tag}>
                          <Text style={styles.tagText}>{tag.toUpperCase()}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Expanded digest content */}
                {expanded === entry.id && (
                  <View style={styles.expandedWrap}>
                    {entry.results.map((result) => (
                      <View key={result.topic} style={styles.resultSection}>
                        <Text style={styles.topicLabel}>{result.topic}</Text>
                        {result.clusters.map((cluster) => (
                          <TouchableOpacity
                            key={cluster.rank}
                            style={styles.clusterCard}
                            onPress={() => Linking.openURL(cluster.url)}
                            activeOpacity={0.75}
                          >
                            <View style={styles.clusterMeta}>
                              <Text style={styles.clusterSources}>
                                {cluster.sources.join(" · ")}
                              </Text>
                              <Text style={styles.clusterScore}>
                                {cluster.composite_score}
                              </Text>
                            </View>
                            <Text style={styles.clusterTitle}>{cluster.title}</Text>
                            <Text style={styles.clusterSummary}>{cluster.summary}</Text>
                          </TouchableOpacity>
                        ))}
                        {result.themes ? (
                          <View style={styles.themesCard}>
                            <Text style={styles.themesLabel}>THEMES</Text>
                            <Text style={styles.themesText}>{result.themes}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {filtered.length === 0 && !loading && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {query ? "No results found." : "No conversations yet."}
            </Text>
            <Text style={styles.emptyHint}>
              {query
                ? "Try a different search term."
                : "Tap + NEW CONVERSATION to run your first digest."}
            </Text>
          </View>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { justifyContent: "center" },
  appName: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 3,
  },
  appSub: { color: C.textSecondary, fontSize: 11, marginTop: 2, letterSpacing: 0.3 },
  backBtn: { color: C.textSecondary, fontSize: 22, lineHeight: 28 },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 10,
    gap: 8,
  },
  inputIcon: { color: C.textSecondary, fontSize: 18 },
  input: { flex: 1, color: C.textPrimary, fontSize: 14 },

  newBtn: {
    backgroundColor: C.textPrimary,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 8,
  },
  newBtnDisabled: { opacity: 0.45 },
  newBtnText: {
    color: C.bg,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 1.8,
  },
  loadingHint: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: "center",
    marginBottom: 20,
  },

  section: { marginTop: 20 },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  seeAll: { color: C.textSecondary, fontSize: 11, letterSpacing: 1 },

  item: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  itemOpen: { borderColor: C.borderHover, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  itemIcon: { marginRight: 12, paddingTop: 5 },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
  itemBody: { flex: 1 },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  itemTitle: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
    lineHeight: 20,
  },
  itemTime: { color: C.textSecondary, fontSize: 11 },
  itemSub: { color: C.textSecondary, fontSize: 12, marginBottom: 8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: {
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tagText: { color: C.textSecondary, fontSize: 10, letterSpacing: 0.5 },

  expandedWrap: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: C.borderHover,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  resultSection: { marginBottom: 16 },
  topicLabel: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  clusterCard: {
    borderLeftWidth: 2,
    borderLeftColor: C.border,
    paddingLeft: 12,
    marginBottom: 12,
  },
  clusterMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  clusterSources: { color: C.textSecondary, fontSize: 11 },
  clusterScore: { color: C.textSecondary, fontSize: 11 },
  clusterTitle: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
    lineHeight: 20,
  },
  clusterSummary: { color: "#888888", fontSize: 13, lineHeight: 19 },
  themesCard: {
    backgroundColor: "#111111",
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  themesLabel: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  themesText: { color: "#888888", fontSize: 13, lineHeight: 19 },

  empty: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { color: C.textSecondary, fontSize: 15, marginBottom: 8 },
  emptyHint: {
    color: "#2E2E2E",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
});
