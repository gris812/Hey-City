import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { LiveScreen } from './src/screens/LiveScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { initialRouteForSession } from './src/context/appIdentity';
import { colors } from './src/theme';
import { useAppTranslation } from './src/localization';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, color }: { name: string; color: string }) {
  if (name === 'Explore') {
    return (
      <View style={styles.exploreIcon}>
        <View style={[styles.exploreIconRing, { borderColor: color }]} />
        <View style={[styles.exploreIconLine, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'Stories') {
    return (
      <View style={[styles.storyIcon, { borderColor: color }]}>
        <View style={[styles.storyIconLine, { backgroundColor: color }]} />
      </View>
    );
  }

  return (
    <View style={styles.settingsIcon}>
      <View style={[styles.settingsDot, { backgroundColor: color }]} />
      <View style={[styles.settingsDot, { backgroundColor: color }]} />
      <View style={[styles.settingsDot, { backgroundColor: color }]} />
    </View>
  );
}

function MainTabs() {
  const { t } = useAppTranslation();
  return (
    <Tab.Navigator
      initialRouteName="Explore"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primaryOrange,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
        tabBarStyle: {
          minHeight: 70,
          paddingTop: 8,
          paddingBottom: 12,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen name="Explore" component={LiveScreen} options={{ title: t('tabs.explore') }} />
      <Tab.Screen name="Stories" component={HistoryScreen} options={{ title: t('tabs.history') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t('tabs.settings') }} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { identity, preferences } = useAuth();
  const initialRouteName = initialRouteForSession(
    identity,
    preferences.onboardingCompleted,
    preferences.showOnboardingAtLaunch
  );

  if (!initialRouteName) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  exploreIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreIconRing: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  exploreIconLine: {
    position: 'absolute',
    width: 1.5,
    height: 24,
    transform: [{ rotate: '45deg' }],
  },
  storyIcon: {
    width: 21,
    height: 15,
    borderWidth: 1.8,
    borderRadius: 2,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  storyIconLine: {
    height: 1.5,
    borderRadius: 1,
  },
  settingsIcon: {
    width: 24,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  settingsDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
