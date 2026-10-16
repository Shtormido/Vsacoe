using System;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using JivieOboi.Lock;
using Microsoft.Win32;
using Drawing = System.Drawing;
using WF = System.Windows.Forms;

namespace JivieOboi;

/// <summary>
/// Основной режим программы: обои на рабочем столе, значок в трее, правила паузы,
/// живой экран блокировки и окно библиотеки. Окно библиотеки работает через этот класс.
/// </summary>
internal sealed class TrayApp
{
    public const string ShowWindowMessage = "JivieOboi.ShowWindow";
    const int HotkeyId = 0x4A4F;
    const uint VK_L = 0x4C;

    readonly DispatcherTimer watch = new() { Interval = TimeSpan.FromSeconds(1.5) };
    readonly DispatcherTimer lockSync = new();
    readonly DispatcherTimer rebuild = new() { Interval = TimeSpan.FromSeconds(1.5) };

    WF.NotifyIcon? tray;
    IntPtr iconHandle;
    HwndSource? messages;
    uint taskbarCreated, showWindowMsg;
    bool autoPaused, sessionLocked, hotkeyRegistered, cleanedUp, problemShown;
    int lockGeneration;
    uint lastForegroundPid;
    string lastForegroundName = "";
    LockOverlay? overlay;
    MainWindow? window;

    public Settings Settings { get; } = Settings.Load();
    public LibraryStore Library { get; } = LibraryStore.Load();
    public WallpaperManager Wallpapers { get; }

    /// <summary>Поменялось состояние (пауза и т.п.) — окну стоит обновиться.</summary>
    public event Action? StateChanged;

    public bool IsPaused => Settings.Paused;
    public bool IsAutoPaused => autoPaused;
    public bool HotkeyRegistered => hotkeyRegistered;
    public IntPtr IconHandle => iconHandle;

    static Dispatcher UI => Application.Current.Dispatcher;

    public TrayApp()
    {
        Wallpapers = new WallpaperManager(Settings, Library);
        Wallpapers.Problem += message =>
        {
            if (!problemShown) Notify(message);
            problemShown = true;
            ScheduleRebuild();
        };
        Wallpapers.Changed += () => problemShown = false;
    }

    public void Start(bool openWindow)
    {
        Library.MigrateFrom(Settings);
        if (Autostart.IsEnabled) Autostart.Set(true); // обновить путь и ключ /tray после обновления программы
        CreateTray();
        CreateMessageWindow();
        Wallpapers.Build();
        UpdatePauseState();

        rebuild.Tick += (_, _) => { rebuild.Stop(); Wallpapers.Build(); UpdatePauseState(); };
        watch.Tick += (_, _) => Watch();
        watch.Start();
        lockSync.Tick += (_, _) =>
        {
            if (!sessionLocked && overlay == null) _ = SyncLockScreenAsync(false);
        };
        ApplyLockSyncTimer();

        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        SystemEvents.SessionSwitch += OnSessionSwitch;
        SystemEvents.PowerModeChanged += OnPowerModeChanged;
        WindowsScreensaver.RefreshIfInstalled();

        if (openWindow) OpenWindow();
    }

    // ───────────────────────── окно ─────────────────────────

    public void OpenWindow()
    {
        if (window == null)
        {
            window = new MainWindow(this);
            window.Closed += (_, _) => window = null;
            window.Show();
        }
        if (window.WindowState == WindowState.Minimized) window.WindowState = WindowState.Normal;
        window.Activate();
    }

    // ───────────────────────── пауза ─────────────────────────

    public void TogglePause()
    {
        Settings.Paused = !Settings.Paused;
        Settings.Save();
        UpdatePauseState();
    }

    public void UpdatePauseState()
    {
        bool deep = autoPaused || sessionLocked || overlay != null;
        bool paused = Settings.Paused || deep;
        Wallpapers.SetPaused(paused, deep);
        AudioSpectrum.Instance.SetActive(Settings.AudioReactive && (!paused || overlay != null));
        // Пока на экране ничего не движется — «режим эффективности» Windows 11.
        Efficiency.Set(paused && overlay == null);
        if (tray != null) tray.Text = paused ? "Живые обои — пауза" : "Живые обои";
        StateChanged?.Invoke();
    }

