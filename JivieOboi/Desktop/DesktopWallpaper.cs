using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using Rect = System.Drawing.Rectangle;
using WF = System.Windows.Forms;

namespace JivieOboi;

/// <summary>Где показываются обои: один монитор или все сразу (режим «растянуть»).</summary>
internal sealed record WallpaperSlot(string Key, Rect Bounds, bool Primary, string Title)
{
    public const string SpanKey = "span";

    /// <summary>Области показа для текущего режима и набора мониторов.</summary>
    public static List<WallpaperSlot> Current(Settings s)
    {
        if (s.Mode == "span")
            return new() { new WallpaperSlot(SpanKey, WF.SystemInformation.VirtualScreen, true, "Все мониторы") };
        return Monitors();
    }

    public static List<WallpaperSlot> Monitors() => WF.Screen.AllScreens
        .OrderBy(sc => sc.Bounds.X).ThenBy(sc => sc.Bounds.Y)
        .Select((sc, i) => new WallpaperSlot(sc.DeviceName, sc.Bounds, sc.Primary,
            $"Монитор {i + 1}{(sc.Primary ? " (основной)" : "")} — {sc.Bounds.Width}×{sc.Bounds.Height}"))
        .ToList();
}

/// <summary>
/// Способы встроить окно в рабочий стол. Разные сборки Windows 11 ведут себя по-разному,
/// поэтому программа пробует их по очереди и проверяет, видны ли обои на самом деле.
/// </summary>
internal enum EmbedMethod
{
    /// <summary>Как в Lively: обычное окно, затем стиль WS_CHILD (+ layered) и SetParent в рабочий стол.</summary>
    Reparent,
    /// <summary>Сразу создаётся дочернее окно рабочего стола (HwndSource с родителем).</summary>
    ChildWindow,
    /// <summary>Только Windows 11 24H2+: дочернее окно внутри нижнего WorkerW (без layered).</summary>
    InsideWorker,
}

/// <summary>Окно обоев, встроенное в рабочий стол позади иконок.</summary>
internal sealed class DesktopWallpaper : IDisposable
{
    /// <summary>Цвет-маячок для проверки, что обои видны (тёмно-синий, на обоях почти не встречается).</summary>
    public static readonly Color ProbeColor = Color.FromRgb(18, 26, 92);

    readonly Window? window;
    readonly HwndSource? source;
    readonly Border probe = new() { Background = new SolidColorBrush(ProbeColor), Visibility = Visibility.Collapsed };

    public WallpaperView View { get; }
    public WallpaperSlot Slot { get; }
    public EmbedMethod Method { get; }
    public IntPtr Handle { get; }

