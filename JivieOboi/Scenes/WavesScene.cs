using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;

namespace JivieOboi.Scenes;

/// <summary>Светящиеся синусоиды, медленно меняющие цвет.</summary>
internal sealed class WavesScene : SceneElement
{
    const int Lines = 9;

    static readonly Brush Background = Frozen(new LinearGradientBrush(
        Color.FromRgb(0x0D, 0x02, 0x21), Color.FromRgb(0x03, 0x00, 0x0A), 90));

    public WavesScene(int fps) : base(fps) { }

    protected override void Draw(DrawingContext dc, double w, double h, double t, double dt)
    {
        dc.DrawRectangle(Background, null, new Rect(0, 0, w, h));
        double step = Math.Max(6, w / 240);
        var points = new List<Point>((int)(w / step) + 4);

        for (int i = 0; i < Lines; i++)
        {
            double k = i / (double)(Lines - 1);
            points.Clear();
            for (double x = -step; x <= w + step; x += step)
            {
                double nx = x / w;
                double y = h * (0.55 + (k - 0.5) * 0.25)
                           + h * 0.08 * Math.Sin(nx * Math.PI * 2 * (1.2 + k * 0.6) + t * (0.6 + k * 0.3) + i)
                           + h * 0.04 * Math.Sin(nx * Math.PI * 2 * 3.1 - t * 0.9 + k * 5);
                points.Add(new Point(x, y));
            }

            var geometry = new StreamGeometry();
            using (var g = geometry.Open())
            {
                g.BeginFigure(points[0], false, false);
                g.PolyLineTo(points.GetRange(1, points.Count - 1), true, false);
            }
            geometry.Freeze();

            var c = FromHsv(280 + 70 * Math.Sin(t * 0.1 + k * 2), 0.75, 1);
            var glow = Frozen(new Pen(Frozen(new SolidColorBrush(Color.FromArgb(38, c.R, c.G, c.B))), 9));
            var pen = Frozen(new Pen(Frozen(new SolidColorBrush(Color.FromArgb(210, c.R, c.G, c.B))), 1.6));
            dc.DrawGeometry(null, glow, geometry);
            dc.DrawGeometry(null, pen, geometry);
        }
    }
}
