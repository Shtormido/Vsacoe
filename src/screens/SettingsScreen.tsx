import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Mascot } from '../components/Mascot';
import { TimePicker } from '../components/TimePicker';
import { Button, Card, Chip, Header, SectionTitle } from '../components/ui';
import { getPermission, PermissionStatus, requestPermission, rescheduleAll, sendTestNotification } from '../notifications';
import { DEFAULT_ADDRESS, MASCOTS } from '../mascot';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Settings } from '../types';

type TimedKey = 'morning' | 'evening' | 'weekly';

const ROWS: { key: TimedKey; title: string; hint: string }[] = [
  { key: 'morning', title: 'Утренний план', hint: 'Каждый день: поставить цели' },
  { key: 'evening', title: 'Вечерние итоги', hint: 'Каждый день: отметить сделанное' },
  { key: 'weekly', title: 'Цели на неделю', hint: 'По понедельникам' },
];

export function SettingsScreen() {
  const t = useTheme();
  const { state, dispatch } = useStore();
  const [permission, setPermission] = useState<PermissionStatus>('undetermined');
  const [editing, setEditing] = useState<TimedKey | null>(null);

  useEffect(() => {
    getPermission().then(setPermission);
  }, []);

  const update = (settings: Partial<Settings>) => dispatch({ type: 'updateSettings', settings });
  const mascot = state.settings.mascot;
  const updateMascot = (patch: Partial<Settings['mascot']>) => update({ mascot: { ...mascot, ...patch } });
  const base = MASCOTS.find((m) => m.id === mascot.id) ?? MASCOTS[0];

  const enable = async () => {
    const p = await requestPermission();
    setPermission(p);
    if (p === 'granted') rescheduleAll(state);
    else if (p === 'denied')
      Alert.alert('Уведомления выключены', 'Разреши уведомления для приложения в настройках телефона.', [
        { text: 'Позже', style: 'cancel' },
        { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
      ]);
  };

  return (
    <View>
      <Header title="Настройки" subtitle="Маскот и напоминания" />

      {permission !== 'granted' ? (
        <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warnSoft }}>
          <Text style={[styles.warn, { color: t.warnText }]}>
            {permission === 'unsupported'
              ? 'Уведомления работают только на телефоне (Android / iOS).'
              : 'Уведомления не разрешены — без них дневник не сможет напоминать о себе.'}
          </Text>
          {permission !== 'unsupported' ? <Button label="Разрешить уведомления" onPress={enable} /> : null}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Маскот</SectionTitle>
        <View style={styles.mascots}>
          {MASCOTS.map((m) => {
            const active = m.id === base.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => updateMascot({ id: m.id })}
                style={[styles.mascotItem, { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accentSoft : 'transparent' }]}
              >
                <Text style={styles.mascotEmoji}>{m.emoji}</Text>
                <Text style={[styles.mascotName, { color: active ? t.accent : t.muted }]}>{m.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: t.muted }]}>Имя маскота</Text>
        <TextInput
          value={mascot.name}
          onChangeText={(name) => updateMascot({ name })}
          placeholder={base.name}
          placeholderTextColor={t.muted}
          maxLength={30}
          style={[styles.input, { color: t.text, borderColor: t.border }]}
        />

        <Text style={[styles.label, { color: t.muted }]}>Как маскот обращается ко мне</Text>
        <TextInput
          value={mascot.address}
          onChangeText={(address) => updateMascot({ address })}
          placeholder={DEFAULT_ADDRESS}
          placeholderTextColor={t.muted}
          maxLength={30}
          style={[styles.input, { color: t.text, borderColor: t.border }]}
        />
        <View style={styles.chips}>
          {['братан', 'брат', 'бро', 'чемпион', 'боец', 'легенда'].map((a) => (
            <Chip key={a} label={a} active={mascot.address === a} onPress={() => updateMascot({ address: a })} />
          ))}
        </View>

        <Text style={[styles.label, { color: t.muted }]}>Так это выглядит</Text>
        <Mascot mood="disappointed" seed="preview" />
      </Card>

      <Card>
        <SectionTitle>Напоминания</SectionTitle>
        {ROWS.map(({ key, title, hint }) => {
          const s = state.settings[key];
          return (
            <View key={key} style={[styles.row, { borderColor: t.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]}>{title}</Text>
                <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text>
              </View>
              {s.enabled ? <Chip label={s.time} active onPress={() => setEditing(key)} /> : null}
              <Switch value={s.enabled} onValueChange={(enabled) => update({ [key]: { ...s, enabled } })} />
            </View>
          );
        })}
        <View style={[styles.row, { borderColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]}>«Давно не заходил»</Text>
            <Text style={[styles.hint, { color: t.muted }]}>Если не открывать дневник 2 дня</Text>
          </View>
          <Switch value={state.settings.nudge} onValueChange={(nudge) => update({ nudge })} />
        </View>
      </Card>

      {permission === 'granted' ? (
        <Card>
          <SectionTitle>Проверка</SectionTitle>
          <Button
            label="Прислать тестовое уведомление"
            kind="secondary"
            onPress={async () => {
              await sendTestNotification();
              Alert.alert('Готово', 'Уведомление придёт через 5 секунд. Можно свернуть приложение.');
            }}
          />
        </Card>
      ) : null}

      <Text style={[styles.footer, { color: t.muted }]}>
        Также можно поставить напоминание на любую цель дня (кнопка ⏰) и время для каждой привычки.
      </Text>

      <TimePicker
        visible={!!editing}
        title={editing ? ROWS.find((r) => r.key === editing)!.title : ''}
        value={editing ? state.settings[editing].time : undefined}
        onClose={() => setEditing(null)}
        onSave={(time) => {
          if (editing) update({ [editing]: { ...state.settings[editing], time } });
          setEditing(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  warn: { fontSize: 15, marginBottom: 12, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, marginTop: 2 },
  mascots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mascotItem: { width: '31%', alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  mascotEmoji: { fontSize: 30 },
  mascotName: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  input: { fontSize: 16, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  footer: { fontSize: 13, textAlign: 'center', paddingHorizontal: 20, lineHeight: 19 },
});
