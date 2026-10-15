import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';

import { referenceDbName, removeOutdatedReferenceDb } from '@/db/cabinet';
import { configureReminders } from '@/lib/reminders';

configureReminders();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* First launch copies the bundled SÚKL database out of the app package, which takes a moment. */}
      <Suspense fallback={<Loading />}>
        <SQLiteProvider
          databaseName={referenceDbName}
          assetSource={{ assetId: require('@/assets/db/sukl.db') }}
          onInit={removeOutdatedReferenceDb}
          useSuspense>
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="add" options={{ presentation: 'modal', title: 'Přidat lék' }} />
            <Stack.Screen name="item/[id]" options={{ title: '' }} />
            <Stack.Screen name="product/[sukl]" options={{ title: '' }} />
            <Stack.Screen name="symptom/[id]" options={{ title: '' }} />
          </Stack>
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
