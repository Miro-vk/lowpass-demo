import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { HistoryProvider } from "./src/context/HistoryContext";

import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import DigestScreen from "./src/screens/DigestScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import CardSwipeScreen from "./src/screens/CardSwipeScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const C = { bg: "#F5F4EF", black: "#0A0A0A", muted: "#888" };

function TabBar({ state, navigation }: any) {
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
      <Tab.Screen name="Search" component={DigestScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}

function Navigator() {
  const { token } = useAuth();
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
    <AuthProvider>
      <HistoryProvider>
        <Navigator />
      </HistoryProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: C.bg,
    borderTopWidth: 2,
    borderTopColor: C.black,
    paddingBottom: 28,
    paddingTop: 0,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
  },
  tabActive: {
    backgroundColor: C.black,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: C.muted,
    letterSpacing: 2,
  },
  tabLabelActive: {
    color: C.bg,
  },
});
