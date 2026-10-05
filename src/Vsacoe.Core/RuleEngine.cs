using System.Text.RegularExpressions;

namespace Vsacoe.Core;

public static class RuleEngine
{
    private static readonly char[] ExtensionSeparators = { ';', ',', ' ', '\t' };

    /// <summary>
    /// Первая включённая подходящая под элемент ограда.
    /// Правила проверяются по порядку; правила на удалённые ограды и порталы пропускаются.
    /// </summary>
    public static FenceConfig? FindTarget(string path, bool isDirectory, IEnumerable<SortRule> rules, IEnumerable<FenceConfig> fences)
    {
        var standard = fences.Where(f => f.Kind == FenceKind.Standard).ToDictionary(f => f.Id);
        foreach (var rule in rules)
        {
            if (rule.Enabled && standard.TryGetValue(rule.TargetFenceId, out var fence) && Matches(rule, path, isDirectory))
                return fence;
        }
        return null;
    }

    public static bool Matches(SortRule rule, string path, bool isDirectory)
    {
        if (PathUtil.IsVirtual(path) || string.IsNullOrWhiteSpace(rule.Pattern))
            return false;

        var name = Path.GetFileName(path.TrimEnd('\\', '/'));
        switch (rule.Kind)
        {
            case RuleKind.Extension:
                if (isDirectory)
                    return false;
                var ext = Path.GetExtension(name).TrimStart('.');
                if (ext.Length == 0)
                    return false;
                return rule.Pattern
                    .Split(ExtensionSeparators, StringSplitOptions.RemoveEmptyEntries)
                    .Select(t => t.TrimStart('*').TrimStart('.'))
                    .Any(t => t.Equals(ext, StringComparison.OrdinalIgnoreCase));

            case RuleKind.NamePattern:
                return rule.Pattern
                    .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Any(p => Wildcard.IsMatch(name, p));

            case RuleKind.Category:
                var actual = FileCategories.Classify(path, isDirectory);
                return rule.Pattern
                    .Split(ExtensionSeparators, StringSplitOptions.RemoveEmptyEntries)
                    .Any(t => FileCategories.TryParse(t, out var c) && c == actual);

            default:
                return false;
        }
    }
}

public static class Wildcard
{
    /// <summary>Сравнение с маской вида <c>*.txt</c> / <c>file?.doc</c> без учёта регистра.</summary>
    public static bool IsMatch(string text, string pattern)
    {
        var regex = "^" + Regex.Escape(pattern).Replace(@"\*", ".*").Replace(@"\?", ".") + "$";
        return Regex.IsMatch(text, regex, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Singleline);
    }
}
