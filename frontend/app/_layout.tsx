import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function RootLayout() {
  // Menus are portrait; the game screen switches to landscape while it's open
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#1a1a2e' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="select-pen" />
        <Stack.Screen name="game" />
        <Stack.Screen name="how-to-play" />
      </Stack>
    </>
  );
}
