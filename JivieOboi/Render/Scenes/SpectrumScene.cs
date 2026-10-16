using System;
using System.Windows;
using System.Windows.Media;

namespace JivieOboi.Scenes;

/// <summary>Эквалайзер: столбики с отражением и кольцо, пульсирующее на басах. Без музыки — тихо «дышит».</summary>
internal sealed class SpectrumScene : SceneElement
{
    const int Bars = 64;

    static readonly Brush Background = Frozen(new RadialGradientBrush(
        Color.FromRgb(0x14, 0x0A, 0x2A), Color.FromRgb(0x02, 0x01, 0x06)));

    readonly double[] smooth = new double[Bars];

    public SpectrumScene(int fps, SceneOptions options) : base(fps, options) { }

    protected override void Draw(DrawingContext dc, double w, double h, double t, double dt)
    {
        dc.DrawRectangle(Background, null, new Rect(0, 0, w, h));
        var spectrum = Spectrum;

        // Значения полос: среднее левого и правого канала, без звука — плавная волна.
        for (int i = 0; i < Bars; i++)
        {
            double target = spectrum != null
                ? (spectrum[i] + spectrum[Bars + i]) / 2
                : 0.08 + 0.06 * Math.Sin(t * 1.3 + i * 0.25) * Math.Sin(t * 0.4 + i * 0.05);
            smooth[i] += (target - smooth[i]) * Math.Min(1, dt * 18);
        }

        double baseY = h * 0.72;
        double gap = w * 0.0025;
        double barW = (w * 0.8 - gap * (Bars - 1)) / Bars;
        double x0 = w * 0.1;
        double maxH = h * 0.42;

        for (int i = 0; i < Bars; i++)
        {
            double v = Math.Clamp(smooth[i], 0, 1.1);
            double bh = Math.Max(2, v * maxH);
            var c = FromHsv(Options.Hue + 200 + i * 2.2 + t * 6, 0.75, 1);
            var bar = Frozen(new LinearGradientBrush(
                Color.FromArgb(255, c.R, c.G, c.B), Color.FromArgb(120, c.R, c.G, c.B), 90));
            var reflect = Frozen(new LinearGradientBrush(
                Color.FromArgb(70, c.R, c.G, c.B), Color.FromArgb(0, c.R, c.G, c.B), 90));
            double x = x0 + i * (barW + gap);
            dc.DrawRoundedRectangle(bar, null, new Rect(x, baseY - bh, barW, bh), barW / 3, barW / 3);
            dc.DrawRectangle(reflect, null, new Rect(x, baseY + 4, barW, bh * 0.45));
        }

        // Кольцо по центру.
        double bass = spectrum != null ? Bass : 0.15 + 0.05 * Math.Sin(t * 2);
        var center = new Point(w / 2, h * 0.36);
        double r = Math.Min(w, h) * (0.11 + 0.06 * bass);
        var ring = FromHsv(Options.Hue + 280 + t * 10, 0.7, 1);
        var glow = Frozen(new RadialGradientBrush(new GradientStopCollection
        {
            new(Color.FromArgb(0, ring.R, ring.G, ring.B), 0.55),
            new(Color.FromArgb((byte)(90 + 120 * bass), ring.R, ring.G, ring.B), 0.8),
            new(Color.FromArgb(0, ring.R, ring.G, ring.B), 1),
        }));
        dc.DrawEllipse(glow, null, center, r * 1.6, r * 1.6);
        var pen = Frozen(new Pen(Frozen(new SolidColorBrush(Color.FromArgb(230, ring.R, ring.G, ring.B))), 2 + 4 * bass));
        dc.DrawEllipse(null, pen, center, r, r);
    }
}
