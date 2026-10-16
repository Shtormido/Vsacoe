using System;
using System.Collections.Generic;
using System.Linq;
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

/// <summary>Окно обоев, встроенное в рабочий стол позади иконок.</summary>
internal sealed class DesktopWallpaper : IDisposable
{
    readonly HwndSource source;

    public WallpaperView View { get; }
    public WallpaperSlot Slot { get; }
    public IntPtr Handle => source.Handle;

    public DesktopWallpaper(DesktopTarget target, WallpaperSlot slot, WallpaperView view)
    {
        Slot = slot;
        View = view;
        var b = slot.Bounds;
        var origin = new Native.POINT { X = b.X, Y = b.Y };
        Native.ScreenToClient(target.Parent, ref origin);

        var parameters = new HwndSourceParameters("JivieOboiWallpaper", b.Width, b.Height)
        {
            ParentWindow = target.Parent,
            PositionX = origin.X,
            PositionY = origin.Y,
            WindowStyle = Native.WS_CHILD | Native.WS_VISIBLE | Native.WS_CLIPSIBLINGS | Native.WS_CLIPCHILDREN,
            ExtendedWindowStyle = Native.WS_EX_NOACTIVATE | (target.Raised ? Native.WS_EX_LAYERED : 0),
        };
        source = new HwndSource(parameters);
        // Windows 11 24H2+: дочерние окна Progman отображаются только как layered.
        if (target.Raised) Native.SetLayeredWindowAttributes(source.Handle, 0, 255, Native.LWA_ALPHA);
        if (source.CompositionTarget != null) source.CompositionTarget.BackgroundColor = Colors.Black;

        source.RootVisual = View;
        DesktopHost.FixZOrder(source.Handle, target);
    }

    public void Dispose()
    {
        try
        {
            View.Dispose();
            source.RootVisual = null;
            source.Dispose();
        }
        catch (Exception ex)
        {
            // Окно могло уже исчезнуть вместе с перезапущенным Explorer.
            Log.Error("Закрытие окна обоев", ex);
        }
    }
}
