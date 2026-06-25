import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { HistoryProvider } from "./src/context/HistoryContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { VoiceProvider } from "./src/context/VoiceContext";

import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import CardSwipeScreen from "./src/screens/CardSwipeScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabBar({ state, navigation }: any) {
  const { C } = useTheme();
  const styles = makeTabStyles(C);
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route: any, index: number) => {
        const focused = state.index === index;
        return (
          <View key={route.key} style={[styles.tab, focused && styles.tabActive]}>
            <Text
              style={[styles.tabLabel, focused && styles.tabLabelActive]}
              onPress={() => navigation.navigate(route.name)}
            >
              {route.name.toUpperCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Cards" component={CardSwipeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function Navigator() {
  const { token, loading } = useAuth();
  const { C } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={C.text} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <VoiceProvider>
        <AuthProvider>
          <HistoryProvider>
            <Navigator />
          </HistoryProvider>
        </AuthProvider>
      </VoiceProvider>
    </ThemeProvider>
  );
}

function makeTabStyles(C: any) {
  return StyleSheet.create({
    tabBar: {
      flexDirection: "row",
      backgroundColor: C.bg,
      borderTopWidth: 2,
      borderTopColor: C.border,
      paddingBottom: 28,
      paddingTop: 0,
    },
    tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
    tabActive: { backgroundColor: C.text },
    tabLabel: { fontSize: 11, fontWeight: "900", color: C.muted, letterSpacing: 2 },
    tabLabelActive: { color: C.bg },
  });
}
