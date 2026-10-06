import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime, parseTime } from '../dates';
import { useTheme } from '../theme';
import { Button } from './ui';

type Props = {
  visible: boolean;
  title: string;
  value?: string;
  onSave: (time: string) => void;
  onRemove?: () => void;
  onClose: () => void;
};

const PRESETS = ['07:00', '09:00', '12:00', '15:00', '18:00', '20:00', '22:00'];

export function TimePicker({ visible, title, value, onSave, onRemove, onClose }: Props) {
  const t = useTheme();
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (!visible) return;
    if (value) {
      const p = parseTime(value);
      setHour(p.hour);
      setMinute(p.minute - (p.minute % 5));
    } else {
      // По умолчанию — ближайший следующий час.
      setHour((new Date().getHours() + 1) % 24);
      setMinute(0);
    }
  }, [visible, value]);

  const stepper = (val: number, set: (n: number) => void, step: number, mod: number) => (
    <View style={styles.col}>
      <Pressable hitSlop={8} onPress={() => set((val + step) % mod)} style={[styles.arrow, { backgroundColor: t.accentSoft }]}>
        <Text style={[styles.arrowText, { color: t.accent }]}>▲</Text>
      </Pressable>
      <Text style={[styles.digits, { color: t.text }]}>{String(val).padStart(2, '0')}</Text>
      <Pressable hitSlop={8} onPress={() => set((val - step + mod) % mod)} style={[styles.arrow, { backgroundColor: t.accentSoft }]}>
        <Text style={[styles.arrowText, { color: t.accent }]}>▼</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.card }]} onPress={() => {}}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          <View style={styles.pickers}>
            {stepper(hour, setHour, 1, 24)}
            <Text style={[styles.digits, { color: t.text }]}>:</Text>
            {stepper(minute, setMinute, 5, 60)}
          </View>
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <Pressable
                key={p}
                onPress={() => {
                  const x = parseTime(p);
                  setHour(x.hour);
                  setMinute(x.minute);
                }}
                style={[styles.preset, { backgroundColor: t.accentSoft }]}
              >
                <Text style={{ color: t.accent, fontWeight: '600' }}>{p}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <Button label="Сохранить" onPress={() => onSave(formatTime(hour, minute))} />
            {onRemove ? <Button label="Без напоминания" kind="secondary" onPress={onRemove} /> : null}
            <Button label="Отмена" kind="danger" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 20, padding: 20 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  pickers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  col: { alignItems: 'center', gap: 6 },
  arrow: { width: 64, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 18 },
  digits: { fontSize: 44, fontWeight: '700', fontVariant: ['tabular-nums'] },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginVertical: 16 },
  preset: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  actions: { gap: 8 },
});
