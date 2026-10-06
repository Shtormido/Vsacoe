import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TimePicker } from '../components/TimePicker';
import { Button, Card, Chip, Empty, Header, SectionTitle } from '../components/ui';
import { dateKey, describeDays, WEEKDAYS_SHORT } from '../dates';
import { newId, routineStreak, useStore } from '../store';
import { useTheme } from '../theme';
import { Routine } from '../types';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const SUGGESTIONS = ['Зарядка', 'Выпить 2 л воды', 'Прочитать 20 страниц', 'Прогулка', 'Без телефона перед сном'];

export function RoutinesScreen({ today }: { today: Date }) {
  const t = useTheme();
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<Routine | null>(null);

  const create = (title = '') =>
    setEditing({ id: newId(), title, days: ALL_DAYS, createdAt: dateKey(today) });

  return (
    <View>
      <Header title="Привычки" subtitle="Повседневные задачи" />

      <Card>
        <SectionTitle>Мои привычки</SectionTitle>
        {state.routines.length === 0 ? (
          <Empty>Добавь то, что хочешь делать регулярно — они будут появляться на нужные дни.</Empty>
        ) : null}
        {state.routines.map((r) => {
          const streak = routineStreak(r, state.routineDone, today);
          return (
            <Pressable
              key={r.id}
              onPress={() => setEditing(r)}
              style={({ pressed }) => [styles.row, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]}>{r.title}</Text>
                <Text style={[styles.meta, { color: t.muted }]}>
                  {describeDays(r.days)}
                  {r.time ? `  ·  ⏰ ${r.time}` : ''}
                </Text>
              </View>
              {streak > 0 ? <Text style={[styles.streak, { color: t.text }]}>🔥 {streak}</Text> : null}
              <Text style={[styles.chevron, { color: t.muted }]}>›</Text>
            </Pressable>
          );
        })}
        <View style={{ marginTop: 10 }}>
          <Button label="+ Новая привычка" onPress={() => create()} />
        </View>
      </Card>

      {state.routines.length < 3 ? (
        <Card>
          <SectionTitle>Идеи</SectionTitle>
          <View style={styles.chips}>
            {SUGGESTIONS.filter((s) => !state.routines.some((r) => r.title === s)).map((s) => (
              <Chip key={s} label={`+ ${s}`} onPress={() => create(s)} />
            ))}
          </View>
        </Card>
      ) : null}

      <RoutineEditor
        routine={editing}
        isNew={!!editing && !state.routines.some((r) => r.id === editing.id)}
        onClose={() => setEditing(null)}
        onSave={(r) => {
          dispatch({ type: 'saveRoutine', routine: r });
          setEditing(null);
        }}
        onDelete={(r) =>
          Alert.alert('Удалить привычку?', r.title, [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Удалить',
              style: 'destructive',
              onPress: () => {
                dispatch({ type: 'removeRoutine', id: r.id });
                setEditing(null);
              },
            },
          ])
        }
      />
    </View>
  );
}

function RoutineEditor({
  routine,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  routine: Routine | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (r: Routine) => void;
  onDelete: (r: Routine) => void;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState<Routine | null>(null);
  const [pickTime, setPickTime] = useState(false);

  // Подхватываем новую привычку при открытии редактора.
  if (routine && draft?.id !== routine.id) setDraft(routine);
  if (!routine && draft) setDraft(null);

  const toggleDay = (d: number) => {
    if (!draft) return;
    const days = draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort();
    setDraft({ ...draft, days });
  };

  const save = () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return Alert.alert('Напиши название привычки');
    if (!draft.days.length) return Alert.alert('Выбери хотя бы один день');
    onSave({ ...draft, title });
  };

  return (
    <Modal visible={!!routine} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {draft ? (
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>{isNew ? 'Новая привычка' : 'Привычка'}</Text>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft({ ...draft, title })}
              placeholder="Например: зарядка"
              placeholderTextColor={t.muted}
              autoFocus={isNew && !draft.title}
              style={[styles.input, { color: t.text, borderColor: t.border }]}
            />

            <Text style={[styles.label, { color: t.muted }]}>Дни</Text>
            <View style={styles.chips}>
              {WEEKDAYS_SHORT.map((label, i) => (
                <Chip key={label} label={label} active={draft.days.includes(i)} onPress={() => toggleDay(i)} />
              ))}
            </View>
            <View style={[styles.chips, { marginTop: 8 }]}>
              <Chip label="Каждый день" onPress={() => setDraft({ ...draft, days: ALL_DAYS })} />
              <Chip label="Будни" onPress={() => setDraft({ ...draft, days: [0, 1, 2, 3, 4] })} />
              <Chip label="Выходные" onPress={() => setDraft({ ...draft, days: [5, 6] })} />
            </View>

            <Text style={[styles.label, { color: t.muted }]}>Напоминание</Text>
            <View style={styles.chips}>
              <Chip label={draft.time ? `⏰ ${draft.time}` : 'Выбрать время'} active={!!draft.time} onPress={() => setPickTime(true)} />
            </View>

            <View style={styles.actions}>
              <Button label="Сохранить" onPress={save} />
              {!isNew ? <Button label="Удалить привычку" kind="danger" onPress={() => onDelete(draft)} /> : null}
              {isNew ? <Button label="Отмена" kind="secondary" onPress={onClose} /> : null}
            </View>

            <TimePicker
              visible={pickTime}
              title="Во сколько напоминать?"
              value={draft.time}
              onClose={() => setPickTime(false)}
              onRemove={
                draft.time
                  ? () => {
                      setDraft({ ...draft, time: undefined });
                      setPickTime(false);
                    }
                  : undefined
              }
              onSave={(time) => {
                setDraft({ ...draft, time });
                setPickTime(false);
              }}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
  streak: { fontSize: 15, fontWeight: '700' },
  chevron: { fontSize: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 14 },
  input: { fontSize: 17, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  actions: { gap: 8, marginTop: 24 },
});