    public DesktopWallpaper(DesktopTarget target, WallpaperSlot slot, WallpaperView view, EmbedMethod method)
    {
        Slot = slot;
        View = view;
        Method = method;
        var root = new Grid { Background = Brushes.Black };
        root.Children.Add(view);
        root.Children.Add(probe);

        var parent = method == EmbedMethod.InsideWorker && target.BottomWorker != IntPtr.Zero ? target.BottomWorker : target.Parent;
        bool layered = target.Raised && method != EmbedMethod.InsideWorker;
        var b = slot.Bounds;

        if (method == EmbedMethod.ChildWindow)
        {
            var origin = new Native.POINT { X = b.X, Y = b.Y };
            Native.ScreenToClient(parent, ref origin);
            source = new HwndSource(new HwndSourceParameters("JivieOboiWallpaper", b.Width, b.Height)
            {
                ParentWindow = parent,
                PositionX = origin.X,
                PositionY = origin.Y,
                WindowStyle = Native.WS_CHILD | Native.WS_VISIBLE | Native.WS_CLIPSIBLINGS | Native.WS_CLIPCHILDREN,
                ExtendedWindowStyle = Native.WS_EX_NOACTIVATE | (layered ? Native.WS_EX_LAYERED : 0),
            });
            Handle = source.Handle;
            if (layered) Native.SetLayeredWindowAttributes(Handle, 0, 255, Native.LWA_ALPHA);
            if (source.CompositionTarget != null) source.CompositionTarget.BackgroundColor = Colors.Black;
            source.RootVisual = root;
        }
        else
        {
            // Обычное окно за пределами экрана → стили → SetParent → позиция внутри рабочего стола.
            window = new Window
            {
                Title = "JivieOboi Wallpaper",
                WindowStyle = WindowStyle.None,
                ResizeMode = ResizeMode.NoResize,
                ShowInTaskbar = false,
                ShowActivated = false,
                Background = Brushes.Black,
                WindowStartupLocation = WindowStartupLocation.Manual,
                Left = -32000,
                Top = -32000,
                Width = 64,
                Height = 64,
                Content = root,
            };
            Handle = new WindowInteropHelper(window).EnsureHandle();

            long ex = Native.GetWindowLongPtr(Handle, Native.GWL_EXSTYLE).ToInt64()
                      | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            if (layered) ex |= Native.WS_EX_LAYERED;
            Native.SetWindowLongPtr(Handle, Native.GWL_EXSTYLE, new IntPtr(ex));
            // Layered нужно включить ДО SetParent — после него флаг может не примениться.
            if (layered) Native.SetLayeredWindowAttributes(Handle, 0, 255, Native.LWA_ALPHA);

            window.Show();

            long style = Native.GetWindowLongPtr(Handle, Native.GWL_STYLE).ToInt64();
            style &= ~(Native.WS_POPUP | Native.WS_CAPTION | Native.WS_THICKFRAME | Native.WS_SYSMENU
                       | Native.WS_MINIMIZEBOX | Native.WS_MAXIMIZEBOX);
            style |= Native.WS_CHILD | Native.WS_CLIPSIBLINGS | Native.WS_CLIPCHILDREN;
            Native.SetWindowLongPtr(Handle, Native.GWL_STYLE, new IntPtr(style));

            if (Native.SetParent(Handle, parent) == IntPtr.Zero)
                Log.Write($"SetParent не удался ({method}): ошибка {System.Runtime.InteropServices.Marshal.GetLastWin32Error()}");

            var origin = new Native.POINT { X = b.X, Y = b.Y };
            Native.ScreenToClient(parent, ref origin);
            Native.SetWindowPos(Handle, IntPtr.Zero, origin.X, origin.Y, b.Width, b.Height,
                Native.SWP_NOZORDER | Native.SWP_NOACTIVATE | Native.SWP_FRAMECHANGED | Native.SWP_SHOWWINDOW);
        }

        if (method != EmbedMethod.InsideWorker) DesktopHost.FixZOrder(Handle, target);
    }

    /// <summary>Залить окно цветом-маячком (на время проверки видимости).</summary>
    public void ShowProbe(bool visible) => probe.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

    public void Dispose()
    {
        try
        {
            View.Dispose();
            if (source != null)
            {
                source.RootVisual = null;
                source.Dispose();
            }
            window?.Close();
        }
        catch (Exception ex)
        {
            // Окно могло уже исчезнуть вместе с перезапущенным Explorer.
            Log.Error("Закрытие окна обоев", ex);
        }
    }
}

/// <summary>Проверка «на глаз»: что на самом деле видно на экране в местах, где открыт рабочий стол.</summary>
internal static class DesktopProbe
{
    /// <returns>true — обои видны, false — не видны, null — проверить нельзя (рабочий стол закрыт окнами).</returns>
    public static bool? Check(Rect bounds, Color expected)
    {
        var dc = Native.GetDC(IntPtr.Zero);
        if (dc == IntPtr.Zero) return null;
        int samples = 0, matches = 0;
        try
        {
            for (int gx = 1; gx <= 9; gx++)
            {
                for (int gy = 1; gy <= 7; gy++)
                {
                    var pt = new Native.POINT { X = bounds.X + bounds.Width * gx / 10, Y = bounds.Y + bounds.Height * gy / 8 };
                    if (!Native.IsDesktopAt(pt)) continue;
                    uint c = Native.GetPixel(dc, pt.X, pt.Y);
                    if (c == 0xFFFFFFFF) continue;
                    samples++;
                    int r = (int)(c & 0xFF), g = (int)((c >> 8) & 0xFF), bl = (int)((c >> 16) & 0xFF);
                    if (Math.Abs(r - expected.R) <= 14 && Math.Abs(g - expected.G) <= 14 && Math.Abs(bl - expected.B) <= 14)
                        matches++;
                }
            }
        }
        finally
        {
            Native.ReleaseDC(IntPtr.Zero, dc);
        }
        Log.Write($"Проверка видимости обоев: точек {samples}, совпало {matches}");
        if (samples < 2) return null;
        return matches >= 2 || matches * 3 >= samples;
    }
}
