namespace Vsacoe.Core;

public readonly record struct RectD(double X, double Y, double Width, double Height)
{
    public double Right => X + Width;
    public double Bottom => Y + Height;
}

public static class SnapMath
{
    public const double EdgeThreshold = 12;

    public static double ToGrid(double value, int grid) =>
        grid <= 1 ? Math.Round(value) : Math.Round(value / grid) * grid;

    /// <summary>
    /// Прилипание ограды при перемещении: к сетке, затем к краям рабочей области и соседних оград
    /// (края имеют приоритет). Итог удерживается внутри рабочей области, если ограда в неё помещается.
    /// </summary>
    public static RectD SnapPosition(RectD rect, RectD workArea, IEnumerable<RectD> others, int grid, bool useGrid)
    {
        var x = useGrid ? ToGrid(rect.X, grid) : rect.X;
        var y = useGrid ? ToGrid(rect.Y, grid) : rect.Y;

        var xTargets = new List<double> { workArea.X, workArea.Right - rect.Width };
        var yTargets = new List<double> { workArea.Y, workArea.Bottom - rect.Height };
        foreach (var o in others)
        {
            xTargets.AddRange(new[] { o.X, o.Right, o.X - rect.Width, o.Right - rect.Width });
            yTargets.AddRange(new[] { o.Y, o.Bottom, o.Y - rect.Height, o.Bottom - rect.Height });
        }

        x = Nearest(rect.X, xTargets) ?? x;
        y = Nearest(rect.Y, yTargets) ?? y;

        if (rect.Width <= workArea.Width)
            x = Math.Clamp(x, workArea.X, workArea.Right - rect.Width);
        if (rect.Height <= workArea.Height)
            y = Math.Clamp(y, workArea.Y, workArea.Bottom - rect.Height);

        return rect with { X = x, Y = y };
    }

    public static double SnapSize(double value, double min, int grid, bool useGrid) =>
        Math.Max(min, useGrid ? ToGrid(value, grid) : Math.Round(value));

    private static double? Nearest(double value, IEnumerable<double> targets)
    {
        double? best = null;
        var bestDistance = EdgeThreshold;
        foreach (var t in targets)
        {
            var d = Math.Abs(t - value);
            if (d <= bestDistance)
            {
                bestDistance = d;
                best = t;
            }
        }
        return best;
    }
}
