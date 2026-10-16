using System;
using System.Diagnostics;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace JivieOboi.Scenes;

/// <summary>Настройки встроенной анимации (свойства speed/hue/audio из библиотеки).</summary>
internal sealed class SceneOptions
{
    public double Speed { get; init; } = 1;
    public double Hue { get; init; }
    public bool Audio { get; init; } = true;

    public static SceneOptions From(WallpaperItem item) => new()
    {
        Speed = Math.Clamp(item.Number("speed", 1), 0.05, 5),
        Hue = item.Number("hue", 0),
        Audio = item.Flag("audio", true),
    };
}

/// <summary>
/// Встроенная анимация. Кадр рисуется в DrawingGroup, поэтому обновление
/// не запускает перекомпоновку WPF — только перерисовку.
/// </summary>
internal abstract class SceneElement : FrameworkElement
{
    readonly DrawingGroup drawing = new();
    readonly DispatcherTimer timer;
    readonly Stopwatch clock = new();
    double last, simTime;
    SceneOptions options;

    protected SceneElement(int fps, SceneOptions options)
    {
        this.options = options;
        IsHitTestVisible = false;
        timer = new DispatcherTimer(DispatcherPriority.Render)
        {
            Interval = TimeSpan.FromSeconds(1.0 / Math.Clamp(fps, 5, 144)),
        };
        timer.Tick += (_, _) => Frame();
        SizeChanged += (_, _) =>
        {
            OnResize(ActualWidth, ActualHeight);
            Frame();
        };
    }

    public SceneOptions Options
    {
        get => options;
        set
        {
            options = value;
            OnOptionsChanged();
        }
    }

    /// <summary>Сила басов 0…1 (0, если реакция на музыку выключена).</summary>
    protected float Bass => options.Audio ? AudioSpectrum.Instance.Bass : 0;

    /// <summary>Спектр (128 значений) или null, если реакция на музыку выключена.</summary>
    protected float[]? Spectrum => options.Audio && AudioSpectrum.Instance.IsRunning ? AudioSpectrum.Instance.Values : null;

    public void Start()
    {
        if (timer.IsEnabled) return;
        clock.Start();
        last = clock.Elapsed.TotalSeconds;
        timer.Start();
    }

    public void Stop()
    {
        timer.Stop();
        clock.Stop();
    }

    protected override void OnRender(DrawingContext dc) => dc.DrawDrawing(drawing);

    void Frame()
    {
        double w = ActualWidth, h = ActualHeight;
        if (w < 1 || h < 1) return;
        double now = clock.Elapsed.TotalSeconds;
        double dt = Math.Clamp(now - last, 0, 0.1) * options.Speed;
        last = now;
        simTime += dt;
        using var dc = drawing.Open();
        Draw(dc, w, h, simTime, dt);
    }

    /// <summary>Неподвижный кадр для превью в библиотеке.</summary>
    public BitmapSource RenderPreview(int w, int h)
    {
        OnResize(w, h);
        double t = 4;
        for (int i = 0; i < 45; i++)
        {
            t += 1 / 30.0;
            using var frame = drawing.Open();
            Draw(frame, w, h, t, 1 / 30.0);
        }
        var visual = new DrawingVisual();
        using (var dc = visual.RenderOpen()) dc.DrawDrawing(drawing);
        var bitmap = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(visual);
        bitmap.Freeze();
        return bitmap;
    }

    protected virtual void OnResize(double w, double h) { }

    protected virtual void OnOptionsChanged() { }

    protected abstract void Draw(DrawingContext dc, double w, double h, double t, double dt);

    protected static Color FromHsv(double hue, double sat, double val, byte alpha = 255)
    {
        hue = ((hue % 360) + 360) % 360;
        double c = val * sat;
        double x = c * (1 - Math.Abs(hue / 60 % 2 - 1));
        double m = val - c;
        (double r, double g, double b) = (int)(hue / 60) switch
        {
            0 => (c, x, 0.0),
            1 => (x, c, 0.0),
            2 => (0.0, c, x),
            3 => (0.0, x, c),
            4 => (x, 0.0, c),
            _ => (c, 0.0, x),
        };
        return Color.FromArgb(alpha, (byte)((r + m) * 255), (byte)((g + m) * 255), (byte)((b + m) * 255));
    }

    protected static T Frozen<T>(T freezable) where T : Freezable
    {
        freezable.Freeze();
        return freezable;
    }
}

internal static class SceneCatalog
{
    public static SceneElement Create(string id, int fps, SceneOptions options) => id switch
    {
        "particles" => new ParticlesScene(fps, options),
        "matrix" => new MatrixScene(fps, options),
        "waves" => new WavesScene(fps, options),
        "spectrum" => new SpectrumScene(fps, options),
        _ => new AuroraScene(fps, options),
    };
}
