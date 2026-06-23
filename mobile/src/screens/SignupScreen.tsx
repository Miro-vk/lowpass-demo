import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LowpassIcon from "../components/LowpassIcon";
import { api } from "../api";
import { useTheme, Colors } from "../context/ThemeContext";

export default function SignupScreen({ navigation }: any) {
  const { isDark, C } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const S = makeStyles(C);

  async function handleSignup() {
    if (!email || !password) return Alert.alert("Fill in both fields");
    if (password.length < 6) return Alert.alert("Password must be at least 6 characters");
    setLoading(true);
    try {
      await api.signup(email, password);
      Alert.alert(
        "Check your email",
        "We sent a confirmation link. Tap it, then come back to log in.",
        [{ text: "OK", onPress: () => navigation.navigate("Login") }]
      );
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={S.container} keyboardShouldPersistTaps="handled">

          <View style={S.logo}>
            <LowpassIcon size={72} isDark={isDark} />
            <Text style={S.logoText}>LOWPASS</Text>
          </View>
          <Text style={S.tagline}>Cut through the noise.</Text>

          <View style={S.form}>
            <Text style={S.label}>EMAIL</Text>
            <View style={S.inputShadow}>
              <TextInput
                style={S.input}
                placeholder="you@example.com"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <Text style={S.label}>PASSWORD</Text>
            <View style={S.inputShadow}>
              <TextInput
                style={S.input}
                placeholder="min. 6 characters"
                placeholderTextColor={C.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleSignup}
                returnKeyType="go"
              />
            </View>

            <TouchableOpacity
              style={[S.btn, loading && S.btnDisabled]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={C.bg} /> : <Text style={S.btnText}>CREATE ACCOUNT</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={S.switchText}>
              Already have an account? <Text style={S.switchLink}>Log in</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(C: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },

    logo: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
    logoText: { fontSize: 32, fontWeight: "900", color: C.text, letterSpacing: 6 },
    tagline: { fontSize: 14, color: C.muted, letterSpacing: 1, marginBottom: 48 },

    form: { marginBottom: 32 },
    label: { fontSize: 11, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 6, marginTop: 16 },
    inputShadow: {
      shadowColor: C.text, shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1, shadowRadius: 0, elevation: 4,
    },
    input: {
      backgroundColor: C.card, borderWidth: 2, borderColor: C.border,
      padding: 16, fontSize: 15, color: C.text,
    },
    btn: {
      backgroundColor: C.text, borderWidth: 2, borderColor: C.text,
      padding: 16, alignItems: "center", marginTop: 24,
      shadowColor: C.text, shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1, shadowRadius: 0, elevation: 4,
    },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: C.bg, fontWeight: "900", fontSize: 14, letterSpacing: 2 },

    switchText: { textAlign: "center", color: C.muted, fontSize: 14 },
    switchLink: { color: C.text, fontWeight: "700", textDecorationLine: "underline" },
  });
}
