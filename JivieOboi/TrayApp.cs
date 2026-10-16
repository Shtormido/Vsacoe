using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using JivieOboi.Lock;
using JivieOboi.Scenes;
using Microsoft.Win32;
using Drawing = System.Drawing;
using WF = System.Windows.Forms;

namespace JivieOboi;

/// <summary>Основной режим: обои на рабочем столе + значок в трее с меню.</summary>
internal sealed class TrayApp
{
    const int HotkeyId = 0x4A4F;
    const uint VK_L = 0x4C;

    readonly Settings s = Settings.Load();
    readonly List<DesktopWallpaper> walls = new();
    readonly DispatcherTimer watch = new() { Interval = TimeSpan.FromSeconds(1.5) };
    readonly DispatcherTimer lockSync = new();
    readonly DispatcherTimer rebuild = new() { Interval = TimeSpan.FromSeconds(1.5) };

    WF.NotifyIcon? tray;
    IntPtr iconHandle;
    HwndSource? messages;
    uint taskbarCreated;
    bool autoPaused, sessionLocked, hotkeyRegistered, cleanedUp;
    LockOverlay? overlay;

    static Dispatcher UI => Application.Current.Dispatcher;

    public void Start()
    {
        CreateTray();
        CreateMessageWindow();
        BuildWallpapers();

        rebuild.Tick += (_, _) => { rebuild.Stop(); BuildWallpapers(); };
        watch.Tick += (_, _) => Watch();
        watch.Start();
        lockSync.Tick += (_, _) =>
        {
            if (!sessionLocked && overlay == null) _ = SyncLockScreenAsync(false);
        };
        ApplyLockSyncTimer();

        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        SystemEvents.SessionSwitch += OnSessionSwitch;
        WindowsScreensaver.RefreshIfInstalled();
    }

    // ───────────────────────── обои ─────────────────────────

    void BuildWallpapers()
    {
        DisposeWallpapers();
        var target = DesktopHost.Find();
        if (target is null)
        {
            Notify("Не найден рабочий стол Explorer. Попробую ещё раз позже.");
            return;
        }
        foreach (var screen in WF.Screen.AllScreens)
        {
            try
            {
                walls.Add(new DesktopWallpaper(target.Value, screen, s));
            }
            catch (Exception ex)
            {
                Log.Error("Создание обоев на мониторе " + screen.DeviceName, ex);
            }
        }
        UpdatePauseState();
    }

    void DisposeWallpapers()
    {
        foreach (var w in walls) w.Dispose();
        walls.Clear();
    }

    void ScheduleRebuild()
    {
        rebuild.Stop();
        rebuild.Start();
    }

    void UpdatePauseState()
    {
        bool paused = s.Paused || autoPaused || sessionLocked || overlay != null;
        foreach (var w in walls) w.View.SetPaused(paused);
        if (tray != null)
            tray.Text = paused ? "Живые обои — пауза" : "Живые обои";
    }

    /// <summary>Пауза при полноэкранных приложениях / развёрнутых окнах / от батареи и живая заставка при бездействии.</summary>
    void Watch()
    {
        bool pause = false, fullscreenApp = false;
        if (s.PauseOnBattery && WF.SystemInformation.PowerStatus.PowerLineStatus == WF.PowerLineStatus.Offline)
            pause = true;

        var fg = Native.GetForegroundWindow();
        if (fg != IntPtr.Zero && !Native.IsOwnWindow(fg) && !IsShellWindow(fg))
        {
            if (Native.IsFullscreen(fg))
            {
                fullscreenApp = true;
                if (s.PauseOnFullscreen) pause = true;
            }
            if (s.PauseOnMaximized && Native.IsZoomed(fg)) pause = true;
        }

        if (pause != autoPaused)
        {
            autoPaused = pause;
            UpdatePauseState();
        }

        if (s.IdleOverlayMinutes > 0 && overlay == null && !sessionLocked && !fullscreenApp
            && Native.IdleSeconds() >= s.IdleOverlayMinutes * 60)
            ShowLockOverlay(s.LockAfterIdleOverlay);
    }

