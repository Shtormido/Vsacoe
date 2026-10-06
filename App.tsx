import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateKey, startOfDay } from './src/dates';
import { onNotificationOpen, requestPermission, rescheduleAll } from './src/notifications';
import { MotivationScreen } from './src/screens/MotivationScreen';
import { RoutinesScreen } from './src/screens/RoutinesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { WeekScreen } from './src/screens/WeekScreen';
import { StoreProvider, useStore } from './src/store';
import { useTheme } from './src/theme';

type Tab = 'today' | 'week' | 'motivation' | 'routines' | 'settings';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'today', icon: '📅', label: 'День' },
  { key: 'week', icon: '🗓', label: 'Неделя' },
  { key: 'motivation', icon: '🔥', label: 'Мотивация' },
  { key: 'routines', icon: '🔁', label: 'Привычки' },
  { key: 'settings', icon: '⚙️', label: 'Настройки' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Main />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function Main() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state, ready } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [date, setDate] = useState(() => dateKey(new Date()));
  const scrollRef = useRef<ScrollView>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // После загрузки данных один раз спрашиваем разрешение на уведомления.
  useEffect(() => {
    if (!ready) return;
    requestPermission().then(() => rescheduleAll(stateRef.current));
  }, [ready]);

  // Любое изменение данных или настроек — пересобираем расписание уведомлений.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => rescheduleAll(state), 800);
    return () => clearTimeout(timer);
  }, [state, ready]);

  // Следим за сменой дня и возвращением в приложение.
  useEffect(() => {
    const refreshDay = () => {
      const now = startOfDay(new Date());
      setToday((prev) => {
        if (prev.getTime() === now.getTime()) return prev;
        setDate((d) => (d === dateKey(prev) ? dateKey(now) : d));
        return now;
      });
    };
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      refreshDay();
      // Переносим напоминание «давно не заходил» вперёд.
      if (ready) rescheduleAll(stateRef.current);
    });
    const timer = setInterval(refreshDay, 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [ready]);

  // Нажатие на уведомление открывает нужную вкладку.
  useEffect(
    () =>
      onNotificationOpen((target) => {
        if (target !== 'today' && target !== 'week' && target !== 'motivation') return;
        setTab(target);
        if (target === 'today') setDate(dateKey(new Date()));
      }),
    [],
  );

  const go = (next: Tab) => {
    if (next === tab) scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (next === 'today' && tab === 'today') setDate(dateKey(today));
    setTab(next);
  };

  if (!ready) {
    return (
      <View style={[styles.loading, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <StatusBar style="auto" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {tab === 'today' ? <TodayScreen date={date} setDate={setDate} today={today} /> : null}
        {tab === 'week' ? (
          <WeekScreen
            today={today}
            openDay={(key) => {
              setDate(key);
              setTab('today');
            }}
          />
        ) : null}
        {tab === 'motivation' ? (
          <MotivationScreen
            today={today}
            openToday={() => {
              setDate(dateKey(today));
              setTab('today');
            }}
          />
        ) : null}
        {tab === 'routines' ? <RoutinesScreen today={today} /> : null}
        {tab === 'settings' ? <SettingsScreen /> : null}
      </ScrollView>

      <View style={[styles.tabBar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((x) => {
          const active = x.key === tab;
          return (
            <Pressable key={x.key} onPress={() => go(x.key)} style={styles.tab}>
              <Text style={[styles.tabIcon, { opacity: active ? 1 : 0.5 }]}>{x.icon}</Text>
              <Text style={[styles.tabLabel, { color: active ? t.accent : t.muted }]}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
