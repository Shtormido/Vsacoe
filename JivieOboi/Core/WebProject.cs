using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace JivieOboi;

/// <summary>
/// Папка веб-обоев в распространённом формате project.json (его используют Wallpaper Engine и многие
/// бесплатные обои в интернете): название, превью, настраиваемые свойства. Поддерживаются типы «video» и «web».
/// </summary>
internal static class WebProject
{
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
            Origin = "user",
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
