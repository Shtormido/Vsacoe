import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { addDays, dateKey, dayList, parseKey, parseTime } from './dates';
import { State } from './types';

const CHANNEL = 'reminders';
// iOS хранит не больше 64 запланированных уведомлений на приложение.
const MAX_SCHEDULED = 60;
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPermission(): Promise<PermissionStatus> {
  if (!supported) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<PermissionStatus> {
  if (!supported) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Напоминания',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const current = await getPermission();
  if (current !== 'undetermined') return current;
  const p = await Notifications.requestPermissionsAsync();
  return p.granted ? 'granted' : 'denied';
}

type Request = Notifications.NotificationRequestInput;

function content(title: string, body: string, tab: string): Request['content'] {
  return { title, body, sound: true, data: { tab } };
}

/** Пересоздаёт все локальные уведомления по текущему состоянию. */
async function rescheduleNow(state: State) {
  if ((await getPermission()) !== 'granted') return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  const { settings } = state;
  const now = new Date();
  const requests: Request[] = [];

  if (settings.morning.enabled) {
    requests.push({
      content: content('☀️ Доброе утро!', 'Загляни в дневник и поставь цели на сегодня.', 'today'),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, channelId: CHANNEL, ...parseTime(settings.morning.time) },
    });
  }
  if (settings.evening.enabled) {
    requests.push({
      content: content('🌙 Как прошёл день?', 'Отметь, что успел сделать, и запиши планы на завтра.', 'today'),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, channelId: CHANNEL, ...parseTime(settings.evening.time) },
    });
  }
  if (settings.weekly.enabled) {
    requests.push({
      content: content('🗓 Новая неделя', 'Время поставить цели на неделю!', 'week'),
      // weekday: 1 = воскресенье, 2 = понедельник
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, channelId: CHANNEL, weekday: 2, ...parseTime(settings.weekly.time) },
    });
  }
  if (settings.nudge) {
    // Переносится вперёд при каждом открытии приложения — сработает, только если про дневник забыли.
    const at = addDays(now, 2);
    const { hour, minute } = parseTime(settings.evening.time);
    at.setHours(hour, minute, 0, 0);
    requests.push({
      content: content('📓 Дневник скучает', 'Ты пару дней не заглядывал. Отметь задачи и поставь новые цели!', 'today'),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, channelId: CHANNEL, date: at },
    });
  }

  // Напоминания о конкретных целях на ближайшую неделю, ближайшие — первыми.
  const goalRequests: { at: Date; req: Request }[] = [];
  for (let i = 0; i < 7; i++) {
    const key = dateKey(addDays(now, i));
    for (const g of state.goals[dayList(key)] ?? []) {
      if (g.done || !g.remindAt) continue;
      const at = parseKey(key);
      const { hour, minute } = parseTime(g.remindAt);
      at.setHours(hour, minute, 0, 0);
      if (at <= now) continue;
      goalRequests.push({
        at,
        req: {
          content: content('⏰ Напоминание', g.title, 'today'),
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, channelId: CHANNEL, date: at },
        },
      });
    }
  }
  goalRequests.sort((a, b) => a.at.getTime() - b.at.getTime());
  requests.push(...goalRequests.map((x) => x.req));

  for (const r of state.routines) {
    if (!r.time || !r.days.length) continue;
    const time = parseTime(r.time);
    const body = `Пора: ${r.title}`;
    if (r.days.length === 7) {
      requests.push({
        content: content('🔁 Привычка', body, 'today'),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, channelId: CHANNEL, ...time },
      });
      continue;
    }
    for (const d of r.days) {
      requests.push({
        content: content('🔁 Привычка', body, 'today'),
        // наш 0 = Пн → 2 … 6 = Вс → 1
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, channelId: CHANNEL, weekday: ((d + 1) % 7) + 1, ...time },
      });
    }
  }

  for (const r of requests.slice(0, MAX_SCHEDULED)) {
    await Notifications.scheduleNotificationAsync(r);
  }
}

let queue: Promise<void> = Promise.resolve();

/** Перепланирование идёт строго последовательно, чтобы вызовы не перемешались. */
export function rescheduleAll(state: State) {
  if (!supported) return queue;
  queue = queue.then(() => rescheduleNow(state)).catch((e) => console.warn('Ошибка планирования уведомлений', e));
  return queue;
}

export async function sendTestNotification() {
  await Notifications.scheduleNotificationAsync({
    content: content('✅ Уведомления работают', 'Так будут выглядеть напоминания дневника.', 'today'),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, channelId: CHANNEL, seconds: 5 },
  });
}

/** Вызывает cb с вкладкой из уведомления, по которому открыли приложение (в т.ч. при холодном старте). */
export function onNotificationOpen(cb: (tab: string) => void) {
  if (!supported) return () => {};
  const handle = (r: Notifications.NotificationResponse | null) => {
    const tab = r?.notification.request.content.data?.tab;
    if (typeof tab === 'string') cb(tab);
  };
  Notifications.getLastNotificationResponseAsync().then(handle);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
