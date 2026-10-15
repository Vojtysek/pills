import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, ExpiryBadge, Row } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { listItems, type CabinetItem } from '@/db/cabinet';
import { expiryStatus } from '@/lib/expiry';

export default function CabinetScreen() {
  const [items, setItems] = useState<CabinetItem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listItems().then(setItems);
    }, [])
  );

  const expired = items?.filter((i) => expiryStatus(i.expiresOn) === 'expired').length ?? 0;
  const soon = items?.filter((i) => expiryStatus(i.expiresOn) === 'soon').length ?? 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Lékárnička</ThemedText>
          <Button title="+ Přidat" onPress={() => router.push('/add')} />
        </View>

        {(expired > 0 || soon > 0) && (
          <ThemedText type="small" themeColor="textSecondary">
            {[expired > 0 && `Prošlé: ${expired}`, soon > 0 && `Brzy projde: ${soon}`].filter(Boolean).join(' · ')}
          </ThemedText>
        )}

        <FlatList
          data={items ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Row
              title={item.name}
              subtitle={item.detail}
              right={<ExpiryBadge expiresOn={item.expiresOn} />}
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            items ? (
              <View style={styles.empty}>
                <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                  Lékárnička je prázdná. Přidejte první lék — vyhledejte ho podle názvu nebo účinné látky.
                </ThemedText>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  empty: {
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  emptyText: {
    textAlign: 'center',
  },
});