    /// <summary>Пауза в играх и полноэкранных приложениях, в выбранных программах, от батареи; живая заставка при бездействии.</summary>
    void Watch()
    {
        if (!rebuild.IsEnabled && !Wallpapers.CheckDesktop()) ScheduleRebuild();

        bool pause = false, fullscreenApp = false;
        if (Settings.PauseOnBattery && WF.SystemInformation.PowerStatus.PowerLineStatus == WF.PowerLineStatus.Offline)
            pause = true;

        var fg = Native.GetForegroundWindow();
        if (fg != IntPtr.Zero && !Native.IsOwnWindow(fg) && !IsShellWindow(fg))
        {
            if (Native.IsFullscreen(fg))
            {
                fullscreenApp = true;
                if (Settings.PauseOnFullscreen) pause = true;
            }
            if (Settings.PauseOnMaximized && Native.IsZoomed(fg)) pause = true;
            if (Settings.PauseApps.Count > 0)
            {
                var name = ProcessName(fg);
                if (Settings.PauseApps.Any(a => string.Equals(a.Trim().Replace(".exe", "", StringComparison.OrdinalIgnoreCase), name, StringComparison.OrdinalIgnoreCase)))
                    pause = true;
            }
        }

        if (pause != autoPaused)
        {
            autoPaused = pause;
            UpdatePauseState();
        }

        if (Settings.IdleOverlayMinutes > 0 && overlay == null && !sessionLocked && !fullscreenApp
            && Native.IdleSeconds() >= Settings.IdleOverlayMinutes * 60)
            ShowLockOverlay(Settings.LockAfterIdleOverlay);
    }

    string ProcessName(IntPtr hwnd)
    {
        Native.GetWindowThreadProcessId(hwnd, out var pid);
        if (pid == lastForegroundPid) return lastForegroundName;
        lastForegroundPid = pid;
        try
        {
            using var p = Process.GetProcessById((int)pid);
            lastForegroundName = p.ProcessName;
        }
        catch
        {
            lastForegroundName = "";
        }
        return lastForegroundName;
    }

    static bool IsShellWindow(IntPtr hwnd) => Native.ClassName(hwnd) is
        "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd" or "NotifyIconOverflowWindow";

    public void ScheduleRebuild()
    {
        rebuild.Stop();
        rebuild.Start();
    }

    void OnDisplaySettingsChanged(object? sender, EventArgs e) => UI.BeginInvoke(ScheduleRebuild);

    // После сна Windows 11 может изменить размеры рабочего стола — пересоздаём окна.
    void OnPowerModeChanged(object? sender, PowerModeChangedEventArgs e)
    {
        if (e.Mode == PowerModes.Resume) UI.BeginInvoke(ScheduleRebuild);
    }

    void OnSessionSwitch(object? sender, SessionSwitchEventArgs e) => UI.BeginInvoke(async () =>
    {
        switch (e.Reason)
        {
            case SessionSwitchReason.SessionLock:
                int generation = ++lockGeneration;
                // Win+L и т.п.: успеваем отдать экрану блокировки текущий кадр, затем ставим на паузу.
                if (Settings.LockScreenSync && overlay == null)
                    await LockScreenImage.TryApplyAsync(Wallpapers.PrimaryView, 2500);
                if (generation != lockGeneration) return; // уже разблокировали
                sessionLocked = true;
                UpdatePauseState();
                break;
            case SessionSwitchReason.SessionUnlock:
                lockGeneration++;
                sessionLocked = false;
                UpdatePauseState();
                break;
        }
    });

    // ───────────────────── экран блокировки ─────────────────────

    public async Task SyncLockScreenAsync(bool userInitiated)
    {
        bool ok = await LockScreenImage.TryApplyAsync(Wallpapers.PrimaryView, 10000);
        if (userInitiated)
            Notify(ok
                ? "Картинка экрана блокировки обновлена."
                : "Не удалось обновить экран блокировки. Подробности — в error.log.");
    }

    public void ApplyLockSyncTimer()
    {
        lockSync.Stop();
        if (Settings.LockScreenSyncMinutes > 0)
        {
            lockSync.Interval = TimeSpan.FromMinutes(Settings.LockScreenSyncMinutes);
            lockSync.Start();
        }
    }

    WallpaperItem LockItemFor(WallpaperSlot slot) =>
        Settings.LockWallpaperId != null && Library.Find(Settings.LockWallpaperId) is WallpaperItem lockItem
            ? lockItem
            : Wallpapers.ItemFor(slot);

