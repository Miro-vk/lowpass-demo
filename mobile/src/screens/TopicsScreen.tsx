import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
} from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

type Topic = { id: string; query: string; focus: string };

export default function TopicsScreen({ navigation }: any) {
  const { token, setToken } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTopics = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getTopics(token);
      setTopics(data);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  }, [token]);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  async function handleAdd() {
    if (!query.trim()) return Alert.alert("Enter a topic query");
    setLoading(true);
    try {
      await api.addTopic(token!, query.trim(), focus.trim());
      setQuery("");
      setFocus("");
      loadTopics();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert("Remove topic?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try {
            await api.deleteTopic(token!, id);
            loadTopics();
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Topics</Text>
        <TouchableOpacity onPress={() => setToken(null)}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Topic (e.g. AI safety)"
          value={query}
          onChangeText={setQuery}
        />
        <TextInput
          style={styles.input}
          placeholder="Focus (optional)"
          value={focus}
          onChangeText={setFocus}
        />
        <TouchableOpacity style={styles.button} onPress={handleAdd} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add topic</Text>}
        </TouchableOpacity>
      </View>

      <FlatList
        data={topics}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadTopics} />}
        ListEmptyComponent={<Text style={styles.empty}>No topics yet. Add one above.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowQuery}>{item.query}</Text>
              {item.focus ? <Text style={styles.rowFocus}>{item.focus}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id)}>
              <Text style={styles.delete}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.digestButton}
        onPress={() => navigation.navigate("Digest")}
      >
        <Text style={styles.buttonText}>Run digest →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "700" },
  logout: { color: "#888", fontSize: 14 },
  form: { marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 8,
    padding: 12, marginBottom: 8, fontSize: 15,
  },
  button: { backgroundColor: "#000", borderRadius: 8, padding: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  empty: { textAlign: "center", color: "#aaa", marginTop: 32 },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0",
  },
  rowText: { flex: 1 },
  rowQuery: { fontSize: 15, fontWeight: "600" },
  rowFocus: { fontSize: 13, color: "#888", marginTop: 2 },
  delete: { fontSize: 18, color: "#ccc", paddingHorizontal: 8 },
  digestButton: {
    backgroundColor: "#000", borderRadius: 8,
    padding: 14, alignItems: "center", marginTop: 16,
  },
});
