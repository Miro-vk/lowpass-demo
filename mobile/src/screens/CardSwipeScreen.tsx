import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ActivityIndicator, ScrollView, Image, PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Swiper from "react-native-deck-swiper";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import LengthPicker from "../components/LengthPicker";
import LowpassIcon from "../components/LowpassIcon";
import { useTheme, Colors } from "../context/ThemeContext";

const { width: W, height: H } = Dimensions.get("window");
const YES = "#2E7D32";
const NO = "#B71C1C";

type NewsCard = { id: string; title: string; tag: string; snippet: string; image_url?: string | null; source?: string };

export default function CardSwipeScreen() {
  const { isDark, C } = useTheme();
  const S = useMemo(() => makeStyles(C), [C]);
  const swiperRef = useRef<Swiper<NewsCard>>(null);
  const [cards, setCards] = useState<NewsCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<NewsCard[]>([]);
  const savedRef = useRef<NewsCard[]>([]);
  const [done, setDone] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lengthMinutes, setLengthMinutes] = useState(5);
  const lengthMinutesRef = useRef(5);
  // keep ref in sync so handleSwipedAll always reads the latest value
  useEffect(() => { lengthMinutesRef.current = lengthMinutes; }, [lengthMinutes]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [playback, setPlayback] = useState({ position: 0, duration: 0 });
  const [trackWidth, setTrackWidth] = useState(0);
  const seekingRef = useRef(false);
  const seekPendingRef = useRef(0);

  useEffect(() => {
    return () => { sound?.unloadAsync(); };
  }, [sound]);

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  async function loadAudio(b64: string) {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: `data:audio/mpeg;base64,${b64}` },
      { shouldPlay: false }
    );
    newSound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (!seekingRef.current) {
        setPlayback({
          position: status.positionMillis ?? 0,
          duration: status.durationMillis ?? 0,
        });
        setPlaying(status.isPlaying);
      }
      if (status.didJustFinish) {
        setPlaying(false);
        // Reset to start so pressing play replays from the beginning
        newSound.setPositionAsync(0).catch(() => {});
      }
    });

    // Seed duration immediately — the periodic callback may not fire for 500ms
    newSound.getStatusAsync().then((status) => {
      if (status.isLoaded && status.durationMillis) {
        setPlayback({ position: 0, duration: status.durationMillis });
      }
    }).catch(() => {});

    setSound(newSound);
  }

  // Holds fresh closures so the PanResponder (created once) always sees current values
  const seekHandlerRef = useRef({
    drag: (_pageX: number) => {},
    commit: async () => {},
  });
  // Absolute screen X of the left edge of the progress track
  const trackPageXRef = useRef(0);
  const trackViewRef = useRef<View>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: (e) => {
        seekingRef.current = true;
        // Re-measure track position on every drag start to stay accurate after scroll
        trackViewRef.current?.measure((_x, _y, _w, _h, px) => {
          trackPageXRef.current = px;
        });
        seekHandlerRef.current.drag(e.nativeEvent.pageX);
      },
      onPanResponderMove: (_e, gs) => {
        seekHandlerRef.current.drag(gs.moveX);
      },
      onPanResponderRelease: () => seekHandlerRef.current.commit(),
      onPanResponderTerminate: () => { seekingRef.current = false; },
    })
  ).current;

  // Update handler with fresh values every render
  seekHandlerRef.current = {
    drag: (pageX: number) => {
      if (playback.duration === 0 || trackWidth === 0) return;
      const localX = pageX - trackPageXRef.current;
      const newPos = Math.max(0, Math.min(1, localX / trackWidth)) * playback.duration;
      seekPendingRef.current = newPos;
      setPlayback((p) => ({ ...p, position: newPos }));
    },
    commit: async () => {
      try {
        if (sound && playback.duration > 0) {
          await sound.setPositionAsync(seekPendingRef.current);
        }
      } finally {
        seekingRef.current = false;
      }
    },
  };

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
      .then((data) => setCards(data.filter((c) => c.title.trim().length >= 10).slice(0, 10)))
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
    setGenerating(true);
    try {
      const res = await api.summarizeCards(
        savedRef.current.map((c) => ({ title: c.title, snippet: c.snippet })),
        lengthMinutesRef.current,
      );
      if (res.audio_b64) {
        loadAudio(res.audio_b64).catch(() => {});
      }
    } catch {
      // podcast generation failed silently — no audio will appear
    } finally {
      setGenerating(false);
    }
  }

  function reset() {
    savedRef.current = [];
    setSaved([]);
    setDone(false);
    setGenerating(false);
    setSound(null);
    setPlaying(false);
    setPlayback({ position: 0, duration: 0 });
    setLoading(true);
    setError(null);
    api.getDailyCards()
      .then((data) => setCards(data.filter((c) => c.title.trim().length >= 10).slice(0, 10)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  const renderCard = useCallback((card: NewsCard) => (
    <View style={S.cardShadow}>
      <View style={S.card}>
        {card.image_url ? (
          <Image source={{ uri: card.image_url }} style={S.cardImage} resizeMode="cover" />
        ) : null}
        <View style={S.cardContent}>
          <View style={S.tagWrap}>
            <Text style={S.tag}>{card.tag}</Text>
          </View>
          <Text style={S.cardTitle}>{card.title}</Text>
          <View style={S.divider} />
          <Text style={S.cardSnippet}>
            {card.snippet || "Trending story from the past 24 hours."}
          </Text>
          {card.source === "nyt" && (
            <Text style={S.nytAttribution}>Data provided by The New York Times</Text>
          )}
        </View>
      </View>
    </View>
  ), [S]);

  if (loading) {
    return (
      <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
        <View style={S.center}>
          <ActivityIndicator size="large" color={C.text} />
          <Text style={S.loadingText}>FETCHING TODAY'S STORIES…</Text>
          <Text style={S.loadingHint}>First load may take ~30s</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
        <View style={S.center}>
          <Text style={S.errorTitle}>COULDN'T LOAD STORIES</Text>
          <Text style={S.errorSub}>{error}</Text>
          <TouchableOpacity style={S.retryBtn} onPress={reset}>
            <Text style={S.retryLabel}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
        <View style={S.header}>
          <Text style={S.headerTitle}>TODAY'S PODCAST</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <LengthPicker value={lengthMinutes} onChange={setLengthMinutes} textColor={C.text} bgColor={C.bg} />
            <TouchableOpacity onPress={reset}>
              <Text style={S.refreshLabel}>REFRESH</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={S.reportContainer}>
          {saved.length === 0 ? (
            <View style={S.center}>
              <Text style={S.emptyTitle}>YOU SKIPPED EVERYTHING</Text>
              <Text style={S.emptySub}>Swipe right on stories to build your podcast.</Text>
            </View>
          ) : generating ? (
            <View style={S.center}>
              <ActivityIndicator size="large" color={C.text} />
              <Text style={S.loadingText}>PRODUCING YOUR PODCAST…</Text>
              <Text style={S.loadingHint}>Writing script and generating audio</Text>
            </View>
          ) : (
            <>
              {sound ? (
                <View style={S.player}>
                  <View
                    ref={trackViewRef}
                    style={S.progressTrack}
                    onLayout={(e) => {
                      setTrackWidth(e.nativeEvent.layout.width);
                      trackViewRef.current?.measure((_x, _y, _w, _h, px) => {
                        trackPageXRef.current = px;
                      });
                    }}
                    {...panResponder.panHandlers}
                  >
                    <View style={S.progressFill}>
                      <View
                        style={[
                          S.progressFilled,
                          { width: playback.duration > 0 ? `${(playback.position / playback.duration) * 100}%` as any : 0 },
                        ]}
                      />
                    </View>
                    <View
                      style={[
                        S.progressThumb,
                        { left: trackWidth > 0 && playback.duration > 0
                            ? Math.min((playback.position / playback.duration) * trackWidth - 7, trackWidth - 14)
                            : -7 },
                      ]}
                    />
                  </View>

                  <View style={S.progressTimes}>
                    <Text style={S.progressTime}>{formatTime(playback.position)}</Text>
                    <Text style={S.progressTime}>{formatTime(playback.duration)}</Text>
                  </View>

                  <TouchableOpacity
                    style={[S.playBtn, audioBusy && S.playBtnBusy]}
                    onPress={togglePlayback}
                    disabled={audioBusy}
                    activeOpacity={0.8}
                  >
                    <View style={S.playBtnInner}>
                      <Ionicons
                        name={playing ? "pause" : "play"}
                        size={16}
                        color={C.bg}
                      />
                      <Text style={S.playBtnText}>
                        {playing ? "PAUSE" : "PLAY PODCAST"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={S.podcastError}>
                  <Text style={S.podcastErrorText}>AUDIO UNAVAILABLE</Text>
                  <Text style={S.podcastErrorSub}>Could not generate podcast audio.</Text>
                </View>
              )}

              <Text style={S.savedLabel}>
                {saved.length} STOR{saved.length === 1 ? "Y" : "IES"} IN THIS EPISODE
              </Text>
              {saved.map((card, i) => (
                <View key={card.id} style={S.savedItem}>
                  <Text style={S.savedIndex}>{i + 1}</Text>
                  <Text style={S.savedTitle}>{card.title}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
      <View style={S.header}>
        <Text style={S.headerTitle}>TODAY'S FEED</Text>
        <Text style={S.headerSub}>{saved.length} saved</Text>
      </View>

      <View style={[S.logoStrip, { zIndex: 99, elevation: 99 }]}>
        <LowpassIcon size={32} isDark={isDark} />
        <Text style={S.logoText}>LOWPASS</Text>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={S.pickerLabel}>SELECT PODCAST LENGTH</Text>
          <LengthPicker value={lengthMinutes} onChange={setLengthMinutes} textColor={C.text} bgColor={C.bg} />
        </View>
      </View>

      <View style={S.deck}>
        <Swiper
          ref={swiperRef}
          cards={cards}
          renderCard={renderCard}
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
          marginTop={10}
          marginBottom={H * 0.38}
          overlayLabels={{
            left: {
              title: "SKIP",
              style: {
                label: {
                  backgroundColor: NO,
                  color: "#FFFFFF",
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
                  backgroundColor: YES,
                  color: "#FFFFFF",
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

      <View style={S.actions}>
        <TouchableOpacity
          style={[S.actionBtn, S.actionSkip]}
          onPress={() => swiperRef.current?.swipeLeft()}
          activeOpacity={0.8}
        >
          <Text style={[S.actionLabel, { color: NO }]}>✕  SKIP</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.actionBtn, S.actionSave]}
          onPress={() => swiperRef.current?.swipeRight()}
          activeOpacity={0.8}
        >
          <Text style={[S.actionLabel, { color: YES }]}>SAVE  ✓</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    logoStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    logoText: { fontSize: 18, fontWeight: "900", color: C.text, letterSpacing: 5 },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: 2,
      borderBottomColor: C.border,
    },
    headerTitle: { fontSize: 13, fontWeight: "900", color: C.text, letterSpacing: 2 },
    headerSub: { fontSize: 12, color: C.muted },
    refreshLabel: { fontSize: 11, fontWeight: "900", color: C.text, letterSpacing: 2 },
    pickerLabel: { fontSize: 8, fontWeight: "900", color: C.muted, letterSpacing: 1, marginBottom: 3 },

    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
    loadingText: { fontSize: 12, fontWeight: "900", color: C.text, letterSpacing: 2, marginTop: 20 },
    loadingHint: { fontSize: 12, color: C.muted, marginTop: 8 },

    errorTitle: { fontSize: 14, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 10 },
    errorSub: { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 20, marginBottom: 24 },
    retryBtn: {
      backgroundColor: C.text, paddingHorizontal: 24, paddingVertical: 12,
      borderWidth: 2, borderColor: C.text,
    },
    retryLabel: { color: C.bg, fontWeight: "900", fontSize: 12, letterSpacing: 2 },

    deck: { flex: 1, alignItems: "center" },

    cardShadow: {
      width: W - 40,
      height: H * 0.50,
      shadowColor: C.text,
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 4,
    },
    card: {
      flex: 1,
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: C.border,
      overflow: "hidden",
    },
    cardImage: {
      width: "100%",
      height: H * 0.22,
      backgroundColor: "#e5e5e5",
    },
    cardContent: {
      flex: 1,
      padding: 24,
    },
    tagWrap: {
      alignSelf: "flex-start",
      backgroundColor: C.text,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 16,
    },
    tag: { fontSize: 10, fontWeight: "900", color: C.bg, letterSpacing: 2 },
    cardTitle: {
      fontSize: 21,
      fontWeight: "900",
      color: C.text,
      lineHeight: 29,
      marginBottom: 18,
    },
    divider: { height: 2, backgroundColor: C.border, marginBottom: 18 },
    cardSnippet: { fontSize: 14, color: C.muted, lineHeight: 23 },
    nytAttribution: { fontSize: 9, color: C.muted, marginTop: 12, letterSpacing: 0.5 },

    actions: {
      flexDirection: "row",
      borderTopWidth: 2,
      borderTopColor: C.border,
    },
    actionBtn: { flex: 1, paddingVertical: 18, alignItems: "center" },
    actionSkip: { borderRightWidth: 1, borderRightColor: C.border },
    actionSave: { borderLeftWidth: 1, borderLeftColor: C.border },
    actionLabel: { fontSize: 13, fontWeight: "900", letterSpacing: 2 },

    reportContainer: { padding: 20, paddingBottom: 48 },
    reportMeta: { marginBottom: 14 },
    reportMetaText: { fontSize: 11, fontWeight: "900", color: C.muted, letterSpacing: 2 },
    reportShadow: {
      shadowColor: C.text,
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 4,
      marginBottom: 32,
    },
    reportCard: {
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: C.border,
      padding: 20,
    },
    playBtn: {
      backgroundColor: C.text,
      borderWidth: 2,
      borderColor: C.border,
      paddingVertical: 16,
      alignItems: "center" as const,
      marginBottom: 32,
    },
    playBtnBusy: { opacity: 0.5 },
    playBtnInner: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
    playBtnText: { color: C.bg, fontWeight: "900" as const, fontSize: 13, letterSpacing: 2 },
    reportBody: { fontSize: 15, color: C.text, lineHeight: 26 },

    savedLabel: {
      fontSize: 11, fontWeight: "900", color: C.text,
      letterSpacing: 2, marginBottom: 12,
    },
    savedItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      gap: 12,
    },
    savedIndex: { fontSize: 11, fontWeight: "900", color: C.muted, width: 18 },
    savedTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: C.text, lineHeight: 20 },

    emptyTitle: { fontSize: 14, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 8 },
    emptySub: { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 20 },

    podcastError: { alignItems: "center" as const, paddingVertical: 32, marginBottom: 32 },
    podcastErrorText: { fontSize: 13, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 8 },
    podcastErrorSub: { fontSize: 13, color: C.muted },

    player: { marginBottom: 32 },
    progressTrack: {
      height: 44,
      justifyContent: "center" as const,
      marginBottom: 4,
    },
    progressFill: {
      height: 4,
      backgroundColor: C.border,
      borderRadius: 2,
      overflow: "hidden" as const,
    },
    progressFilled: {
      height: 4,
      backgroundColor: C.text,
      borderRadius: 2,
    },
    progressThumb: {
      position: "absolute" as const,
      top: 16,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: C.text,
    },
    progressTimes: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      marginBottom: 20,
    },
    progressTime: { fontSize: 11, color: C.muted },
  });
}
