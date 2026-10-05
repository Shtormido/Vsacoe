namespace Vsacoe.Core;

public sealed record FileEntryInfo(string Path, string Name, bool IsDirectory, DateTime Modified, long Size);

public static class ItemSorter
{
    /// <summary>Сортирует элементы ограды. Для <see cref="ItemSortMode.Manual"/> порядок сохраняется.</summary>
    public static List<T> Sort<T>(IEnumerable<T> items, ItemSortMode mode, Func<T, FileEntryInfo> info)
    {
        var list = items.ToList();
        var names = NaturalComparer.Instance;
        IOrderedEnumerable<T> ordered;
        switch (mode)
        {
            case ItemSortMode.Name:
                ordered = list.OrderByDescending(x => info(x).IsDirectory).ThenBy(x => info(x).Name, names);
                break;
            case ItemSortMode.Type:
                ordered = list
                    .OrderBy(x => FileCategories.Classify(info(x).Path, info(x).IsDirectory))
                    .ThenBy(x => Path.GetExtension(info(x).Path), StringComparer.OrdinalIgnoreCase)
                    .ThenBy(x => info(x).Name, names);
                break;
            case ItemSortMode.DateModified:
                ordered = list.OrderByDescending(x => info(x).Modified).ThenBy(x => info(x).Name, names);
                break;
            case ItemSortMode.Size:
                ordered = list.OrderByDescending(x => info(x).IsDirectory).ThenByDescending(x => info(x).Size).ThenBy(x => info(x).Name, names);
                break;
            default:
                return list;
        }
        return ordered.ToList();
    }
}

/// <summary>«Естественное» сравнение строк: «Файл 2» раньше «Файл 10».</summary>
public sealed class NaturalComparer : IComparer<string>
{
    public static readonly NaturalComparer Instance = new();

    public int Compare(string? x, string? y)
    {
        if (ReferenceEquals(x, y)) return 0;
        if (x is null) return -1;
        if (y is null) return 1;

        int i = 0, j = 0;
        while (i < x.Length && j < y.Length)
        {
            if (char.IsDigit(x[i]) && char.IsDigit(y[j]))
            {
                int si = i, sj = j;
                while (i < x.Length && char.IsDigit(x[i])) i++;
                while (j < y.Length && char.IsDigit(y[j])) j++;
                var a = x.AsSpan(si, i - si).TrimStart('0');
                var b = y.AsSpan(sj, j - sj).TrimStart('0');
                if (a.Length != b.Length) return a.Length.CompareTo(b.Length);
                var c = a.CompareTo(b, StringComparison.Ordinal);
                if (c != 0) return c;
            }
            else
            {
                var c = string.Compare(x, i, y, j, 1, StringComparison.CurrentCultureIgnoreCase);
                if (c != 0) return c;
                i++;
                j++;
            }
        }
        return (x.Length - i).CompareTo(y.Length - j);
    }
}
