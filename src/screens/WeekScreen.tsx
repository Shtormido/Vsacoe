import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AddInput, Card, Empty, Header, ProgressBar, SectionTitle, TaskRow } from '../components/ui';
import { addDays, dateKey, dayList, formatWeek, mondayOf, WEEKDAYS_SHORT, weekList } from '../dates';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Goal } from '../types';

type Props = { today: Date; openDay: (key: string) => void };

export function WeekScreen({ today, openDay }: Props) {
  const t = useTheme();
  const { state, dispatch } = useStore();
  const [offset, setOffset] = useState(0);

  const currentMonday = mondayOf(today);
  const monday = addDays(currentMonday, offset * 7);
  const list = weekList(dateKey(monday));
  const goals = state.goals[list] ?? [];
  const isPast = offset < 0;
  const todayKey = dateKey(today);

  const title = offset === 0 ? 'Эта неделя' : offset === 1 ? 'Следующая неделя' : offset === -1 ? 'Прошлая неделя' : 'Неделя';

  const confirmDelete = (g: Goal) =>
    Alert.alert('Удалить цель?', g.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => dispatch({ type: 'removeGoal', list, id: g.id }) },
    ]);

  return (
    <View>
      <Header
        title={title}
        subtitle={formatWeek(monday)}
        onPrev={() => setOffset(offset - 1)}
        onNext={() => setOffset(offset + 1)}
        onTitlePress={offset ? () => setOffset(0) : undefined}
      />

      {goals.length > 0 ? <ProgressBar done={goals.filter((g) => g.done).length} total={goals.length} /> : null}

      <Card>
        <SectionTitle>Цели на неделю</SectionTitle>
        {!isPast ? <AddInput placeholder="Чего хочу добиться за неделю?" onAdd={(title) => dispatch({ type: 'addGoal', list, title })} /> : null}
        {goals.length === 0 ? <Empty>{isPast ? 'На эту неделю целей не было' : 'Поставь 2–3 главные цели на неделю'}</Empty> : null}
        {goals.map((g) => (
          <TaskRow
            key={g.id}
            title={g.title}
            done={g.done}
            onToggle={() => dispatch({ type: 'toggleGoal', list, id: g.id })}
            onLongPress={() => confirmDelete(g)}
          />
        ))}
      </Card>

      <Card>
        <SectionTitle>Дни недели</SectionTitle>
        <View style={styles.days}>
          {WEEKDAYS_SHORT.map((label, i) => {
            const day = addDays(monday, i);
            const key = dateKey(day);
            const dayGoals = state.goals[dayList(key)] ?? [];
            const routines = state.routines.filter((r) => r.createdAt <= key && r.days.includes(i));
            const doneIds = state.routineDone[key] ?? [];
            const total = dayGoals.length + routines.length;
            const done = dayGoals.filter((g) => g.done).length + routines.filter((r) => doneIds.includes(r.id)).length;
            const isToday = key === todayKey;
            const complete = total > 0 && done === total;
            return (
              <Pressable
                key={key}
                onPress={() => openDay(key)}
                style={[
                  styles.day,
                  {
                    backgroundColor: complete ? t.success : isToday ? t.accentSoft : 'transparent',
                    borderColor: isToday ? t.accent : t.border,
                  },
                ]}
              >
                <Text style={[styles.dayLabel, { color: complete ? '#fff' : t.muted }]}>{label}</Text>
                <Text style={[styles.dayNum, { color: complete ? '#fff' : t.text }]}>{day.getDate()}</Text>
                <Text style={[styles.dayCount, { color: complete ? '#fff' : t.muted }]}>{total ? `${done}/${total}` : '—'}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: t.muted }]}>Нажми на день, чтобы открыть его</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  dayLabel: { fontSize: 12, fontWeight: '600' },
  dayNum: { fontSize: 18, fontWeight: '700', marginVertical: 2 },
  dayCount: { fontSize: 11, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 10 },
});
