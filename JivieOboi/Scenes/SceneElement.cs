using System;
using System.Diagnostics;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace JivieOboi.Scenes;

/// <summary>
/// Встроенная анимация. Кадр рисуется в DrawingGroup, поэтому обновление
/// не запускает перекомпоновку WPF — только перерисовку.
/// </summary>
internal abstract class SceneElement : FrameworkElement
{
    readonly DrawingGroup drawing = new();
    readonly DispatcherTimer timer;
    readonly Stopwatch clock = new();
    double last;

    protected SceneElement(int fps)
    {
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
        double t = clock.Elapsed.TotalSeconds;
        double dt = Math.Clamp(t - last, 0, 0.1);
        last = t;
        using var dc = drawing.Open();
        Draw(dc, w, h, t, dt);
    }

    protected virtual void OnResize(double w, double h) { }

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
    public static readonly (string Id, string Title)[] All =
    {
        ("aurora", "Северное сияние"),
        ("particles", "Сеть частиц"),
        ("matrix", "Матрица"),
        ("waves", "Неоновые волны"),
    };

    public static SceneElement Create(string id, int fps) => id switch
    {
        "particles" => new ParticlesScene(fps),
        "matrix" => new MatrixScene(fps),
        "waves" => new WavesScene(fps),
        _ => new AuroraScene(fps),
    };
}
