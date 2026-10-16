using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using JivieOboi.Lock;

namespace JivieOboi;

internal sealed partial class MainWindow
{
    // ───────────────────────── плейлист ─────────────────────────

    UIElement PlaylistPage()
    {
        var stack = new StackPanel();
        stack.Children.Add(Ui.Title("Плейлист"));
        stack.Children.Add(Ui.Subtitle("Обои будут сменяться сами. Добавляйте их кнопкой «В плейлист» в библиотеке. " +
                                       "В режиме «разные на каждом мониторе» мониторы идут по плейлисту со сдвигом."));

        stack.Children.Add(Ui.ToggleRow("Менять обои автоматически", S.PlaylistEnabled, v =>
        {
            S.PlaylistEnabled = v;
            S.Save();
            app.Wallpapers.Build();
        }, S.Playlist.Count < 2 ? "Добавьте в плейлист хотя бы двое обоев." : null));
        stack.Children.Add(Ui.Row("Как часто", Ui.Combo(new[]
        {
            ("Каждые 5 минут", 5), ("Каждые 10 минут", 10), ("Каждые 15 минут", 15), ("Каждые 30 минут", 30),
            ("Каждый час", 60), ("Каждые 2 часа", 120), ("Каждые 6 часов", 360), ("Раз в сутки", 1440),
        }, S.PlaylistMinutes, v =>
        {
            S.PlaylistMinutes = v;
            S.Save();
            app.Wallpapers.ApplyPlaylistTimer();
        })));
        stack.Children.Add(Ui.ToggleRow("В случайном порядке", S.PlaylistShuffle, v => { S.PlaylistShuffle = v; S.Save(); }));
        var next = new WrapPanel { Margin = new Thickness(0, 8, 0, 0) };
        next.Children.Add(Ui.Button("Следующие обои сейчас", app.Wallpapers.NextInPlaylist));
        stack.Children.Add(next);

        var items = S.Playlist.Select(id => Lib.Find(id)).OfType<WallpaperItem>().ToList();
        stack.Children.Add(Ui.Section($"В плейлисте: {items.Count}"));
        if (items.Count == 0) stack.Children.Add(Ui.Hint("Пока пусто."));
        for (int i = 0; i < items.Count; i++)
        {
            var item = items[i];
            int index = i;
            var row = new Grid();
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(112) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var thumb = new Image { Width = 96, Height = 54, Stretch = Stretch.UniformToFill };
            var thumbHost = new Grid { Width = 96, Height = 54, Background = Placeholder(item), Clip = new RectangleGeometry(new Rect(0, 0, 96, 54), 4, 4), HorizontalAlignment = HorizontalAlignment.Left };
            thumbHost.Children.Add(thumb);
            _ = LoadThumbAsync(thumb, item);
            row.Children.Add(thumbHost);
            var title = new TextBlock { Text = item.Title, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
            Grid.SetColumn(title, 1);
            row.Children.Add(title);
            var buttons = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            buttons.Children.Add(Ui.Button("↑", () => Move(index, -1)));
            buttons.Children.Add(Ui.Button("↓", () => Move(index, +1)));
            buttons.Children.Add(Ui.Button("Убрать", () =>
            {
                S.Playlist.Remove(item.Id);
                S.Save();
                app.Wallpapers.ApplyPlaylistTimer();
                ShowPage(1);
            }));
            Grid.SetColumn(buttons, 2);
            row.Children.Add(buttons);
            stack.Children.Add(Ui.Card(row));
        }
        return Ui.Page(stack);

        void Move(int index, int delta)
        {
            var list = S.Playlist.Where(id => Lib.Find(id) != null).ToList();
            int to = index + delta;
            if (to < 0 || to >= list.Count) return;
            (list[index], list[to]) = (list[to], list[index]);
            S.Playlist = list;
            S.Save();
            ShowPage(1);
        }
    }

    // ───────────────────────── экран блокировки ─────────────────────────

    UIElement LockPage()
    {
        var stack = new StackPanel();
        stack.Children.Add(Ui.Title("Экран блокировки"));
        stack.Children.Add(Ui.Subtitle(
            "Живой экран блокировки работает на всех подключённых мониторах: на каждом — свои обои и часы. " +
            "Он показывается до экрана ввода пароля и сразу переходит к нему от любого нажатия. " +
            "Сам экран ввода пароля Windows не пускает к себе другие программы и показывает одну картинку на всех мониторах — " +
            "туда программа ставит кадр из обоев основного монитора."));

        var actions = new WrapPanel();
        actions.Children.Add(Ui.Button(app.HotkeyRegistered ? "Заблокировать сейчас  (Ctrl+Alt+L)" : "Заблокировать сейчас",
            () => app.ShowLockOverlay(true), accent: true));
        actions.Children.Add(Ui.Button("Обновить картинку экрана блокировки", () => _ = app.SyncLockScreenAsync(true)));
        stack.Children.Add(actions);

        stack.Children.Add(Ui.Section("Что показывать"));
        var lockOptions = new[] { ("Как на рабочем столе (на каждом мониторе свои)", (string?)null) }
            .Concat(Lib.Items.Select(i => (i.Title, (string?)i.Id)));
        stack.Children.Add(Ui.Row("Обои", Ui.Combo(lockOptions, S.LockWallpaperId, v => { S.LockWallpaperId = v; S.Save(); }, 320)));
        stack.Children.Add(Ui.ToggleRow("Часы и дата", S.ShowClock, v => { S.ShowClock = v; S.Save(); }));
        stack.Children.Add(Ui.ToggleRow("Часы на всех мониторах", S.ClockOnAllMonitors, v => { S.ClockOnAllMonitors = v; S.Save(); },
            "Если выключить — только на основном."));

        stack.Children.Add(Ui.Section("Когда показывать"));
        stack.Children.Add(Ui.Row("Живая заставка при бездействии", Ui.Combo(new[]
        {
            ("Выключена", 0), ("Через 1 минуту", 1), ("Через 3 минуты", 3), ("Через 5 минут", 5),
            ("Через 10 минут", 10), ("Через 15 минут", 15), ("Через 30 минут", 30),
        }, S.IdleOverlayMinutes, v => { S.IdleOverlayMinutes = v; S.Save(); })));
        stack.Children.Add(Ui.ToggleRow("Блокировать компьютер после заставки", S.LockAfterIdleOverlay,
            v => { S.LockAfterIdleOverlay = v; S.Save(); }, "Нажатие клавиши после заставки откроет экран ввода пароля."));
        stack.Children.Add(Ui.ToggleRow("Горячая клавиша Ctrl+Alt+L", S.LockHotkey, v =>
        {
            S.LockHotkey = v;
            S.Save();
            app.ApplyHotkey();
        }, "Win+L тоже работает, но перехватить его Windows не даёт — откроется сразу экран ввода пароля."));

        stack.Children.Add(Ui.Section("Картинка экрана ввода пароля"));
        stack.Children.Add(Ui.ToggleRow("Ставить кадр обоев при блокировке", S.LockScreenSync, v => { S.LockScreenSync = v; S.Save(); }));
        stack.Children.Add(Ui.Row("Дополнительно обновлять", Ui.Combo(new[]
        {
            ("Только при блокировке", 0), ("Каждые 5 минут", 5), ("Каждые 15 минут", 15), ("Каждый час", 60),
        }, S.LockScreenSyncMinutes, v =>
        {
            S.LockScreenSyncMinutes = v;
            S.Save();
            app.ApplyLockSyncTimer();
        })));

        stack.Children.Add(Ui.Section("Заставка Windows"));
        stack.Children.Add(Ui.Hint("Можно сделать живые обои системной заставкой (.scr): тогда Windows запускает их сама, " +
                                   "даже если программа закрыта, и после неё спрашивает пароль."));
        var saver = new WrapPanel();
        if (WindowsScreensaver.IsInstalled())
        {
            saver.Children.Add(Ui.Button("Параметры заставки Windows…", WindowsScreensaver.OpenWindowsSettings));
            saver.Children.Add(Ui.Button("Убрать из заставок Windows", () => { WindowsScreensaver.Uninstall(); ShowPage(2); }));
        }
        else
        {
            saver.Children.Add(Ui.Button("Сделать заставкой Windows", () =>
            {
                WindowsScreensaver.Install();
                WindowsScreensaver.OpenWindowsSettings();
                ShowPage(2);
            }));
        }
        stack.Children.Add(saver);
        return Ui.Page(stack);
    }

    // ───────────────────────── настройки ─────────────────────────

    UIElement SettingsPage()
    {
        var stack = new StackPanel();
        stack.Children.Add(Ui.Title("Настройки"));
        stack.Children.Add(Ui.Subtitle("Всё сохраняется сразу."));

        stack.Children.Add(Ui.Section("Мониторы"));
        stack.Children.Add(Ui.Row("Режим", Ui.Combo(new[]
        {
            ("Одни обои на всех мониторах", "same"),
            ("Разные обои на каждом мониторе", "per"),
            ("Одни обои, растянутые на все мониторы", "span"),
        }, S.Mode, v =>
        {
            if (v == "per")
                foreach (var m in WallpaperSlot.Monitors())
                    if (!S.Assignments.ContainsKey(m.Key)) S.Assignments[m.Key] = S.CurrentId;
            S.Mode = v;
            targetKey = v == "span" ? WallpaperSlot.SpanKey : "same";
            S.Save();
            app.Wallpapers.Build();
        }, 320), $"Подключено мониторов: {WallpaperSlot.Monitors().Count}. В режиме «разные» выберите монитор в поле «Куда ставить» в библиотеке."));
        stack.Children.Add(Ui.Row("Масштаб видео и картинок", Ui.Combo(new[]
        {
            ("Заполнить экран (с обрезкой)", "UniformToFill"), ("Вписать целиком", "Uniform"), ("Растянуть", "Fill"),
        }, S.Stretch, v => { S.Stretch = v; S.Save(); app.Wallpapers.Build(); })));

        stack.Children.Add(Ui.Section("Воспроизведение"));
        stack.Children.Add(Ui.Row("Движок видео", Ui.Combo(new[]
        {
            ("Chromium (WebView2) — рекомендуется", "webview"), ("Windows Media Foundation", "wmf"),
        }, S.VideoEngine, v => { S.VideoEngine = v; S.Save(); app.Wallpapers.Build(); }, 300),
            WebWallpaper.IsAvailable
                ? "Chromium играет MP4, WebM, MKV и другие форматы с аппаратным ускорением и без рывков на повторе."
                : "WebView2 Runtime не найден — видео пойдёт через Windows Media Foundation."));
        stack.Children.Add(Ui.Row("Кадров в секунду (анимации и веб-обои)", Ui.Combo(new[] { ("24", 24), ("30", 30), ("60", 60), ("120", 120) },
            S.SceneFps, v => { S.SceneFps = v; S.Save(); app.Wallpapers.Build(); }, 120)));

        var volume = new Slider { Minimum = 0, Maximum = 100, Value = S.Volume * 100, Width = 220, TickFrequency = 5, IsSnapToTickEnabled = true };
        volume.ValueChanged += (_, e) => app.SetVolume(e.NewValue / 100);
        stack.Children.Add(Ui.Row("Громкость видео", volume, "Звук идёт только с основного монитора."));
        stack.Children.Add(Ui.ToggleRow("Реагировать на музыку", S.AudioReactive, v =>
        {
            S.AudioReactive = v;
            S.Save();
            app.UpdatePauseState();
        }, "Обои «слышат», что играет на компьютере: эквалайзер, пульсация анимаций, аудио-обои Wallpaper Engine. Микрофон не используется."));
        stack.Children.Add(Ui.ToggleRow("Интерактивные обои", S.Interactive, v =>
        {
            S.Interactive = v;
            S.Save();
            app.Wallpapers.SetInteractive();
        }, "Движения и щелчки мыши по пустому рабочему столу передаются веб-обоям."));

        stack.Children.Add(Ui.Section("Производительность"));
        stack.Children.Add(Ui.ToggleRow("Пауза в играх и полноэкранных приложениях", S.PauseOnFullscreen, v => { S.PauseOnFullscreen = v; S.Save(); }));
        stack.Children.Add(Ui.ToggleRow("Пауза, когда окно развёрнуто", S.PauseOnMaximized, v => { S.PauseOnMaximized = v; S.Save(); }));
        stack.Children.Add(Ui.ToggleRow("Пауза при работе от батареи", S.PauseOnBattery, v => { S.PauseOnBattery = v; S.Save(); }));
        var apps = new TextBox { Text = string.Join(", ", S.PauseApps), Width = 300 };
        apps.LostFocus += (_, _) =>
        {
            S.PauseApps = apps.Text.Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            S.Save();
        };
        stack.Children.Add(Ui.Row("Пауза в программах", apps, "Имена программ через запятую, например: obs64, photoshop, premiere."));

        stack.Children.Add(Ui.Section("Система"));
        stack.Children.Add(Ui.ToggleRow("Запускать вместе с Windows", Autostart.IsEnabled, Autostart.Set));
        var system = new WrapPanel { Margin = new Thickness(0, 8, 0, 0) };
        system.Children.Add(Ui.Button("Открыть папку настроек", () =>
        {
            Directory.CreateDirectory(Settings.Dir);
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{Settings.Dir}\"") { UseShellExecute = true });
        }));
        system.Children.Add(Ui.Button("Диагностика рабочего стола", () =>
            Process.Start(new ProcessStartInfo(app.WriteDiagnostics()) { UseShellExecute = true })));
        system.Children.Add(Ui.Button("Обновить превью", () =>
        {
            try { Directory.Delete(Thumbnails.Folder, true); } catch { /* нет папки */ }
            foreach (var i in Lib.Items) Thumbnails.Invalidate(i);
            nav.SelectedIndex = 0;
        }));
        system.Children.Add(Ui.Button("Выйти из программы", app.Exit));
        stack.Children.Add(system);
        stack.Children.Add(Ui.Hint($"Живые обои 2.0 · Windows {Environment.OSVersion.Version} · " +
                                   $"WebView2: {(WebWallpaper.IsAvailable ? "есть" : "нет")}"));
        return Ui.Page(stack);
    }
}
