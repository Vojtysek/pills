import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ExpiryBadge, Row, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { SYMPTOMS } from '@/data/symptoms';
import { listItemsForAtc, type CabinetItem } from '@/db/cabinet';
import { getOtcProductsForAtc, useReferenceDb, type ProductSummary } from '@/db/reference';
import { expiryStatus } from '@/lib/expiry';

export default function SymptomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const symptom = SYMPTOMS.find((s) => s.id === id);
  const db = useReferenceDb();
  const [atHome, setAtHome] = useState<CabinetItem[]>([]);
  const [otc, setOtc] = useState<ProductSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!symptom) return;
      listItemsForAtc(symptom.atcPrefixes).then(setAtHome);
      getOtcProductsForAtc(db, symptom.atcPrefixes).then(setOtc);
    }, [db, symptom])
  );

  if (!symptom) return null;
  const usable = atHome.filter((i) => expiryStatus(i.expiresOn) !== 'expired');
  const expired = atHome.filter((i) => expiryStatus(i.expiresOn) === 'expired');

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: symptom.label }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Přehled podle skupin léčiv (ATC), ne lékařská rada. Vždy si přečtěte příbalovou informaci a při
          vážných nebo přetrvávajících potížích se obraťte na lékaře nebo lékárníka.
        </ThemedText>

        <SectionTitle>Doma máte</SectionTitle>
        {usable.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Nic vhodného v lékárničce nemáte.
          </ThemedText>
        )}
        {usable.map((item) => (
          <Row
            key={item.id}
            title={item.name}
            subtitle={item.detail}
            right={<ExpiryBadge expiresOn={item.expiresOn} />}
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
          />
        ))}

        {expired.length > 0 && (
          <>
            <SectionTitle>Doma, ale prošlé</SectionTitle>
            {expired.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                subtitle={item.detail}
                right={<ExpiryBadge expiresOn={item.expiresOn} />}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              />
            ))}
          </>
        )}

        <SectionTitle>Volně prodejné v lékárně</SectionTitle>
        {otc.map((p) => (
          <Row
            key={p.sukl}
            title={p.name}
            onPress={() => router.push({ pathname: '/product/[sukl]', params: { sukl: p.sukl } })}
          />
        ))}
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
    gap: Spacing.two,
  },
});
