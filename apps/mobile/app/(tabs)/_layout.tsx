import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { theme } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textMuted,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Kaart',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🗺️</Text>,
        }}
      />
      <Tabs.Screen
        name="mine"
        options={{
          title: 'Mijn meldingen',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📍</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Instellingen',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
