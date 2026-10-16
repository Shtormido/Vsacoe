using System;
using System.Windows.Interop;
using System.Windows.Media;
using WF = System.Windows.Forms;

namespace JivieOboi;

/// <summary>Окно обоев на одном мониторе, встроенное в рабочий стол позади иконок.</summary>
internal sealed class DesktopWallpaper : IDisposable
{
    readonly HwndSource source;

    public WallpaperView View { get; }
    public bool IsPrimary { get; }
    public IntPtr Handle => source.Handle;

    public DesktopWallpaper(DesktopTarget target, WF.Screen screen, Settings settings)
    {
        IsPrimary = screen.Primary;
        var b = screen.Bounds;
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

        View = new WallpaperView(settings, soundAllowed: IsPrimary);
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
