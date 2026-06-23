import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ActivityIndicator, ScrollView, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Swiper from "react-native-deck-swiper";
import { Audio } from "expo-av";
import { api } from "../api";

const { width: W, height: H } = Dimensions.get("window");

const C = {
  bg: "#F5F4EF",
  white: "#FFFFFF",
  black: "#0A0A0A",
  muted: "#888",
  yes: "#2E7D32",
  no: "#B71C1C",
};

type NewsCard = { id: string; title: string; tag: string; snippet: string; image_url?: string | null };

export default function CardSwipeScreen() {
  const swiperRef = useRef<Swiper<NewsCard>>(null);
  const [cards, setCards] = useState<NewsCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<NewsCard[]>([]);
  const savedRef = useRef<NewsCard[]>([]);
  const [done, setDone] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);

  useEffect(() => {
    return () => { sound?.unloadAsync(); };
  }, [sound]);

  async function loadAudio(b64: string) {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: `data:audio/mpeg;base64,${b64}` },
      { shouldPlay: false }
    );
    newSound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) setPlaying(false);
    });
    setSound(newSound);
  }

  async function togglePlayback() {
    if (audioBusy || !sound) return;
    setAudioBusy(true);
    try {
      if (playing) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        await sound.playAsync();
        setPlaying(true);
      }
    } finally {
      setAudioBusy(false);
    }
  }

  useEffect(() => {
    api.getDailyCards()
      .then(setCards)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleSwipedRight(i: number) {
    const card = cards[i];
    const next = [...savedRef.current, card];
    savedRef.current = next;
    setSaved(next);
  }

  async function handleSwipedAll() {
    setDone(true);
    if (savedRef.current.length === 0) return;
    setSummarizing(true);
    try {
      const res = await api.summarizeCards(
        savedRef.current.map((c) => ({ title: c.title, snippet: c.snippet }))
      );
      setReport(res.report);
      if (res.audio_b64) await loadAudio(res.audio_b64);
    } catch (e: any) {
      setReport("Could not generate summary: " + e.message);
    } finally {
      setSummarizing(false);
    }
  }

  function reset() {
    savedRef.current = [];
    setSaved([]);
    setDone(false);
    setReport(null);
    setLoading(true);
    setError(null);
    api.getDailyCards()
      .then(setCards)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.black} />
          <Text style={styles.loadingText}>FETCHING TODAY'S STORIES…</Text>
          <Text style={styles.loadingHint}>First load may take ~30s</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>COULDN'T LOAD STORIES</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reset}>
            <Text style={styles.retryLabel}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>TODAY'S BRIEF</Text>
          <TouchableOpacity onPress={reset}>
            <Text style={styles.refreshLabel}>REFRESH</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.reportContainer}>
          {saved.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>YOU SKIPPED EVERYTHING</Text>
              <Text style={styles.emptySub}>Swipe right on stories to build a brief.</Text>
            </View>
          ) : summarizing ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.black} />
              <Text style={styles.loadingText}>WRITING YOUR BRIEF…</Text>
            </View>
          ) : (
            <>
              <View style={styles.reportMeta}>
                <Text style={styles.reportMetaText}>
                  {saved.length} stor{saved.length === 1 ? "y" : "ies"} saved
                </Text>
              </View>
              <View style={styles.reportShadow}>
                <View style={styles.reportCard}>
                  <Text style={styles.reportBody}>{report}</Text>
                </View>
              </View>

              {sound && (
                <TouchableOpacity
                  style={[styles.playBtn, audioBusy && styles.playBtnBusy]}
                  onPress={togglePlayback}
                  disabled={audioBusy}
                  activeOpacity={0.8}
                >
                  <Text style={styles.playBtnText}>
                    {playing ? "⏸  PAUSE" : "▶  LISTEN TO BRIEF"}
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={styles.savedLabel}>STORIES IN THIS BRIEF</Text>
              {saved.map((card, i) => (
                <View key={card.id} style={styles.savedItem}>
                  <Text style={styles.savedIndex}>{i + 1}</Text>
                  <Text style={styles.savedTitle}>{card.title}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TODAY'S FEED</Text>
        <Text style={styles.headerSub}>{saved.length} saved</Text>
      </View>

      <View style={styles.deck}>
        <Swiper
          ref={swiperRef}
          cards={cards}
          renderCard={(card) => (
            <View style={styles.cardShadow}>
              <View style={styles.card}>
                {card.image_url ? (
                  <Image
                    source={{ uri: card.image_url }}
                    style={styles.cardImage}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={styles.cardContent}>
                  <View style={styles.tagWrap}>
                    <Text style={styles.tag}>{card.tag}</Text>
                  </View>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <View style={styles.divider} />
                  <Text style={styles.cardSnippet}>
                    {card.snippet || "Trending story from the past 24 hours."}
                  </Text>
                </View>
              </View>
            </View>
          )}
          onSwipedRight={handleSwipedRight}
          onSwipedAll={handleSwipedAll}
          cardIndex={0}
          backgroundColor="transparent"
          stackSize={3}
          stackScale={6}
          stackSeparation={14}
          animateCardOpacity
          disableTopSwipe
          disableBottomSwipe
          overlayLabels={{
            left: {
              title: "SKIP",
              style: {
                label: {
                  backgroundColor: C.no,
                  color: C.white,
                  borderWidth: 0,
                  fontSize: 16,
                  fontWeight: "900",
                  letterSpacing: 2,
                  padding: 8,
                },
                wrapper: {
                  flexDirection: "column",
                  alignItems: "flex-end",
                  justifyContent: "flex-start",
                  marginTop: 20,
                  marginLeft: -20,
                },
              },
            },
            right: {
              title: "SAVE",
              style: {
                label: {
                  backgroundColor: C.yes,
                  color: C.white,
                  borderWidth: 0,
                  fontSize: 16,
                  fontWeight: "900",
                  letterSpacing: 2,
                  padding: 8,
                },
                wrapper: {
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  marginTop: 20,
                  marginLeft: 20,
                },
              },
            },
          }}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionSkip]}
          onPress={() => swiperRef.current?.swipeLeft()}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionLabel, { color: C.no }]}>✕  SKIP</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionSave]}
          onPress={() => swiperRef.current?.swipeRight()}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionLabel, { color: C.yes }]}>SAVE  ✓</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: C.black,
  },
  headerTitle: { fontSize: 13, fontWeight: "900", color: C.black, letterSpacing: 2 },
  headerSub: { fontSize: 12, color: C.muted },
  refreshLabel: { fontSize: 11, fontWeight: "900", color: C.black, letterSpacing: 2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  loadingText: { fontSize: 12, fontWeight: "900", color: C.black, letterSpacing: 2, marginTop: 20 },
  loadingHint: { fontSize: 12, color: C.muted, marginTop: 8 },

  errorTitle: { fontSize: 14, fontWeight: "900", color: C.black, letterSpacing: 2, marginBottom: 10 },
  errorSub: { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  retryBtn: {
    backgroundColor: C.black, paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 2, borderColor: C.black,
  },
  retryLabel: { color: C.bg, fontWeight: "900", fontSize: 12, letterSpacing: 2 },

  deck: { flex: 1, alignItems: "center", justifyContent: "center" },

  cardShadow: {
    width: W - 40,
    shadowColor: C.black,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  card: {
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.black,
    overflow: "hidden",
    minHeight: H * 0.5,
  },
  cardImage: {
    width: "100%",
    height: H * 0.22,
    backgroundColor: "#e5e5e5",
  },
  cardContent: {
    padding: 24,
  },
  tagWrap: {
    alignSelf: "flex-start",
    backgroundColor: C.black,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 16,
  },
  tag: { fontSize: 10, fontWeight: "900", color: C.bg, letterSpacing: 2 },
  cardTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: C.black,
    lineHeight: 29,
    marginBottom: 18,
  },
  divider: { height: 2, backgroundColor: C.black, marginBottom: 18 },
  cardSnippet: { fontSize: 14, color: "#333", lineHeight: 23 },

  actions: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: C.black,
  },
  actionBtn: { flex: 1, paddingVertical: 18, alignItems: "center" },
  actionSkip: { borderRightWidth: 1, borderRightColor: C.black },
  actionSave: { borderLeftWidth: 1, borderLeftColor: C.black },
  actionLabel: { fontSize: 13, fontWeight: "900", letterSpacing: 2 },

  reportContainer: { padding: 20, paddingBottom: 48 },
  reportMeta: { marginBottom: 14 },
  reportMetaText: { fontSize: 11, fontWeight: "900", color: C.muted, letterSpacing: 2 },
  reportShadow: {
    shadowColor: C.black,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
    marginBottom: 32,
  },
  reportCard: {
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.black,
    padding: 20,
  },
  playBtn: {
    backgroundColor: C.black,
    borderWidth: 2,
    borderColor: C.black,
    paddingVertical: 16,
    alignItems: "center" as const,
    marginBottom: 32,
  },
  playBtnBusy: { opacity: 0.5 },
  playBtnText: { color: C.bg, fontWeight: "900" as const, fontSize: 13, letterSpacing: 2 },
  reportBody: { fontSize: 15, color: C.black, lineHeight: 26 },

  savedLabel: {
    fontSize: 11, fontWeight: "900", color: C.black,
    letterSpacing: 2, marginBottom: 12,
  },
  savedItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    gap: 12,
  },
  savedIndex: { fontSize: 11, fontWeight: "900", color: C.muted, width: 18 },
  savedTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: C.black, lineHeight: 20 },

  emptyTitle: { fontSize: 14, fontWeight: "900", color: C.black, letterSpacing: 2, marginBottom: 8 },
  emptySub: { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 20 },
});
