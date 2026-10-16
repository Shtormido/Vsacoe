using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace JivieOboi;

/// <summary>
/// Импорт обоев, уже скачанных в Wallpaper Engine (Steam Workshop, приложение 431960).
/// Поддерживаются типы «video» и «web» — их можно воспроизвести без движка Wallpaper Engine.
/// Файлы не копируются: обои берутся прямо из папки Steam.
/// </summary>
internal static class WallpaperEngineImport
{
    public const string AppId = "431960";

    public sealed record Result(int Added, int Skipped, int Unsupported, int Folders);

    public static IEnumerable<string> SteamLibraries()
    {
        var roots = new List<string>();
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
            if (key?.GetValue("SteamPath") is string steam) roots.Add(steam.Replace('/', '\\'));
        }
        catch
        {
            // Steam не установлен.
        }
        roots.Add(@"C:\Program Files (x86)\Steam");

        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in roots.Where(Directory.Exists))
        {
            result.Add(root);
            var vdf = Path.Combine(root, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(vdf)) continue;
            foreach (Match m in Regex.Matches(File.ReadAllText(vdf), "\"path\"\\s+\"([^\"]+)\""))
            {
                var path = m.Groups[1].Value.Replace(@"\\", @"\");
                if (Directory.Exists(path)) result.Add(path);
            }
        }
        return result;
    }

    /// <summary>Папки, где Wallpaper Engine хранит обои.</summary>
    public static IEnumerable<string> ProjectFolders()
    {
        foreach (var lib in SteamLibraries())
        {
            var dirs = new[]
            {
                Path.Combine(lib, "steamapps", "workshop", "content", AppId),
                Path.Combine(lib, "steamapps", "common", "wallpaper_engine", "projects", "myprojects"),
                Path.Combine(lib, "steamapps", "common", "wallpaper_engine", "projects", "defaultprojects"),
            };
            foreach (var dir in dirs.Where(Directory.Exists))
                foreach (var project in Directory.EnumerateDirectories(dir))
                    if (File.Exists(Path.Combine(project, "project.json")))
                        yield return project;
        }
    }

    public sealed record ScanResult(List<WallpaperItem> Items, int Unsupported, int Folders);

    /// <summary>Поиск обоев Wallpaper Engine на дисках (можно вызывать из фонового потока).</summary>
    public static ScanResult Scan()
    {
        var items = new List<WallpaperItem>();
        int unsupported = 0, folders = 0;
        foreach (var folder in ProjectFolders())
        {
            folders++;
            try
            {
                var item = FromProjectFolder(folder);
                if (item == null) unsupported++;
                else items.Add(item);
            }
            catch (Exception ex)
            {
                Log.Error("Импорт " + folder, ex);
                unsupported++;
            }
        }
        return new ScanResult(items, unsupported, folders);
    }

    /// <summary>Добавить найденное в библиотеку (в потоке интерфейса).</summary>
    public static Result Merge(LibraryStore library, ScanResult scan)
    {
        int added = 0, skipped = 0;
        foreach (var item in scan.Items)
        {
            if (library.Items.Any(i => string.Equals(i.Path, item.Path, StringComparison.OrdinalIgnoreCase)))
            {
                skipped++;
                continue;
            }
            library.Items.Add(item);
            added++;
        }
        if (added > 0) library.NotifyChanged();
        return new Result(added, skipped, scan.Unsupported, scan.Folders);
    }

    /// <summary>Читает project.json. Возвращает null для неподдерживаемых типов (scene, application).</summary>
    public static WallpaperItem? FromProjectFolder(string folder)
    {
        var projectFile = Path.Combine(folder, "project.json");
        if (!File.Exists(projectFile)) return null;
        using var doc = JsonDocument.Parse(File.ReadAllText(projectFile),
            new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
        var root = doc.RootElement;

        var type = Str(root, "type")?.ToLowerInvariant();
        var file = Str(root, "file");
        if (file == null || (type != "video" && type != "web")) return null;
        var path = Path.Combine(folder, file);
        if (!File.Exists(path)) return null;

        var preview = Str(root, "preview");
        var item = new WallpaperItem
        {
            Title = LibraryStore.StripHtml(Str(root, "title") ?? Path.GetFileName(folder)),
            Type = type == "video" ? WallpaperType.Video : WallpaperType.Web,
            Path = path,
            Preview = preview != null && File.Exists(Path.Combine(folder, preview)) ? Path.Combine(folder, preview) : null,
            Origin = "wallpaperengine",
            WorkshopId = Str(root, "workshopid") ?? Path.GetFileName(folder),
        };

        if (root.TryGetProperty("general", out var general) && general.TryGetProperty("properties", out var props)
            && props.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in props.EnumerateObject())
            {
                var def = ParseProperty(p.Name, p.Value);
                if (def != null) item.Properties.Add(def);
            }
            item.Properties.Sort((a, b) => a.Order.CompareTo(b.Order));
        }
        return item;
    }

    static PropertyDef? ParseProperty(string key, JsonElement e)
    {
        if (e.ValueKind != JsonValueKind.Object) return null;
        var type = Str(e, "type")?.ToLowerInvariant() ?? "text";
        if (type is not ("slider" or "bool" or "color" or "combo" or "textinput" or "text")) return null;

        var def = new PropertyDef
        {
            Key = key,
            Type = type,
            Text = Translate(LibraryStore.StripHtml(Str(e, "text") ?? key)),
            Order = e.TryGetProperty("order", out var o) && o.TryGetInt32(out var oi) ? oi : 0,
            Min = Num(e, "min", 0),
            Max = Num(e, "max", 100),
            Default = ValueString(e.TryGetProperty("value", out var v) ? v : default),
        };
        def.Step = e.TryGetProperty("step", out _) ? Num(e, "step", 1)
            : e.TryGetProperty("precision", out _) ? Math.Pow(10, -Num(e, "precision", 0))
            : (def.Max - def.Min <= 2 ? 0.01 : 1);

        if (type == "combo" && e.TryGetProperty("options", out var options) && options.ValueKind == JsonValueKind.Array)
        {
            foreach (var opt in options.EnumerateArray())
            {
                if (!opt.TryGetProperty("value", out var ov)) continue;
                if (ov.ValueKind == JsonValueKind.Number) def.NumericOptions = true;
                def.Options.Add(new PropertyOption
                {
                    Label = Translate(LibraryStore.StripHtml(Str(opt, "label") ?? ValueString(ov))),
                    Value = ValueString(ov),
                });
            }
        }
        return def;
    }

    static string ValueString(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.String => v.GetString() ?? "",
        JsonValueKind.Number => v.GetDouble().ToString(CultureInfo.InvariantCulture),
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        _ => "",
    };

    static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    static double Num(JsonElement e, string name, double fallback) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : fallback;

    /// <summary>Стандартные подписи Wallpaper Engine — по-русски.</summary>
    static string Translate(string text) => text switch
    {
        "ui_browse_properties_scheme_color" => "Цветовая схема",
        "ui_browse_properties_alignment" => "Выравнивание",
        "ui_browse_properties_playback_rate" => "Скорость воспроизведения",
        "ui_browse_properties_volume" => "Громкость",
        "ui_browse_properties_brightness" => "Яркость",
        "ui_browse_properties_contrast" => "Контраст",
        "ui_browse_properties_saturation" => "Насыщенность",
        "ui_browse_properties_hue" => "Оттенок",
        "ui_browse_properties_background_color" => "Цвет фона",
        _ when text.StartsWith("ui_browse_properties_", StringComparison.Ordinal) =>
            text["ui_browse_properties_".Length..].Replace('_', ' '),
        _ => text,
    };
}
