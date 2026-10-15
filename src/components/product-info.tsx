import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getProduct, leafletUrl, useReferenceDb, type ProductDetail } from '@/db/reference';

export function useProduct(sukl: string | null | undefined): ProductDetail | null {
  const db = useReferenceDb();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  useEffect(() => {
    if (!sukl) return;
    let active = true;
    getProduct(db, sukl).then((p) => active && setProduct(p));
    return () => {
      active = false;
    };
  }, [db, sukl]);
  return sukl ? product : null;
}

export function ProductInfo({ product }: { product: ProductDetail }) {
  return (
    <View style={styles.container}>
      <SectionTitle>Složení</SectionTitle>
      {product.ingredients.length > 0 ? (
        product.ingredients.map((i, index) => (
          <ThemedText key={index} type="small">
            {i.name}
            {i.amount ? ` — ${i.amount} ${i.unit ?? ''}` : ''}
          </ThemedText>
        ))
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Neuvedeno
        </ThemedText>
      )}

      <SectionTitle>O přípravku</SectionTitle>
      <Fact label="Skupina" value={product.atcName && `${product.atcName} (${product.atc})`} />
      <Fact label="Léková forma" value={product.formName} />
      <Fact label="Podání" value={product.routeName} />
      <Fact label="Výdej" value={product.dispensingName} />
      <Fact label="Držitel registrace" value={product.holderName} />
      <Fact label="Kód SÚKL" value={product.sukl} />

      <View style={styles.leaflet}>
        <Button
          title="Příbalová informace (PDF)"
          variant="secondary"
          onPress={() => WebBrowser.openBrowserAsync(leafletUrl(product.sukl))}
        />
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <ThemedText type="small">
      <ThemedText type="small" themeColor="textSecondary">
        {label}:{' '}
      </ThemedText>
      {value}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  leaflet: {
    marginTop: Spacing.three,
  },
});
