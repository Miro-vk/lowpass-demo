import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, PanResponder, StyleSheet } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, Colors } from "../context/ThemeContext";

type Props = {
  audioB64: string;
};

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function PodcastPlayer({ audioB64 }: Props) {
  const { C } = useTheme();
  const S = useMemo(() => makeStyles(C), [C]);

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [playback, setPlayback] = useState({ position: 0, duration: 0 });
  const [trackWidth, setTrackWidth] = useState(0);

  const seekingRef = useRef(false);
  const seekPendingRef = useRef(0);
  const trackPageXRef = useRef(0);
  const trackViewRef = useRef<View>(null);
  const seekHandlerRef = useRef({ drag: (_pageX: number) => {}, commit: async () => {} });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: (e) => {
        seekingRef.current = true;
        trackViewRef.current?.measure((_x, _y, _w, _h, px) => { trackPageXRef.current = px; });
        seekHandlerRef.current.drag(e.nativeEvent.pageX);
      },
      onPanResponderMove: (_e, gs) => { seekHandlerRef.current.drag(gs.moveX); },
      onPanResponderRelease: () => seekHandlerRef.current.commit(),
      onPanResponderTerminate: () => { seekingRef.current = false; },
    })
  ).current;

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
        if (sound && playback.duration > 0) await sound.setPositionAsync(seekPendingRef.current);
      } finally {
        seekingRef.current = false;
      }
    },
  };

  useEffect(() => {
    return () => { sound?.unloadAsync(); };
  }, [sound]);

  useEffect(() => {
    if (!audioB64) return;
    async function load() {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${audioB64}` },
        { shouldPlay: false }
      );
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (!seekingRef.current) {
          setPlayback({ position: status.positionMillis ?? 0, duration: status.durationMillis ?? 0 });
          setPlaying(status.isPlaying);
        }
        if (status.didJustFinish) {
          setPlaying(false);
          newSound.setPositionAsync(0).catch(() => {});
        }
      });
      newSound.getStatusAsync().then((status) => {
        if (status.isLoaded && status.durationMillis)
          setPlayback({ position: 0, duration: status.durationMillis });
      }).catch(() => {});
      setSound(newSound);
    }
    load().catch(() => {});
  }, [audioB64]);

  async function togglePlayback() {
    if (audioBusy || !sound) return;
    setAudioBusy(true);
    try {
      if (playing) { await sound.pauseAsync(); setPlaying(false); }
      else { await sound.playAsync(); setPlaying(true); }
    } finally {
      setAudioBusy(false);
    }
  }

  return (
    <View>
      <View
        ref={trackViewRef}
        style={S.progressTrack}
        onLayout={(e) => {
          setTrackWidth(e.nativeEvent.layout.width);
          trackViewRef.current?.measure((_x, _y, _w, _h, px) => { trackPageXRef.current = px; });
        }}
        {...panResponder.panHandlers}
      >
        <View style={S.progressFill}>
          <View style={[S.progressFilled, {
            width: playback.duration > 0
              ? `${(playback.position / playback.duration) * 100}%` as any
              : 0,
          }]} />
        </View>
        <View style={[S.progressThumb, {
          left: trackWidth > 0 && playback.duration > 0
            ? Math.min((playback.position / playback.duration) * trackWidth - 7, trackWidth - 14)
            : -7,
        }]} />
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
          <Ionicons name={playing ? "pause" : "play"} size={16} color={C.bg} />
          <Text style={S.playBtnText}>{playing ? "PAUSE" : "PLAY PODCAST"}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: Colors) {
  return StyleSheet.create({
    progressTrack: { height: 44, justifyContent: "center" as const, marginBottom: 4 },
    progressFill: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" as const },
    progressFilled: { height: 4, backgroundColor: C.text, borderRadius: 2 },
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
  });
}
