using System;
using System.Windows;
using System.Windows.Media;

namespace JivieOboi.Scenes;

/// <summary>Частицы, соединённые линиями; тянутся к курсору мыши.</summary>
internal sealed class ParticlesScene : SceneElement
{
    struct Particle { public double X, Y, Vx, Vy, R; }

    const double LinkDistance = 150;
    const double CursorDistance = 220;

    static readonly Brush Background = Frozen(new RadialGradientBrush(
        Color.FromRgb(0x0B, 0x1A, 0x33), Color.FromRgb(0x02, 0x04, 0x0A)));
    Brush dot = Brushes.White;
    Pen[] pens = Array.Empty<Pen>();

    readonly Random rnd = new();
    Particle[] ps = Array.Empty<Particle>();

    public ParticlesScene(int fps, SceneOptions options) : base(fps, options) => OnOptionsChanged();

    protected override void OnOptionsChanged()
    {
        var c = FromHsv(205 + Options.Hue, 0.53, 1);
        pens = new Pen[20];
        for (int i = 0; i < pens.Length; i++)
            pens[i] = Frozen(new Pen(Frozen(new SolidColorBrush(Color.FromArgb((byte)(i * 9), c.R, c.G, c.B))), 1));
        var d = FromHsv(205 + Options.Hue, 0.33, 1, 230);
        dot = Frozen(new SolidColorBrush(d));
    }

    protected override void OnResize(double w, double h)
    {
        int n = (int)Math.Clamp(w * h / 14000, 40, 220);
        if (n == ps.Length) return;
        ps = new Particle[n];
        for (int i = 0; i < n; i++)
        {
            double angle = rnd.NextDouble() * Math.PI * 2, speed = 12 + rnd.NextDouble() * 30;
            ps[i] = new Particle
            {
                X = rnd.NextDouble() * w, Y = rnd.NextDouble() * h,
                Vx = Math.Cos(angle) * speed, Vy = Math.Sin(angle) * speed,
                R = 1 + rnd.NextDouble() * 1.8,
            };
        }
    }

    Point? CursorInside(double w, double h)
    {
        try
        {
            if (!Native.GetCursorPos(out var p) || PresentationSource.FromVisual(this) == null) return null;
            var local = PointFromScreen(new Point(p.X, p.Y));
            return local.X >= 0 && local.Y >= 0 && local.X <= w && local.Y <= h ? local : null;
        }
        catch
        {
            return null;
        }
    }

    protected override void Draw(DrawingContext dc, double w, double h, double t, double dt)
    {
        dc.DrawRectangle(Background, null, new Rect(0, 0, w, h));
        var cursor = CursorInside(w, h);
        double bass = Bass;
        double link = LinkDistance * (1 + 0.5 * bass);
        dt *= 1 + 2.5 * bass;

        for (int i = 0; i < ps.Length; i++)
        {
            ref var p = ref ps[i];
            p.X += p.Vx * dt;
            p.Y += p.Vy * dt;
            if (p.X < 0) { p.X = 0; p.Vx = Math.Abs(p.Vx); }
            if (p.X > w) { p.X = w; p.Vx = -Math.Abs(p.Vx); }
            if (p.Y < 0) { p.Y = 0; p.Vy = Math.Abs(p.Vy); }
            if (p.Y > h) { p.Y = h; p.Vy = -Math.Abs(p.Vy); }
        }

        double link2 = link * link;
        for (int i = 0; i < ps.Length; i++)
        {
            for (int j = i + 1; j < ps.Length; j++)
            {
                double dx = ps[i].X - ps[j].X, dy = ps[i].Y - ps[j].Y, d2 = dx * dx + dy * dy;
                if (d2 >= link2) continue;
                double a = 1 - Math.Sqrt(d2) / link;
                dc.DrawLine(pens[(int)(a * 19)], new Point(ps[i].X, ps[i].Y), new Point(ps[j].X, ps[j].Y));
            }

            if (cursor is Point c)
            {
                double dx = c.X - ps[i].X, dy = c.Y - ps[i].Y, d = Math.Sqrt(dx * dx + dy * dy);
                if (d < CursorDistance)
                {
                    dc.DrawLine(pens[19], new Point(ps[i].X, ps[i].Y), c);
                    ps[i].X += dx / d * 12 * dt; // лёгкое притяжение
                    ps[i].Y += dy / d * 12 * dt;
                }
            }
        }

        foreach (var p in ps)
            dc.DrawEllipse(dot, null, new Point(p.X, p.Y), p.R * (1 + bass), p.R * (1 + bass));
    }
}
