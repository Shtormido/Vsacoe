namespace Vsacoe.Core;

public static class PathUtil
{
    /// <summary>Пути в Windows не чувствительны к регистру.</summary>
    public static readonly StringComparer Comparer = StringComparer.OrdinalIgnoreCase;

    /// <summary>Корзина как виртуальный элемент оболочки.</summary>
    public const string RecycleBin = "::{645FF040-5081-101B-9F08-08002B30309D}";

    /// <summary>Виртуальный объект оболочки («::{GUID}»), а не файл.</summary>
    public static bool IsVirtual(string path) => path.StartsWith("::{", StringComparison.Ordinal);

    public static bool Exists(string path) =>
        IsVirtual(path) || File.Exists(path) || Directory.Exists(path);

    public static bool Equal(string? a, string? b) => Comparer.Equals(a, b);

    /// <summary>Находится ли <paramref name="path"/> внутри папки <paramref name="folder"/> (на любой глубине).</summary>
    public static bool IsUnder(string path, string folder)
    {
        var prefix = folder.TrimEnd('\\', '/');
        if (path.Length <= prefix.Length + 1 || !path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return false;
        var sep = path[prefix.Length];
        return sep == '\\' || sep == '/';
    }

    /// <summary>Лежит ли <paramref name="path"/> непосредственно в папке <paramref name="folder"/>.</summary>
    public static bool IsDirectChild(string path, string folder)
    {
        var parent = Path.GetDirectoryName(path);
        return parent != null && Equal(parent.TrimEnd('\\', '/'), folder.TrimEnd('\\', '/'));
    }

    /// <summary>Имя для подписи значка: как в Проводнике, без «.lnk» и «.url».</summary>
    public static string DisplayName(string path)
    {
        var trimmed = path.TrimEnd('\\', '/');
        var name = Path.GetFileName(trimmed);
        if (string.IsNullOrEmpty(name))
            return path;
        var ext = Path.GetExtension(name);
        if (ext.Equals(".lnk", StringComparison.OrdinalIgnoreCase) || ext.Equals(".url", StringComparison.OrdinalIgnoreCase))
            return Path.GetFileNameWithoutExtension(name);
        return name;
    }
}