    static bool IsShellWindow(IntPtr hwnd) => Native.ClassName(hwnd) is
        "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd" or "NotifyIconOverflowWindow";

    void OnDisplaySettingsChanged(object? sender, EventArgs e) => UI.BeginInvoke(ScheduleRebuild);

    void OnSessionSwitch(object? sender, SessionSwitchEventArgs e) => UI.BeginInvoke(() =>
    {
        switch (e.Reason)
        {
            case SessionSwitchReason.SessionLock:
                // Win+L и т.п.: успеваем отдать экрану блокировки текущий кадр.
                if (s.LockScreenSync && overlay == null) _ = SyncLockScreenAsync(false);
                sessionLocked = true;
                UpdatePauseState();
                break;
            case SessionSwitchReason.SessionUnlock:
                sessionLocked = false;
                UpdatePauseState();
                break;
        }
    });

    // ───────────────────── экран блокировки ─────────────────────

    WallpaperView? PrimaryView => (walls.FirstOrDefault(w => w.IsPrimary) ?? walls.FirstOrDefault())?.View;

    async Task SyncLockScreenAsync(bool userInitiated)
    {
        var view = PrimaryView;
        bool ok = view != null && await LockScreenImage.TryApplyAsync(view, 10000);
        if (userInitiated)
            Notify(ok
                ? "Картинка экрана блокировки обновлена."
                : "Не удалось обновить экран блокировки. Подробности — в error.log.");
    }

    void ApplyLockSyncTimer()
    {
        lockSync.Stop();
        if (s.LockScreenSyncMinutes > 0)
        {
            lockSync.Interval = TimeSpan.FromMinutes(s.LockScreenSyncMinutes);
            lockSync.Start();
        }
    }

    /// <summary>Показывает живой экран блокировки; при любом действии — блокирует ПК (если <paramref name="lockAfter"/>).</summary>
    void ShowLockOverlay(bool lockAfter)
    {
        if (overlay != null) return;
        var o = new LockOverlay(s);
        overlay = o;
        UpdatePauseState();

        o.Dismissed += async () =>
        {
            try
            {
                if (lockAfter)
                {
                    if (s.LockScreenSync) await LockScreenImage.TryApplyAsync(o.PrimaryView, 1500);
                    Native.LockWorkStation();
                    // Даём системному экрану блокировки появиться, чтобы не мелькнул рабочий стол.
                    await Task.Delay(1200);
                }
            }
            catch (Exception ex)
            {
                Log.Error("Живой экран блокировки", ex);
            }
            o.Close();
            if (overlay == o) overlay = null;
            UpdatePauseState();
        };

        try
        {
            o.Show();
        }
        catch (Exception ex)
        {
            Log.Error("Показ живого экрана блокировки", ex);
            o.Close();
            overlay = null;
            UpdatePauseState();
        }
    }

    // ───────────────────────── трей ─────────────────────────

    void CreateTray()
    {
        var menu = new WF.ContextMenuStrip();
        menu.Opening += (_, e) =>
        {
            BuildMenu(menu);
            e.Cancel = false;
        };
        menu.Items.Add("…");

        tray = new WF.NotifyIcon
        {
            Icon = CreateIcon(),
            Text = "Живые обои",
            ContextMenuStrip = menu,
            Visible = true,
        };
        tray.DoubleClick += (_, _) => Safe(TogglePause);
    }

