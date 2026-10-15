import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ItemForm } from '@/components/item-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row, SectionTitle, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addItem, getItem, type NewCabinetItem } from '@/db/cabinet';
import { searchProducts, useReferenceDb, type ProductSummary } from '@/db/reference';
import { rescheduleReminders } from '@/lib/reminders';

type Selection = { product: ProductSummary } | { custom: string };

export default function AddScreen() {
  const { sukl } = useLocalSearchParams<{ sukl?: string }>();
  const db = useReferenceDb();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Opened from a product page: skip straight to the details.
  useEffect(() => {
    if (!sukl) return;
    db.getFirstAsync<ProductSummary>(
      'SELECT sukl, name, supplement, atc, otc, marketed FROM product WHERE sukl = ?',
      [sukl]
    ).then((product) => product && setSelection({ product }));
  }, [db, sukl]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      searchProducts(db, query).then((rows) => active && setResults(rows));
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [db, query]);

  async function save(item: NewCabinetItem) {
    const id = await addItem(item);
    const saved = await getItem(id);
    if (saved) await rescheduleReminders(saved);
    router.back();
  }

  if (selection) {
    const initial: NewCabinetItem =
      'product' in selection
        ? {
            sukl: selection.product.sukl,
            name: selection.product.name,
            detail: selection.product.supplement,
            atc: selection.product.atc,
            expiresOn: null,
            lot: null,
            note: null,
          }
        : { sukl: null, name: selection.custom, detail: null, atc: null, expiresOn: null, lot: null, note: null };
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <ThemedText type="subtitle">{initial.name || 'Vlastní položka'}</ThemedText>
          {initial.detail && <ThemedText themeColor="textSecondary">{initial.detail}</ThemedText>}
          {'custom' in selection && (
            <ThemedText type="small" themeColor="textSecondary">
              Mimo databázi SÚKL (např. doplněk stravy nebo zdravotnická pomůcka) — nebude ve vyhledávání podle potíží.
            </ThemedText>
          )}
          <ItemForm
            initial={initial}
            nameEditable={'custom' in selection}
            submitTitle="Uložit do lékárničky"
            onSubmit={save}
          />
          <Button title="Zpět na výběr" variant="secondary" onPress={() => setSelection(null)} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={results}
        keyExtractor={(p) => p.sukl}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <TextField
              label="Název léku nebo účinná látka"
              placeholder="Např. Hylak, Paralen, ibuprofen"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoFocus
            />
            {results.length > 0 && <SectionTitle>Výsledky hledání</SectionTitle>}
          </View>
        }
        renderItem={({ item }) => (
          <Row
            title={item.name}
            subtitle={[item.supplement, item.marketed ? null : 'aktuálně se nedodává'].filter(Boolean).join(' · ')}
            onPress={() => setSelection({ product: item })}
          />
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              title="Není v seznamu — přidat vlastní"
              variant="secondary"
              onPress={() => setSelection({ custom: query.trim() })}
            />
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  footer: {
    marginTop: Spacing.three,
  },
});
