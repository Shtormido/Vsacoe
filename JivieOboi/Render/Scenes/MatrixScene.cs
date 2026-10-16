using System;
using System.Collections.Generic;
using System.Globalization;
using System.Windows;
using System.Windows.Media;

namespace JivieOboi.Scenes;

/// <summary>Падающие символы в стиле «Матрицы».</summary>
internal sealed class MatrixScene : SceneElement
{
    sealed class Column
    {
        public double Head;
        public double Speed;
        public int Length;
        public int[] Glyphs = Array.Empty<int>();
    }

    const double Cell = 18;
    const int Levels = 12;
    const string Chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFZ:.=*+-<>";

    static readonly Typeface Face = new(new FontFamily("MS Gothic, Consolas"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
    Brush[] levelBrushes = Array.Empty<Brush>();

    readonly Random rnd = new();
    readonly Dictionary<int, FormattedText> cache = new();
    Column[] columns = Array.Empty<Column>();
    int rows;
    double pixelsPerDip = 1;

    public MatrixScene(int fps, SceneOptions options) : base(Math.Min(fps, 30), options) => OnOptionsChanged();

    protected override void OnOptionsChanged()
    {
        double hue = 135 + Options.Hue;
        var result = new Brush[Levels];
        result[0] = Frozen(new SolidColorBrush(FromHsv(hue, 0.15, 1)));
        for (int i = 1; i < Levels; i++)
        {
            byte a = (byte)(255 * (1 - (i - 1) / (double)(Levels - 1)) * 0.9 + 20);
            result[i] = Frozen(new SolidColorBrush(FromHsv(hue, 0.87, 1, a)));
        }
        levelBrushes = result;
        cache.Clear();
    }

    protected override void OnResize(double w, double h)
    {
        rows = (int)Math.Ceiling(h / Cell) + 1;
        int count = (int)Math.Ceiling(w / Cell);
        columns = new Column[count];
        for (int i = 0; i < count; i++)
        {
            var c = new Column { Glyphs = new int[rows] };
            Reset(c, true);
            for (int r = 0; r < rows; r++) c.Glyphs[r] = rnd.Next(Chars.Length);
            columns[i] = c;
        }
    }

    void Reset(Column c, bool anywhere)
    {
        c.Head = anywhere ? rnd.NextDouble() * rows * 1.5 - rows * 0.5 : -rnd.NextDouble() * rows * 0.5;
        c.Speed = 6 + rnd.NextDouble() * 14;
        c.Length = 8 + rnd.Next(22);
    }

    FormattedText Glyph(int ch, int level)
    {
        int key = ch * Levels + level;
        if (!cache.TryGetValue(key, out var ft))
        {
            ft = new FormattedText(Chars[ch].ToString(), CultureInfo.InvariantCulture, FlowDirection.LeftToRight,
                Face, Cell * 0.9, levelBrushes[level], pixelsPerDip);
            cache[key] = ft;
        }
        return ft;
    }

    protected override void Draw(DrawingContext dc, double w, double h, double t, double dt)
    {
        var ppd = VisualTreeHelper.GetDpi(this).PixelsPerDip;
        if (Math.Abs(ppd - pixelsPerDip) > 0.001) { pixelsPerDip = ppd; cache.Clear(); }

        dc.DrawRectangle(Brushes.Black, null, new Rect(0, 0, w, h));
        double boost = 1 + 1.5 * Bass;
        for (int ci = 0; ci < columns.Length; ci++)
        {
            var c = columns[ci];
            c.Head += c.Speed * dt * boost;
            if (c.Head - c.Length > rows) Reset(c, false);
            if (rnd.NextDouble() < 0.3) c.Glyphs[rnd.Next(rows)] = rnd.Next(Chars.Length);

            int head = (int)c.Head;
            for (int k = 0; k < c.Length; k++)
            {
                int row = head - k;
                if (row < 0 || row >= rows) continue;
                int level = k == 0 ? 0 : 1 + (int)(k / (double)c.Length * (Levels - 1.01));
                dc.DrawText(Glyph(c.Glyphs[row], level), new Point(ci * Cell, row * Cell));
            }
        }
    }
}
