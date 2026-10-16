using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;

namespace JivieOboi.Lock;

/// <summary>
/// «Живой экран блокировки» на всех подключённых мониторах: на каждом — свои обои
/// (как на рабочем столе или отдельные для блокировки), часы — на всех или только на основном.
/// Подключили или отключили монитор — окна пересоздаются на лету.
/// Любое действие пользователя вызывает <see cref="Dismissed"/>, после чего вызывающий код
/// блокирует компьютер и Windows показывает обычный экран ввода пароля.
/// </summary>
internal sealed class LockOverlay
{
    readonly Settings settings;
    readonly Func<WallpaperSlot, WallpaperItem> itemFor;
    readonly List<OverlayWindow> windows = new();
    readonly DispatcherTimer guard = new() { Interval = TimeSpan.FromMilliseconds(100) };
    readonly DispatcherTimer displayDebounce = new() { Interval = TimeSpan.FromMilliseconds(800) };
    DateTime shownAt;
    bool armed, fired, wasForeground, closed;
    uint lastInput;
    Native.POINT cursorAtArm;

    public event Action? Dismissed;

    public LockOverlay(Settings settings, Func<WallpaperSlot, WallpaperItem> itemFor)
    {
        this.settings = settings;
        this.itemFor = itemFor;
        guard.Tick += (_, _) => Guard();
        displayDebounce.Tick += (_, _) =>
        {
            displayDebounce.Stop();
            if (closed) return;
            CloseWindows();
            CreateWindows();
        };
    }

    public WallpaperView? PrimaryView =>
        (windows.FirstOrDefault(w => w.Slot.Primary) ?? windows.FirstOrDefault())?.View;

    public void Show()
    {
        CreateWindows();
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        AudioSpectrum.Instance.Updated += OnAudio;
        shownAt = DateTime.UtcNow;
        guard.Start();
    }

    void CreateWindows()
    {
        foreach (var slot in WallpaperSlot.Current(settings))
        {
            var window = new OverlayWindow(slot, itemFor(slot), settings,
                showClock: settings.ShowClock && (settings.ClockOnAllMonitors || slot.Primary),
                showHint: slot.Primary);
            window.UserInput += Fire;
            windows.Add(window);
            window.Show();
        }
        (windows.FirstOrDefault(w => w.Slot.Primary) ?? windows.FirstOrDefault())?.Activate();
    }

    void OnDisplaySettingsChanged(object? sender, EventArgs e) =>
        Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            displayDebounce.Stop();
            displayDebounce.Start();
        });

    void OnAudio(float[] values)
    {
        foreach (var w in windows) w.View.PushAudio(values);
    }

    /// <summary>
    /// Ловит ввод, который ушёл не в наши окна (если Windows не дала им фокус),
    /// и потерю фокуса (Alt+Tab, Win) — тогда тоже блокируем.
    /// </summary>
    void Guard()
    {
        if (fired) return;
        if (!armed)
        {
            // Первую секунду игнорируем ввод: отпускание горячей клавиши и т.п.
            if ((DateTime.UtcNow - shownAt).TotalMilliseconds < 1000) return;
            armed = true;
            lastInput = Native.LastInputTick();
            Native.GetCursorPos(out cursorAtArm);
            return;
        }
        if (displayDebounce.IsEnabled) return; // окна пересоздаются — фокус мог потеряться

        bool ours = Native.IsOwnWindow(Native.GetForegroundWindow());
        if (ours) wasForeground = true;
        else if (wasForeground) { Fire(); return; }

        var input = Native.LastInputTick();
        if (input == lastInput) return;
        lastInput = input;
        if (ours) return; // ввод придёт событиями WPF

        Native.GetCursorPos(out var p);
        if (Math.Abs(p.X - cursorAtArm.X) + Math.Abs(p.Y - cursorAtArm.Y) > 16 || Native.AnyKeyDown())
            Fire();
    }

    void Fire()
    {
        if (!armed || fired) return;
        fired = true;
        guard.Stop();
        Dismissed?.Invoke();
    }

    void CloseWindows()
    {
        foreach (var w in windows)
        {
            try
            {
                w.View.Dispose();
                w.Close();
            }
            catch (Exception ex)
            {
                Log.Error("Закрытие заставки", ex);
            }
        }
        windows.Clear();
    }

    public void Close()
    {
        if (closed) return;
        closed = true;
        guard.Stop();
        displayDebounce.Stop();
        SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
        AudioSpectrum.Instance.Updated -= OnAudio;
        CloseWindows();
    }
}

internal sealed class OverlayWindow : Window
{
    Point? firstMouse;

    public WallpaperView View { get; }
    public WallpaperSlot Slot { get; }
    public event Action? UserInput;

    public OverlayWindow(WallpaperSlot slot, WallpaperItem item, Settings settings, bool showClock, bool showHint)
    {
        Slot = slot;
        var b = slot.Bounds;

        Title = "Живые обои — экран блокировки";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        Topmost = true;
        Background = Brushes.Black;
        Cursor = Cursors.None;
        WindowStartupLocation = WindowStartupLocation.Manual;
        Left = b.X;
        Top = b.Y;
        Width = b.Width;
        Height = b.Height;

        View = new WallpaperView(item, settings, soundAllowed: false, desktopRole: false);
        var root = new Grid();
        root.Children.Add(View);
        if (showClock) root.Children.Add(new ClockPanel(showHint));
        Content = root;

        SourceInitialized += (_, _) => Place();
        Loaded += (_, _) =>
        {
            Place();
            View.SetPaused(false);
        };

        PreviewKeyDown += (_, e) => { e.Handled = true; UserInput?.Invoke(); };
        PreviewMouseDown += (_, e) => { e.Handled = true; UserInput?.Invoke(); };
        PreviewMouseWheel += (_, e) => { e.Handled = true; UserInput?.Invoke(); };
        PreviewMouseMove += (_, e) =>
        {
            var p = e.GetPosition(this);
            if (firstMouse is not Point start) { firstMouse = p; return; }
            if ((p - start).Length > 12) UserInput?.Invoke();
        };
    }

    /// <summary>Точные физические координаты монитора (WPF работает в DIP, а у мониторов может быть разный масштаб).</summary>
    void Place()
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        var b = Slot.Bounds;
        if (hwnd != IntPtr.Zero)
            Native.SetWindowPos(hwnd, Native.HWND_TOPMOST, b.X, b.Y, b.Width, b.Height, Native.SWP_SHOWWINDOW);
    }
}
