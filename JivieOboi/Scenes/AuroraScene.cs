using System;
using System.Windows;
using System.Windows.Media;

namespace JivieOboi.Scenes;

/// <summary>Плавно плывущие цветные пятна на звёздном небе.</summary>
internal sealed class AuroraScene : SceneElement
{
    readonly record struct Blob(double SpeedX, double SpeedY, double PhaseX, double PhaseY, double Hue, double Radius);
    readonly record struct Star(double X, double Y, double Phase, double Speed, double Size);

    static readonly Brush Background = Frozen(new LinearGradientBrush(
        Color.FromRgb(0x03, 0x04, 0x0C), Color.FromRgb(0x0A, 0x10, 0x2E), 90));

    static readonly Brush[] StarBrushes = CreateStarBrushes();

    readonly Blob[] blobs;
    readonly Star[] stars;

    public AuroraScene(int fps) : base(fps)
    {
        var r = new Random();
        blobs = new Blob[6];
        for (int i = 0; i < blobs.Length; i++)
            blobs[i] = new Blob(
                0.03 + r.NextDouble() * 0.07, 0.03 + r.NextDouble() * 0.07,
                r.NextDouble() * Math.PI * 2, r.NextDouble() * Math.PI * 2,
                150 + i * 38, 0.35 + r.NextDouble() * 0.25);
        stars = new Star[160];
        for (int i = 0; i < stars.Length; i++)
            stars[i] = new Star(r.NextDouble(), r.NextDouble(), r.NextDouble() * 6.28,
                0.5 + r.NextDouble() * 2, 0.6 + r.NextDouble() * 1.2);
    }

    static Brush[] CreateStarBrushes()
    {
        var result = new Brush[21];
        for (int i = 0; i < result.Length; i++)
            result[i] = Frozen(new SolidColorBrush(Color.FromArgb((byte)(i * 12), 255, 255, 255)));
        return result;
    }

    protected override void Draw(DrawingContext dc, double w, double h, double t, double dt)
    {
        dc.DrawRectangle(Background, null, new Rect(0, 0, w, h));

        foreach (var s in stars)
        {
            double a = 0.2 + 0.6 * (0.5 + 0.5 * Math.Sin(t * s.Speed + s.Phase));
            dc.DrawEllipse(StarBrushes[(int)(a * 20)], null, new Point(s.X * w, s.Y * h), s.Size, s.Size);
        }

        double size = Math.Max(w, h);
        foreach (var b in blobs)
        {
            double x = w * (0.5 + 0.45 * Math.Sin(t * b.SpeedX + b.PhaseX));
            double y = h * (0.5 + 0.45 * Math.Cos(t * b.SpeedY + b.PhaseY));
            var c = FromHsv(b.Hue + t * 4, 0.75, 1);
            var brush = new RadialGradientBrush(new GradientStopCollection
            {
                new(Color.FromArgb(105, c.R, c.G, c.B), 0),
                new(Color.FromArgb(40, c.R, c.G, c.B), 0.5),
                new(Color.FromArgb(0, c.R, c.G, c.B), 1),
            });
            brush.Freeze();
            double radius = size * b.Radius * (0.9 + 0.1 * Math.Sin(t * 0.2 + b.PhaseX));
            dc.DrawEllipse(brush, null, new Point(x, y), radius, radius);
        }
    }
}
