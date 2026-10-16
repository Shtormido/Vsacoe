using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using WF = System.Windows.Forms;

namespace JivieOboi.Lock;

/// <summary>
/// «Живой экран блокировки»: полноэкранные окна с обоями и часами на всех мониторах.
/// Любое действие пользователя вызывает <see cref="Dismissed"/>, после чего вызывающий код
/// блокирует компьютер и Windows показывает обычный экран ввода пароля.
/// </summary>
internal sealed class LockOverlay
{
    readonly Settings settings;
    readonly List<OverlayWindow> windows = new();
    readonly DispatcherTimer guard = new() { Interval = TimeSpan.FromMilliseconds(100) };
    DateTime shownAt;
    bool armed, fired, wasForeground;
    uint lastInput;
    Native.POINT cursorAtArm;

    public event Action? Dismissed;

    public LockOverlay(Settings settings)
    {
        this.settings = settings;
        guard.Tick += (_, _) => Guard();
    }

    public WallpaperView? PrimaryView =>
        (windows.FirstOrDefault(w => w.IsPrimary) ?? windows.FirstOrDefault())?.View;

    public void Show()
    {
        foreach (var screen in WF.Screen.AllScreens)
        {
            var window = new OverlayWindow(screen, settings);
            window.UserInput += Fire;
            windows.Add(window);
            window.Show();
        }
        (windows.FirstOrDefault(w => w.IsPrimary) ?? windows.FirstOrDefault())?.Activate();
        shownAt = DateTime.UtcNow;
        guard.Start();
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

    public void Close()
    {
        guard.Stop();
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
}

internal sealed class OverlayWindow : Window
{
    readonly System.Drawing.Rectangle bounds;
    Point? firstMouse;

    public WallpaperView View { get; }
    public bool IsPrimary { get; }
    public event Action? UserInput;

    public OverlayWindow(WF.Screen screen, Settings settings)
    {
        bounds = screen.Bounds;
        IsPrimary = screen.Primary;

        Title = "Живые обои — экран блокировки";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        Topmost = true;
        Background = Brushes.Black;
        Cursor = Cursors.None;
        WindowStartupLocation = WindowStartupLocation.Manual;
        Left = bounds.X;
        Top = bounds.Y;
        Width = bounds.Width;
        Height = bounds.Height;

        View = new WallpaperView(settings, soundAllowed: false);
        var root = new Grid();
        root.Children.Add(View);
        if (settings.ShowClock) root.Children.Add(new ClockPanel());
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
        if (hwnd != IntPtr.Zero)
            Native.SetWindowPos(hwnd, Native.HWND_TOPMOST, bounds.X, bounds.Y, bounds.Width, bounds.Height, Native.SWP_SHOWWINDOW);
    }
}
