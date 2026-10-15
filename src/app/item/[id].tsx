import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';

import { ItemForm } from '@/components/item-form';
import { ProductInfo, useProduct } from '@/components/product-info';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, ExpiryBadge } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { deleteItem, getItem, updateItem, type CabinetItem, type NewCabinetItem } from '@/db/cabinet';
import { cancelReminders, rescheduleReminders } from '@/lib/reminders';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<CabinetItem | null>(null);
  const product = useProduct(item?.sukl);

  useEffect(() => {
    getItem(Number(id)).then(setItem);
  }, [id]);

  if (!item) return null;

  async function save(changes: NewCabinetItem) {
    await updateItem(item!.id, changes);
    const saved = await getItem(item!.id);
    if (saved) {
      await rescheduleReminders(saved);
      setItem(saved);
    }
    router.back();
  }

  function confirmDelete() {
    Alert.alert('Odstranit z lékárničky?', item!.name, [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Odstranit',
        style: 'destructive',
        onPress: async () => {
          await cancelReminders(item!);
          await deleteItem(item!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: item.name }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">{item.name}</ThemedText>
        {item.detail && <ThemedText themeColor="textSecondary">{item.detail}</ThemedText>}
        <ExpiryBadge expiresOn={item.expiresOn} />

        {/* key: remount the form with fresh values after a save */}
        <ItemForm
          key={`${item.expiresOn}-${item.lot}-${item.note}`}
          initial={item}
          nameEditable={!item.sukl}
          submitTitle="Uložit změny"
          onSubmit={save}
        />

        {product && <ProductInfo product={product} />}

        <Button title="Odstranit z lékárničky" variant="danger" onPress={confirmDelete} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
});
