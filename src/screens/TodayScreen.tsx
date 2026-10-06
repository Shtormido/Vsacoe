import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { TimePicker } from '../components/TimePicker';
import { AddInput, Card, Chip, Empty, Header, ProgressBar, SectionTitle, TaskRow } from '../components/ui';
import { addDays, dateKey, dayList, formatDay, mondayOf, parseKey, plural, relativeDay, startOfDay, weekdayIndex, weekList } from '../dates';
import { routineStreak, useStore } from '../store';
import { useTheme } from '../theme';
import { Goal } from '../types';

type Props = { date: string; setDate: (key: string) => void; today: Date };

export function TodayScreen({ date, setDate, today }: Props) {
  const t = useTheme();
  const { state, dispatch } = useStore();
  const [reminderFor, setReminderFor] = useState<Goal | null>(null);

  const day = parseKey(date);
  const list = dayList(date);
  const goals = state.goals[list] ?? [];
  const isPast = day < startOfDay(today);
  const isToday = date === dateKey(today);

  const routines = state.routines.filter((r) => r.createdAt <= date && r.days.includes(weekdayIndex(day)));
  const routineDone = state.routineDone[date] ?? [];

  const weekGoals = state.goals[weekList(dateKey(mondayOf(day)))] ?? [];
  const weekOpen = weekGoals.filter((g) => !g.done);

  const yesterdayList = dayList(dateKey(addDays(day, -1)));
  const yesterdayUndone = isToday ? (state.goals[yesterdayList] ?? []).filter((g) => !g.done).length : 0;

  const done = goals.filter((g) => g.done).length + routines.filter((r) => routineDone.includes(r.id)).length;
  const total = goals.length + routines.length;

  const confirmDelete = (g: Goal) =>
    Alert.alert('Удалить цель?', g.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => dispatch({ type: 'removeGoal', list, id: g.id }) },
    ]);

  return (
    <View>
      <Header
        title={relativeDay(day, startOfDay(today)) ?? formatDay(day).split(',')[0]}
        subtitle={formatDay(day)}
        onPrev={() => setDate(dateKey(addDays(day, -1)))}
        onNext={() => setDate(dateKey(addDays(day, 1)))}
        onTitlePress={isToday ? undefined : () => setDate(dateKey(today))}
      />

      {total > 0 ? <ProgressBar done={done} total={total} /> : null}
      {total > 0 && done === total ? (
        <Text style={[styles.congrats, { color: t.success }]}>🎉 Всё выполнено! Отличный день.</Text>
      ) : null}

      {yesterdayUndone > 0 ? (
        <Pressable
          onPress={() => dispatch({ type: 'moveUndone', from: yesterdayList, to: list })}
          style={[styles.banner, { backgroundColor: t.warnSoft }]}
        >
          <Text style={{ color: t.warnText, fontWeight: '600' }}>
            Со вчера осталось {yesterdayUndone} {plural(yesterdayUndone, ['цель', 'цели', 'целей'])}. Перенести на сегодня →
          </Text>
        </Pressable>
      ) : null}

      <Card>
        <SectionTitle>Цели на день</SectionTitle>
        {!isPast ? <AddInput placeholder="Что важно сделать?" onAdd={(title) => dispatch({ type: 'addGoal', list, title })} /> : null}
        {goals.length === 0 ? <Empty>{isPast ? 'В этот день целей не было' : 'Пока пусто — добавь первую цель'}</Empty> : null}
        {goals.map((g) => (
          <TaskRow
            key={g.id}
            title={g.title}
            done={g.done}
            onToggle={() => dispatch({ type: 'toggleGoal', list, id: g.id })}
            onLongPress={() => confirmDelete(g)}
            right={
              isPast || g.done ? null : (
                <Chip label={g.remindAt ? `⏰ ${g.remindAt}` : '⏰'} active={!!g.remindAt} onPress={() => setReminderFor(g)} />
              )
            }
          />
        ))}
        {goals.length > 0 ? <Text style={[styles.hint, { color: t.muted }]}>Удерживай цель, чтобы удалить</Text> : null}
      </Card>

      <Card>
        <SectionTitle>Повседневные задачи</SectionTitle>
        {routines.length === 0 ? <Empty>На этот день привычек нет. Добавь их во вкладке «Привычки».</Empty> : null}
        {routines.map((r) => {
          const streak = routineStreak(r, state.routineDone, today);
          const meta = [r.time ? `⏰ ${r.time}` : null, streak > 1 ? `🔥 ${streak} подряд` : null].filter(Boolean).join('  ·  ');
          return (
            <TaskRow
              key={r.id}
              title={r.title}
              done={routineDone.includes(r.id)}
              meta={meta || undefined}
              onToggle={() => dispatch({ type: 'toggleRoutine', date, id: r.id })}
            />
          );
        })}
      </Card>

      {weekGoals.length > 0 ? (
        <Card>
          <SectionTitle>Цели недели</SectionTitle>
          {weekOpen.length === 0 ? <Empty>Все цели недели выполнены 💪</Empty> : null}
          {weekOpen.map((g) => (
            <Text key={g.id} style={[styles.weekGoal, { color: t.text }]}>
              • {g.title}
            </Text>
          ))}
        </Card>
      ) : null}

      <TimePicker
        visible={!!reminderFor}
        title={reminderFor ? `Напомнить: ${reminderFor.title}` : ''}
        value={reminderFor?.remindAt}
        onClose={() => setReminderFor(null)}
        onRemove={
          reminderFor?.remindAt
            ? () => {
                dispatch({ type: 'setGoalReminder', list, id: reminderFor.id, time: undefined });
                setReminderFor(null);
              }
            : undefined
        }
        onSave={(time) => {
          if (reminderFor) dispatch({ type: 'setGoalReminder', list, id: reminderFor.id, time });
          setReminderFor(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  congrats: { fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  banner: { borderRadius: 12, padding: 12, marginBottom: 14 },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  weekGoal: { fontSize: 15, paddingVertical: 3 },
});
