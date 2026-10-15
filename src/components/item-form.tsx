import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { NewCabinetItem } from '@/db/cabinet';
import { formatExpiry, parseExpiryInput } from '@/lib/expiry';

type Props = {
  initial: NewCabinetItem;
  /** Items from SÚKL keep their official name; custom items can be renamed. */
  nameEditable: boolean;
  submitTitle: string;
  onSubmit: (item: NewCabinetItem) => Promise<void>;
};

export function ItemForm({ initial, nameEditable, submitTitle, onSubmit }: Props) {
  const [name, setName] = useState(initial.name);
  const [expiry, setExpiry] = useState(initial.expiresOn ? formatExpiry(initial.expiresOn) : '');
  const [lot, setLot] = useState(initial.lot ?? '');
  const [note, setNote] = useState(initial.note ?? '');
  const [saving, setSaving] = useState(false);

  const expiresOn = expiry.trim() ? parseExpiryInput(expiry) : null;
  const expiryInvalid = expiry.trim() !== '' && expiresOn === null;
  const canSave = name.trim() !== '' && !expiryInvalid;

  async function submit() {
    setSaving(true);
    try {
      await onSubmit({
        ...initial,
        name: name.trim(),
        expiresOn,
        lot: lot.trim() || null,
        note: note.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      {nameEditable && <TextField label="Název" value={name} onChangeText={setName} />}
      <TextField
        label="Použitelné do (EXP)"
        placeholder="MM/RRRR"
        keyboardType="numbers-and-punctuation"
        value={expiry}
        onChangeText={setExpiry}
      />
      {expiryInvalid && (
        <ThemedText type="small" themeColor="danger">
          Zadejte datum jako 08/2027 nebo 15.8.2027
        </ThemedText>
      )}
      <TextField label="Šarže (LOT)" autoCapitalize="characters" value={lot} onChangeText={setLot} />
      <TextField label="Poznámka" placeholder="Např. pro děti, otevřeno 1. 10." value={note} onChangeText={setNote} />
      <Button title={submitTitle} onPress={submit} disabled={!canSave} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
});
