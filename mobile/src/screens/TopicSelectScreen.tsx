import React, { useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import LowpassIcon from "../components/LowpassIcon";

const { width: W } = Dimensions.get("window");
const GUTTER = 20;
const GAP = 12;
const COL_WIDTH = (W - GUTTER * 2 - GAP) / 2;

const CATEGORIES = [
  { id: "WHATS_HOT", label: "WHAT'S HOT" },
  { id: "TECH",     label: "TECH" },
  { id: "BUSINESS", label: "BUSINESS" },
  { id: "WORLD",    label: "WORLD" },
  { id: "SCIENCE",  label: "SCIENCE" },
  { id: "CULTURE",  label: "CULTURE" },
  { id: "SPORTS",   label: "SPORTS" },
];

export default function TopicSelectScreen({ navigation }: any) {
  const { isDark, C } = useTheme();
  const S = makeStyles(C);

  const anims = useRef(CATEGORIES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      70,
      anims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, []);

  function goTo(categoryId: string) {
    navigation.navigate("CardSwipe", { category: categoryId });
  }

  const [hotCat, ...gridCats] = CATEGORIES;

  return (
    <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
      <View style={S.inner}>

        <View style={S.hero}>
          <View style={S.logoRow}>
            <LowpassIcon size={48} isDark={isDark} />
            <Text style={S.title}>LOWPASS</Text>
          </View>
          <Text style={S.motto}>FILTER THE NOISE</Text>
        </View>

        <Text style={S.chooseLabel}>CHOOSE YOUR TOPIC</Text>

        {/* WHAT'S HOT — full width, inverted */}
        <Animated.View
          style={{
            opacity: anims[0],
            transform: [{ translateY: anims[0].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}
        >
          <TouchableOpacity
            style={S.hotBtn}
            onPress={() => goTo(hotCat.id)}
            activeOpacity={0.8}
          >
            <Text style={S.hotLabel}>{hotCat.label}</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* 2-column grid */}
        <View style={S.grid}>
          {gridCats.map((cat, i) => (
            <Animated.View
              key={cat.id}
              style={{
                opacity: anims[i + 1],
                transform: [{ translateY: anims[i + 1].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
              }}
            >
              <TouchableOpacity
                style={S.btn}
                onPress={() => goTo(cat.id)}
                activeOpacity={0.8}
              >
                <Text style={S.btnLabel}>{cat.label}</Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    inner: { flex: 1, paddingHorizontal: GUTTER, paddingTop: 32 },

    hero: { marginBottom: 48 },
    logoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
    title: { fontSize: 28, fontWeight: "900", color: C.text, letterSpacing: 5 },
    motto: { fontSize: 11, fontWeight: "900", color: C.muted, letterSpacing: 3 },

    chooseLabel: {
      fontSize: 10, fontWeight: "900", color: C.muted,
      letterSpacing: 2, marginBottom: 12,
    },

    hotBtn: {
      backgroundColor: C.text,
      borderWidth: 2,
      borderColor: C.border,
      padding: 20,
      alignItems: "center",
      shadowColor: C.text,
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 4,
      marginBottom: GAP,
    },
    hotLabel: {
      fontSize: 15, fontWeight: "900", color: C.bg, letterSpacing: 3,
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GAP,
    },
    btn: {
      width: COL_WIDTH,
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: C.border,
      padding: 20,
      alignItems: "center",
      shadowColor: C.text,
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 4,
    },
    btnLabel: {
      fontSize: 13, fontWeight: "900", color: C.text, letterSpacing: 2,
    },
  });
}
