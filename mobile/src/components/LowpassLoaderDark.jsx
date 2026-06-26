import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle, Path, G } from "react-native-svg";

const AMBER = "#F5B82E";
const INK = "#FFFFFF";
const DOT_ALPHA = 0.5;
const LABEL_COLOR = "#9B9B95";

const DEFAULT_PHRASES = [
  "reading the discussion…",
  "filtering the noise…",
  "finding the signal…",
  "writing the script…",
];

function SpinArc({ radius, strokeWidth }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const circ = 2 * Math.PI * radius;
  const pad = strokeWidth;
  const box = (radius + pad) * 2;
  const c = radius + pad;
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Svg width={box} height={box} viewBox={`0 0 ${box} ${box}`}>
        <Circle cx={c} cy={c} r={radius} fill="none" stroke={AMBER} strokeWidth={strokeWidth}
          strokeDasharray={`${circ * 0.65} ${circ * 0.35}`} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/**
 * Props:
 *   size       number   — size in px. Default 200.
 *   showLabel  boolean  — show cycling status text below. Default true.
 *   phrases    string[] — cycling phrases while loading.
 *   compact    boolean  — small spinning arc only, for use inside buttons.
 */
export default function LowpassLoaderDark({
  size = 200,
  showLabel = true,
  phrases = DEFAULT_PHRASES,
  compact = false,
}) {
  const [particles, setParticles] = useState([]);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const particleIdRef = useRef(0);
  const particlesRef = useRef([]);

  const S = size / 1024;
  const mouthL  = 246 * S;
  const mouthR  = 842 * S;
  const mouthY  = 516 * S;
  const neckX   = 542 * S;
  const neckY   = 910 * S;
  const dotR    = 38  * S;
  const dotCx   = 540 * S;
  const dotCy   = 970 * S;

  useEffect(() => {
    if (compact) return;

    function triggerPulse() {
      pulseAnim.setValue(1.55);
      Animated.spring(pulseAnim, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }).start();
    }

    function spawnParticle() {
      if (particlesRef.current.length >= 5) return;
      const id = ++particleIdRef.current;
      const r = (13 + Math.random() * 9) * S;
      const startX = mouthL + Math.random() * (mouthR - mouthL);
      const startY = (300 + Math.random() * 170) * S;
      const progress = new Animated.Value(0);
      const particle = { id, startX, startY, r, progress };
      particlesRef.current = [...particlesRef.current, particle];
      setParticles([...particlesRef.current]);

      Animated.timing(progress, {
        toValue: 1,
        duration: 900 + Math.random() * 500,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          triggerPulse();
          particlesRef.current = particlesRef.current.filter(p => p.id !== id);
          setParticles([...particlesRef.current]);
        }
      });
    }

    const interval = setInterval(spawnParticle, 650);
    return () => clearInterval(interval);
  }, [compact]);

  useEffect(() => {
    if (compact) return;
    const id = setInterval(() => setPhraseIdx(i => (i + 1) % phrases.length), 2200);
    return () => clearInterval(id);
  }, [compact, phrases]);

  if (compact) return <SpinArc radius={8} strokeWidth={2} />;

  const containerH = dotCy + dotR * 2.2;

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: size, height: containerH }}>

        {/* Funnel SVG — amber dot intentionally omitted; drawn separately so it can animate */}
        <Svg width={size} height={size} viewBox="0 0 1024 1024" style={{ position: "absolute", top: 0, left: 0 }}>
          <G fill={INK} opacity={DOT_ALPHA}>
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
            fill="none" stroke={INK} strokeWidth={44}
            strokeLinejoin="round" strokeLinecap="round"
          />
        </Svg>

        {/* Falling particles */}
        {particles.map(p => {
          const tx = p.progress.interpolate({
            inputRange: [0, 0.4, 1],
            outputRange: [0, 0, neckX - p.startX],
            extrapolate: "clamp",
          });
          const ty = p.progress.interpolate({
            inputRange: [0, 0.4, 1],
            outputRange: [0, mouthY - p.startY, neckY - p.startY],
            extrapolate: "clamp",
          });
          const sc = p.progress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [1, 0.8, 0.08],
            extrapolate: "clamp",
          });
          const op = p.progress.interpolate({
            inputRange: [0, 0.06, 0.78, 1],
            outputRange: [0, DOT_ALPHA + 0.12, DOT_ALPHA, 0],
            extrapolate: "clamp",
          });
          return (
            <Animated.View
              key={p.id}
              style={{
                position: "absolute",
                left: p.startX - p.r,
                top: p.startY - p.r,
                width: p.r * 2,
                height: p.r * 2,
                borderRadius: p.r,
                backgroundColor: INK,
                opacity: op,
                transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
              }}
            />
          );
        })}

        {/* Amber output dot — pulses when a particle arrives */}
        <Animated.View
          style={{
            position: "absolute",
            left: dotCx - dotR,
            top: dotCy - dotR,
            width: dotR * 2,
            height: dotR * 2,
            borderRadius: dotR,
            backgroundColor: AMBER,
            transform: [{ scale: pulseAnim }],
          }}
        />
      </View>

      {showLabel && (
        <Text style={{ marginTop: 14, fontSize: 13, color: LABEL_COLOR }}>
          {phrases[phraseIdx]}
        </Text>
      )}
    </View>
  );
}