    /// <summary>Живой экран блокировки на всех мониторах; при любом действии — блокирует ПК (если <paramref name="lockAfter"/>).</summary>
    public void ShowLockOverlay(bool lockAfter)
    {
        if (overlay != null) return;
        var o = new LockOverlay(Settings, LockItemFor);
        overlay = o;
        UpdatePauseState();

        o.Dismissed += async () =>
        {
            try
            {
                if (lockAfter)
                {
                    if (Settings.LockScreenSync) await LockScreenImage.TryApplyAsync(o.PrimaryView, 1500);
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
            Win11MenuRenderer.Apply(menu, Win11Palette.Current());
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
        tray.MouseClick += (_, e) =>
        {
            if (e.Button == WF.MouseButtons.Left) Safe(OpenWindow);
        };
    }

    void BuildMenu(WF.ContextMenuStrip menu)
    {
        menu.Items.Clear();
        var open = Item("Открыть «Живые обои»", OpenWindow);
        open.Font = new Drawing.Font(menu.Font, Drawing.FontStyle.Bold);
        menu.Items.Add(open);
        menu.Items.Add(new WF.ToolStripSeparator());
        menu.Items.Add(Item(autoPaused && !Settings.Paused ? "Пауза (сейчас авто: игра или окно на весь экран)" : "Пауза",
            TogglePause, Settings.Paused));
        if (Settings.PlaylistEnabled) menu.Items.Add(Item("Следующие обои из плейлиста", Wallpapers.NextInPlaylist));
        var lockNow = Item("Заблокировать с живыми обоями", () => ShowLockOverlay(true));
        if (hotkeyRegistered) lockNow.ShortcutKeyDisplayString = "Ctrl+Alt+L";
        menu.Items.Add(lockNow);
        menu.Items.Add(new WF.ToolStripSeparator());
        menu.Items.Add(Item("Выход", Exit));
    }

    static WF.ToolStripMenuItem Item(string text, Action onClick, bool isChecked = false)
    {
        var item = new WF.ToolStripMenuItem(text) { Checked = isChecked };
        item.Click += (_, _) => Safe(onClick);
        return item;
    }

    static void Safe(Action action)
    {
        try
        {
            action();
        }
        catch (Exception ex)
        {
            Log.Error("Команда", ex);
            MessageBox.Show("Ошибка: " + ex.Message, "Живые обои", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    public void Notify(string text)
    {
        tray?.ShowBalloonTip(4000, "Живые обои", text, WF.ToolTipIcon.Info);
    }

    public void SetVolume(double value)
    {
        Settings.Volume = value;
        Settings.Save();
        Wallpapers.ApplyVolume();
    }

    public string WriteDiagnostics()
    {
        var path = System.IO.Path.Combine(Settings.Dir, "diagnostics.txt");
        System.IO.Directory.CreateDirectory(Settings.Dir);
        System.IO.File.WriteAllText(path, DesktopHost.Describe()
            + $"Окон обоев: {Wallpapers.Walls.Count}, мониторов: {WF.Screen.AllScreens.Length}{Environment.NewLine}"
            + $"WebView2: {(WebWallpaper.IsAvailable ? "есть" : "нет")}, звук: {(AudioSpectrum.Instance.IsRunning ? "захват идёт" : "выключен")}{Environment.NewLine}"
            + string.Join(Environment.NewLine, Wallpapers.Walls.Select(w => $"  {w.Slot.Title}: {w.View.Item.Title} ({w.View.Item.Type})")));
        return path;
    }

    Drawing.Icon CreateIcon()
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
        iconHandle = bmp.GetHicon();
        return Drawing.Icon.FromHandle(iconHandle);
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
        showWindowMsg = Native.RegisterWindowMessage(ShowWindowMessage);
        ApplyHotkey();
    }

    /// <summary>Включить или выключить Ctrl+Alt+L по настройке.</summary>
    public void ApplyHotkey()
    {
        if (messages == null) return;
        if (Settings.LockHotkey && !hotkeyRegistered)
        {
            hotkeyRegistered = Native.RegisterHotKey(messages.Handle, HotkeyId,
                Native.MOD_CONTROL | Native.MOD_ALT | Native.MOD_NOREPEAT, VK_L);
            if (!hotkeyRegistered) Notify("Ctrl+Alt+L уже занята другой программой.");
        }
        else if (!Settings.LockHotkey && hotkeyRegistered)
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
        else if (showWindowMsg != 0 && (uint)msg == showWindowMsg)
        {
            handled = true;
            OpenWindow();
        }
        else if (taskbarCreated != 0 && (uint)msg == taskbarCreated)
        {
            // Explorer перезапустился — наши окна погибли вместе со старым рабочим столом.
            ScheduleRebuild();
        }
        return IntPtr.Zero;
    }

    // ───────────────────────── выход ─────────────────────────

    public void Exit()
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
        SystemEvents.PowerModeChanged -= OnPowerModeChanged;
        window?.Close();
        overlay?.Close();
        Wallpapers.Shutdown();
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

    /// <summary>Автозапуск — с ключом /tray, чтобы окно библиотеки не открывалось при входе в Windows.</summary>
    public static void Set(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled) key.SetValue(Name, $"\"{Environment.ProcessPath}\" /tray");
        else key.DeleteValue(Name, false);
    }
}