    void BuildMenu(WF.ContextMenuStrip menu)
    {
        menu.Items.Clear();
        menu.Items.Add(new WF.ToolStripMenuItem("Живые обои") { Enabled = false, Font = new Drawing.Font(menu.Font, Drawing.FontStyle.Bold) });
        menu.Items.Add(new WF.ToolStripSeparator());

        menu.Items.Add(Item("Выбрать файл (видео, GIF, картинка)…", PickFile, s.SourceType == "file"));
        var scenes = new WF.ToolStripMenuItem("Встроенные анимации");
        foreach (var (id, title) in SceneCatalog.All)
            scenes.DropDownItems.Add(Item(title, () => { s.SourceType = "scene"; s.Scene = id; SaveAndRebuild(); },
                s.SourceType == "scene" && s.Scene == id));
        menu.Items.Add(scenes);
        menu.Items.Add(new WF.ToolStripSeparator());

        menu.Items.Add(Item("Пауза", TogglePause, s.Paused));

        var sound = new WF.ToolStripMenuItem("Звук видео");
        foreach (var (title, value) in new[] { ("Без звука", 0.0), ("10%", 0.1), ("25%", 0.25), ("50%", 0.5), ("100%", 1.0) })
            sound.DropDownItems.Add(Item(title, () => SetVolume(value), Math.Abs(s.Volume - value) < 0.001));
        menu.Items.Add(sound);

        var stretch = new WF.ToolStripMenuItem("Масштаб");
        foreach (var (title, value) in new[] { ("Заполнить экран (с обрезкой)", "UniformToFill"), ("Вписать целиком", "Uniform"), ("Растянуть", "Fill") })
            stretch.DropDownItems.Add(Item(title, () => { s.Stretch = value; SaveAndRebuild(); }, s.Stretch == value));
        menu.Items.Add(stretch);

        var perf = new WF.ToolStripMenuItem("Производительность");
        perf.DropDownItems.Add(Item("Пауза в полноэкранных приложениях и играх", () => { s.PauseOnFullscreen = !s.PauseOnFullscreen; s.Save(); }, s.PauseOnFullscreen));
        perf.DropDownItems.Add(Item("Пауза, когда окно развёрнуто", () => { s.PauseOnMaximized = !s.PauseOnMaximized; s.Save(); }, s.PauseOnMaximized));
        perf.DropDownItems.Add(Item("Пауза при работе от батареи", () => { s.PauseOnBattery = !s.PauseOnBattery; s.Save(); }, s.PauseOnBattery));
        var fps = new WF.ToolStripMenuItem("Кадров в секунду (анимации)");
        foreach (var value in new[] { 24, 30, 60 })
            fps.DropDownItems.Add(Item(value.ToString(), () => { s.SceneFps = value; SaveAndRebuild(); }, s.SceneFps == value));
        perf.DropDownItems.Add(fps);
        menu.Items.Add(perf);
        menu.Items.Add(new WF.ToolStripSeparator());

        menu.Items.Add(BuildLockMenu());
        menu.Items.Add(new WF.ToolStripSeparator());

        menu.Items.Add(Item("Запускать вместе с Windows", () => Autostart.Set(!Autostart.IsEnabled), Autostart.IsEnabled));
        menu.Items.Add(Item("Открыть папку настроек", () =>
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{Settings.Dir}\"") { UseShellExecute = true })));
        menu.Items.Add(Item("Выход", Exit));
    }

    WF.ToolStripMenuItem BuildLockMenu()
    {
        var root = new WF.ToolStripMenuItem("Экран блокировки");

        var lockNow = Item("Заблокировать с живыми обоями", () => ShowLockOverlay(true));
        if (hotkeyRegistered) lockNow.ShortcutKeyDisplayString = "Ctrl+Alt+L";
        root.DropDownItems.Add(lockNow);
        root.DropDownItems.Add(Item("Поставить текущий кадр на экран блокировки", () => _ = SyncLockScreenAsync(true)));
        root.DropDownItems.Add(new WF.ToolStripSeparator());

        root.DropDownItems.Add(Item("Ставить кадр обоев на экран блокировки при блокировке",
            () => { s.LockScreenSync = !s.LockScreenSync; s.Save(); }, s.LockScreenSync));
        var sync = new WF.ToolStripMenuItem("Обновлять картинку экрана блокировки");
        foreach (var (title, minutes) in new[] { ("Только при блокировке", 0), ("Каждые 5 минут", 5), ("Каждые 15 минут", 15), ("Каждый час", 60) })
            sync.DropDownItems.Add(Item(title, () => { s.LockScreenSyncMinutes = minutes; s.Save(); ApplyLockSyncTimer(); },
                s.LockScreenSyncMinutes == minutes));
        root.DropDownItems.Add(sync);
        root.DropDownItems.Add(new WF.ToolStripSeparator());

        var idle = new WF.ToolStripMenuItem("Живая заставка при бездействии");
        foreach (var (title, minutes) in new[] { ("Выключена", 0), ("Через 1 минуту", 1), ("Через 3 минуты", 3), ("Через 5 минут", 5), ("Через 10 минут", 10), ("Через 15 минут", 15), ("Через 30 минут", 30) })
            idle.DropDownItems.Add(Item(title, () => { s.IdleOverlayMinutes = minutes; s.Save(); }, s.IdleOverlayMinutes == minutes));
        root.DropDownItems.Add(idle);
        root.DropDownItems.Add(Item("Блокировать ПК после заставки (пароль)",
            () => { s.LockAfterIdleOverlay = !s.LockAfterIdleOverlay; s.Save(); }, s.LockAfterIdleOverlay));
        root.DropDownItems.Add(Item("Показывать часы и дату", () => { s.ShowClock = !s.ShowClock; s.Save(); }, s.ShowClock));
        root.DropDownItems.Add(Item("Горячая клавиша Ctrl+Alt+L", ToggleHotkey, s.LockHotkey));
        root.DropDownItems.Add(new WF.ToolStripSeparator());

        if (WindowsScreensaver.IsInstalled())
        {
            root.DropDownItems.Add(Item("Параметры заставки Windows…", WindowsScreensaver.OpenWindowsSettings));
            root.DropDownItems.Add(Item("Убрать из заставок Windows", () =>
            {
                WindowsScreensaver.Uninstall();
                Notify("Заставка Windows отключена.");
            }));
        }
        else
        {
            root.DropDownItems.Add(Item("Сделать заставкой Windows (.scr)", () =>
            {
                WindowsScreensaver.Install();
                Notify("Живые обои установлены как заставка Windows. После неё будет запрошен пароль.");
                WindowsScreensaver.OpenWindowsSettings();
            }));
        }
        return root;
    }

    WF.ToolStripMenuItem Item(string text, Action onClick, bool isChecked = false)
    {
        var item = new WF.ToolStripMenuItem(text) { Checked = isChecked };
        item.Click += (_, _) => Safe(onClick);
        return item;
    }

    void Safe(Action action)
    {
        try
        {
            action();
        }
        catch (Exception ex)
        {
            Log.Error("Команда меню", ex);
            Notify("Ошибка: " + ex.Message);
        }
    }

    void Notify(string text)
    {
        tray?.ShowBalloonTip(4000, "Живые обои", text, WF.ToolTipIcon.Info);
    }

    void PickFile()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Выберите живые обои",
            Filter = "Видео, GIF и картинки|*.mp4;*.m4v;*.mov;*.wmv;*.avi;*.mkv;*.webm;*.mpg;*.mpeg;*.3gp;*.ts;*.gif;*.jpg;*.jpeg;*.png;*.bmp;*.tif;*.tiff;*.webp" +
                     "|Видео|*.mp4;*.m4v;*.mov;*.wmv;*.avi;*.mkv;*.webm;*.mpg;*.mpeg;*.3gp;*.ts" +
                     "|Анимированный GIF|*.gif" +
                     "|Картинки|*.jpg;*.jpeg;*.png;*.bmp;*.tif;*.tiff;*.webp" +
                     "|Все файлы|*.*",
        };
        if (dialog.ShowDialog() != true) return;
        s.SourceType = "file";
        s.FilePath = dialog.FileName;
        SaveAndRebuild();
    }

    void TogglePause()
    {
        s.Paused = !s.Paused;
        s.Save();
        UpdatePauseState();
    }

    void SetVolume(double value)
    {
        s.Volume = value;
        s.Save();
        foreach (var w in walls) w.View.ApplyVolume(value);
    }

    void SaveAndRebuild()
    {
        s.Save();
        BuildWallpapers();
    }

    static System.Drawing.Icon CreateIcon(out IntPtr handle)
    {
        using var bmp = new Drawing.Bitmap(32, 32);
        using (var g = Drawing.Graphics.FromImage(bmp))
        {
            g.SmoothingMode = Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var brush = new Drawing.Drawing2D.LinearGradientBrush(
                new Drawing.Rectangle(0, 0, 32, 32), Drawing.Color.FromArgb(0, 200, 255), Drawing.Color.FromArgb(170, 60, 255), 45f);
            g.FillEllipse(brush, 1, 1, 30, 30);
            using var pen = new Drawing.Pen(Drawing.Color.White, 2.5f);
            g.DrawBezier(pen, 6, 20, 12, 8, 18, 28, 26, 13);
        }
        handle = bmp.GetHicon();
        return Drawing.Icon.FromHandle(handle);
    }

    System.Drawing.Icon CreateIcon()
    {
        var icon = CreateIcon(out var handle);
        iconHandle = handle;
        return icon;
    }

    // ─────────────── служебное окно: горячая клавиша и перезапуск Explorer ───────────────

    void CreateMessageWindow()
    {
        var parameters = new HwndSourceParameters("JivieOboiMessages")
        {
            Width = 0,
            Height = 0,
            WindowStyle = 0, // невидимое окно верхнего уровня — получает широковещательный TaskbarCreated
            ExtendedWindowStyle = Native.WS_EX_TOOLWINDOW,
        };
        messages = new HwndSource(parameters);
        messages.AddHook(WndProc);
        taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
        RegisterHotkey();
    }

    void RegisterHotkey()
    {
        if (messages == null || !s.LockHotkey || hotkeyRegistered) return;
        hotkeyRegistered = Native.RegisterHotKey(messages.Handle, HotkeyId,
            Native.MOD_CONTROL | Native.MOD_ALT | Native.MOD_NOREPEAT, VK_L);
        if (!hotkeyRegistered) Notify("Ctrl+Alt+L уже занята другой программой.");
    }

    void ToggleHotkey()
    {
        s.LockHotkey = !s.LockHotkey;
        s.Save();
        if (s.LockHotkey) RegisterHotkey();
        else if (hotkeyRegistered && messages != null)
        {
            Native.UnregisterHotKey(messages.Handle, HotkeyId);
            hotkeyRegistered = false;
        }
    }

    IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == Native.WM_HOTKEY && wParam.ToInt32() == HotkeyId)
        {
            handled = true;
            ShowLockOverlay(true);
        }
        else if (taskbarCreated != 0 && (uint)msg == taskbarCreated)
        {
            // Explorer перезапустился — наши окна погибли вместе со старым рабочим столом.
            ScheduleRebuild();
        }
        return IntPtr.Zero;
    }

    // ───────────────────────── выход ─────────────────────────

    void Exit()
    {
        Cleanup();
        Application.Current.Shutdown();
    }

    public void Cleanup()
    {
        if (cleanedUp) return;
        cleanedUp = true;
        watch.Stop();
        lockSync.Stop();
        rebuild.Stop();
        SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        overlay?.Close();
        DisposeWallpapers();
        DesktopHost.RestoreSystemWallpaper();
        if (messages != null)
        {
            if (hotkeyRegistered) Native.UnregisterHotKey(messages.Handle, HotkeyId);
            messages.Dispose();
        }
        if (tray != null)
        {
            tray.Visible = false;
            tray.Dispose();
        }
        if (iconHandle != IntPtr.Zero) Native.DestroyIcon(iconHandle);
    }
}

internal static class Autostart
{
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string Name = "JivieOboi";

    public static bool IsEnabled
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(Name) is string;
        }
    }

    public static void Set(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled) key.SetValue(Name, $"\"{Environment.ProcessPath}\"");
        else key.DeleteValue(Name, false);
    }
}
