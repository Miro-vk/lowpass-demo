import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LowpassIcon from "../components/LowpassIcon";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

const C = { bg: "#F5F4EF", white: "#FFFFFF", black: "#0A0A0A", muted: "#888" };

export default function LoginScreen({ navigation }: any) {
  const { setToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) return Alert.alert("Fill in both fields");
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setToken(res.access_token);
    } catch (e: any) {
      Alert.alert("Login failed", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          <View style={styles.logo}>
            <LowpassIcon size={72} />
            <Text style={styles.logoText}>LOWPASS</Text>
          </View>

          <Text style={styles.tagline}>Filter the noise.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>EMAIL</Text>
            <View style={styles.inputShadow}>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.inputShadow}>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={C.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleLogin}
                returnKeyType="go"
              />
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={C.bg} />
                : <Text style={styles.btnText}>LOG IN</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.switchText}>
              No account? <Text style={styles.switchLink}>Sign up</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },

  logo: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  logoText: { fontSize: 32, fontWeight: "900", color: C.black, letterSpacing: 6 },
  tagline: { fontSize: 14, color: C.muted, letterSpacing: 1, marginBottom: 48 },

  form: { marginBottom: 32 },
  label: {
    fontSize: 11, fontWeight: "900", color: C.black,
    letterSpacing: 2, marginBottom: 6, marginTop: 16,
  },
  inputShadow: {
    shadowColor: C.black, shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 4,
  },
  input: {
    backgroundColor: C.white, borderWidth: 2, borderColor: C.black,
    padding: 16, fontSize: 15, color: C.black,
  },
  btn: {
    backgroundColor: C.black, borderWidth: 2, borderColor: C.black,
    padding: 16, alignItems: "center", marginTop: 24,
    shadowColor: C.black, shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: C.bg, fontWeight: "900", fontSize: 14, letterSpacing: 2 },

  switchText: { textAlign: "center", color: C.muted, fontSize: 14 },
  switchLink: { color: C.black, fontWeight: "700", textDecorationLine: "underline" },
});
