import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ProductInfo, useProduct } from '@/components/product-info';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export default function ProductScreen() {
  const { sukl } = useLocalSearchParams<{ sukl: string }>();
  const product = useProduct(sukl);
  if (!product) return null;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">{product.name}</ThemedText>
        <ThemedText themeColor="textSecondary">{product.supplement}</ThemedText>
        <Button
          title="Přidat do lékárničky"
          onPress={() => router.push({ pathname: '/add', params: { sukl: product.sukl } })}
        />
        <ProductInfo product={product} />
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
