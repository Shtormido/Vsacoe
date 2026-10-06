import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { TimePicker } from '../components/TimePicker';
import { Button, Card, Chip, Header, SectionTitle } from '../components/ui';
import { getPermission, PermissionStatus, requestPermission, rescheduleAll, sendTestNotification } from '../notifications';
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
      <Header title="Настройки" subtitle="Напоминания" />

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
  footer: { fontSize: 13, textAlign: 'center', paddingHorizontal: 20, lineHeight: 19 },
});
