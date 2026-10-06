import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useReducer, useState } from 'react';
import { addDays, dateKey, dayList, parseKey, weekdayIndex } from './dates';
import { Goal, Routine, Settings, State } from './types';

const STORAGE_KEY = 'dnevnik-state-v1';

export const defaultSettings: Settings = {
  morning: { enabled: true, time: '08:00' },
  evening: { enabled: true, time: '21:00' },
  weekly: { enabled: true, time: '09:00' },
  nudge: true,
  mascot: { id: 'raccoon', name: '', address: 'братан' },
};

const initialState: State = {
  goals: {},
  routines: [],
  routineDone: {},
  settings: defaultSettings,
};

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

type Action =
  | { type: 'hydrate'; state: State }
  | { type: 'addGoal'; list: string; title: string }
  | { type: 'toggleGoal'; list: string; id: string }
  | { type: 'removeGoal'; list: string; id: string }
  | { type: 'setGoalReminder'; list: string; id: string; time?: string }
  | { type: 'moveUndone'; from: string; to: string }
  | { type: 'saveRoutine'; routine: Routine }
  | { type: 'removeRoutine'; id: string }
  | { type: 'toggleRoutine'; date: string; id: string }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'setMotivation'; date: string; index: number };

function mapGoals(state: State, list: string, fn: (goals: Goal[]) => Goal[]): State {
  const next = fn(state.goals[list] ?? []);
  const goals = { ...state.goals };
  if (next.length) goals[list] = next;
  else delete goals[list];
  return { ...state, goals };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return action.state;
    case 'addGoal':
      return mapGoals(state, action.list, (g) => [...g, { id: newId(), title: action.title, done: false }]);
    case 'toggleGoal':
      return mapGoals(state, action.list, (g) =>
        g.map((x) => (x.id === action.id ? { ...x, done: !x.done } : x)),
      );
    case 'removeGoal':
      return mapGoals(state, action.list, (g) => g.filter((x) => x.id !== action.id));
    case 'setGoalReminder':
      return mapGoals(state, action.list, (g) =>
        g.map((x) => (x.id === action.id ? { ...x, remindAt: action.time } : x)),
      );
    case 'moveUndone': {
      const undone = (state.goals[action.from] ?? []).filter((x) => !x.done);
      if (!undone.length) return state;
      const moved = mapGoals(state, action.from, (g) => g.filter((x) => x.done));
      // Напоминание со вчерашнего дня в новом дне уже неактуально — сбрасываем его.
      return mapGoals(moved, action.to, (g) => [
        ...g,
        ...undone.map((x) => ({ ...x, id: newId(), remindAt: undefined })),
      ]);
    }
    case 'saveRoutine': {
      const exists = state.routines.some((r) => r.id === action.routine.id);
      return {
        ...state,
        routines: exists
          ? state.routines.map((r) => (r.id === action.routine.id ? action.routine : r))
          : [...state.routines, action.routine],
      };
    }
    case 'removeRoutine':
      return { ...state, routines: state.routines.filter((r) => r.id !== action.id) };
    case 'toggleRoutine': {
      const done = state.routineDone[action.date] ?? [];
      const next = done.includes(action.id) ? done.filter((x) => x !== action.id) : [...done, action.id];
      return { ...state, routineDone: { ...state.routineDone, [action.date]: next } };
    }
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'setMotivation':
      return { ...state, motivation: { date: action.date, index: action.index } };
  }
}

type Store = { state: State; dispatch: (a: Action) => void; ready: boolean };

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<State>;
        dispatch({
          type: 'hydrate',
          state: {
            ...initialState,
            ...saved,
            settings: { ...defaultSettings, ...saved.settings },
          },
        });
      })
      .catch((e) => console.warn('Не удалось загрузить данные', e))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
        console.warn('Не удалось сохранить данные', e),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [state, ready]);

  return <StoreContext.Provider value={{ state, dispatch, ready }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore вне StoreProvider');
  return s;
}

/** Серия: сколько запланированных дней подряд привычка выполнена (сегодня ещё не ломает серию). */
export function routineStreak(r: Routine, routineDone: State['routineDone'], today: Date) {
  let streak = 0;
  const d = new Date(today);
  for (let i = 0; i < 400; i++) {
    const key = dateKey(d);
    if (key < r.createdAt) break;
    if (r.days.includes((d.getDay() + 6) % 7)) {
      if (routineDone[key]?.includes(r.id)) streak++;
      else if (i > 0) break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Привычки, которые действуют в этот день (и уже существовали). */
export function routinesFor(state: State, key: string) {
  const wd = weekdayIndex(parseKey(key));
  return state.routines.filter((r) => r.createdAt <= key && r.days.includes(wd));
}

/** Сколько всего задач (цели + привычки) на день и сколько из них выполнено. */
export function dayStats(state: State, key: string) {
  const goals = state.goals[dayList(key)] ?? [];
  const routines = routinesFor(state, key);
  const doneIds = state.routineDone[key] ?? [];
  const total = goals.length + routines.length;
  const done = goals.filter((g) => g.done).length + routines.filter((r) => doneIds.includes(r.id)).length;
  return { done, total };
}

export const previousDay = (key: string) => dateKey(addDays(parseKey(key), -1));
