export type Goal = {
  id: string;
  title: string;
  done: boolean;
  /** "HH:MM" — напоминание о конкретной цели (только для целей на день) */
  remindAt?: string;
};

export type Routine = {
  id: string;
  title: string;
  /** Дни недели: 0 = Пн … 6 = Вс */
  days: number[];
  /** "HH:MM" — во сколько напомнить, если задано */
  time?: string;
  createdAt: string; // dateKey
};

export type ReminderSetting = { enabled: boolean; time: string };

export type MascotSettings = {
  /** id из списка MASCOTS */
  id: string;
  /** Своё имя маскота; пусто — имя по умолчанию */
  name: string;
  /** Как маскот обращается к пользователю */
  address: string;
};

export type Settings = {
  morning: ReminderSetting;
  evening: ReminderSetting;
  weekly: ReminderSetting; // по понедельникам
  nudge: boolean; // «давно не заходил»
  mascot: MascotSettings;
};

export type State = {
  /** Списки целей: "d:YYYY-MM-DD" — на день, "w:YYYY-MM-DD" (понедельник) — на неделю */
  goals: Record<string, Goal[]>;
  routines: Routine[];
  /** dateKey → id выполненных привычек */
  routineDone: Record<string, string[]>;
  settings: Settings;
  /** Фраза дня, выбранная вручную кнопкой «обновить» (действует только в этот день) */
  motivation?: { date: string; index: number };
};
