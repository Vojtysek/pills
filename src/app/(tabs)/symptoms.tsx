import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Row, TextField } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { SYMPTOMS } from '@/data/symptoms';
import { normalize } from '@/lib/text';

export default function SymptomsScreen() {
  const [query, setQuery] = useState('');
  const q = normalize(query);
  const symptoms = q
    ? SYMPTOMS.filter((s) => [s.label, ...s.keywords].some((text) => normalize(text).includes(q)))
    : SYMPTOMS;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          Co mě trápí
        </ThemedText>
        <TextField placeholder="Např. hlava, kašel, průjem" value={query} onChangeText={setQuery} />
        <FlatList
          data={symptoms}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Row title={item.label} onPress={() => router.push({ pathname: '/symptom/[id]', params: { id: item.id } })} />
          )}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary">Nic jsme nenašli. Zkuste jiné slovo.</ThemedText>
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
    gap: Spacing.three,
  },
  title: {
    paddingTop: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
  },
});
