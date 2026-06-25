import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
  Dimensions, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useHistory } from "../context/HistoryContext";
import { useTheme, Colors } from "../context/ThemeContext";
import LowpassIcon from "../components/LowpassIcon";
import LengthPicker from "../components/LengthPicker";
import TimeframePicker from "../components/TimeframePicker";
import PodcastPlayer from "../components/PodcastPlayer";

const { height: SCREEN_H } = Dimensions.get("window");

export default function DigestScreen() {
  const { token } = useAuth();
  const { addRun, history } = useHistory();
  const { isDark, C } = useTheme();
  const [topic, setTopic] = useState("");
  const [lengthMinutes, setLengthMinutes] = useState(5);
  const [timeframeDays, setTimeframeDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [audioBuf, setAudioBuf] = useState<string | null>(null);
  const [stories, setStories] = useState<{ title: string; snippet: string }[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const S = makeStyles(C);

  async function handleRun() {
    const t = topic.trim();
    if (!t) return Alert.alert("Enter a topic first");
    setLoading(true);
    setAudioBuf(null);
    setStories([]);
    try {
      const data = await api.topicPodcast(token!, t, lengthMinutes, timeframeDays);
      setAudioBuf(data.audio_b64);
      setStories(data.stories);
      addRun({ id: Date.now().toString(), topic: t, timestamp: new Date() });
      setTimeout(() => scrollRef.current?.scrollTo({ y: SCREEN_H * 0.5, animated: true }), 100);
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
                  <Text style={S.runBtnText}>GENERATING PODCAST…</Text>
                </View>
              ) : (
                <Text style={S.runBtnText}>GENERATE PODCAST</Text>
              )}
            </TouchableOpacity>
            {loading && (
              <Text style={S.loadingHint}>Fetching stories, writing script, synthesizing audio…</Text>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <View style={{ alignItems: "flex-start" }}>
                <Text style={S.pickerLabel}>SELECT TIMEFRAME</Text>
                <TimeframePicker value={timeframeDays} onChange={setTimeframeDays} textColor={C.text} bgColor={C.bg} />
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={S.pickerLabel}>SELECT PODCAST LENGTH</Text>
                <LengthPicker value={lengthMinutes} onChange={setLengthMinutes} textColor={C.text} bgColor={C.bg} />
              </View>
            </View>
          </View>

          {audioBuf && (
            <View style={S.podcastSection}>
              <Text style={S.sectionLabel}>{topic.toUpperCase()} PODCAST</Text>
              <PodcastPlayer audioB64={audioBuf} />
              {stories.length > 0 && (
                <>
                  <Text style={S.storiesLabel}>
                    {stories.length} STOR{stories.length === 1 ? "Y" : "IES"} COVERED
                  </Text>
                  {stories.map((s, i) => (
                    <View key={i} style={S.storyItem}>
                      <Text style={S.storyIndex}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={S.storyTitle}>{s.title}</Text>
                        <Text style={S.storySnippet}>{s.snippet}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {!audioBuf && !loading && recent.length > 0 && (
            <View style={S.recentSection}>
              <Text style={S.sectionLabel}>RECENT</Text>
              {recent.map((run) => (
                <TouchableOpacity
                  key={run.id}
                  style={S.recentItem}
                  onPress={() => setTopic(run.topic)}
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
    pickerLabel: { fontSize: 8, fontWeight: "900", color: C.muted, letterSpacing: 1, marginBottom: 3 },
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

    podcastSection: { marginBottom: 32 },
    sectionLabel: { fontSize: 11, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 12 },
    storiesLabel: {
      fontSize: 11, fontWeight: "900", color: C.text, letterSpacing: 2,
      marginBottom: 12, borderTopWidth: 2, borderTopColor: C.border, paddingTop: 20,
    },
    storyItem: {
      flexDirection: "row", alignItems: "flex-start", gap: 12,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    storyIndex: { fontSize: 11, fontWeight: "900", color: C.muted, width: 18, paddingTop: 2 },
    storyTitle: { fontSize: 13, fontWeight: "700", color: C.text, lineHeight: 20, marginBottom: 2 },
    storySnippet: { fontSize: 12, color: C.muted, lineHeight: 18 },

    recentSection: { borderTopWidth: 2, borderTopColor: C.border, paddingTop: 20 },
    recentItem: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    recentTopic: { fontSize: 14, fontWeight: "700", color: C.text },
    recentTime: { fontSize: 12, color: C.muted },
  });
}
