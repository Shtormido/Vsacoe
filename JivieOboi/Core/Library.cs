using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace JivieOboi;

/// <summary>Типы обоев.</summary>
internal static class WallpaperType
{
    public const string Scene = "scene";
    public const string Video = "video";
    public const string Web = "web";
    public const string Url = "url";
    public const string Image = "image";
    public const string Gif = "gif";

    public static string Title(string type) => type switch
    {
        Scene => "Анимация",
        Video => "Видео",
        Web => "Веб",
        Url => "Сайт",
        Image => "Картинка",
        Gif => "GIF",
        _ => type,
    };
}

/// <summary>Настраиваемое свойство обоев (совместимо со свойствами Wallpaper Engine).</summary>
internal sealed class PropertyDef
{
    public string Key { get; set; } = "";
    /// <summary>slider, bool, color, combo, textinput, text.</summary>
    public string Type { get; set; } = "text";
    public string Text { get; set; } = "";
    public int Order { get; set; }
    public double Min { get; set; }
    public double Max { get; set; } = 100;
    public double Step { get; set; } = 1;
    public string Default { get; set; } = "";
    /// <summary>Для combo: значения-числа нужно отдавать странице числами.</summary>
    public bool NumericOptions { get; set; }
    public List<PropertyOption> Options { get; set; } = new();
}

internal sealed class PropertyOption
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
}

internal sealed class WallpaperItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Title { get; set; } = "";
    public string Type { get; set; } = WallpaperType.Image;
    /// <summary>Файл (видео/картинка/GIF), HTML-файл веб-обоев или адрес сайта.</summary>
    public string? Path { get; set; }
    /// <summary>Для встроенных анимаций — идентификатор сцены.</summary>
    public string? Scene { get; set; }
    public string? Preview { get; set; }
    /// <summary>builtin, user или wallpaperengine.</summary>
    public string Origin { get; set; } = "user";
    public string? WorkshopId { get; set; }
    public DateTime Added { get; set; } = DateTime.Now;
    public List<PropertyDef> Properties { get; set; } = new();
    public Dictionary<string, string> Values { get; set; } = new();

    public bool IsBuiltIn => Origin == "builtin";

    public string Value(string key)
    {
        if (Values.TryGetValue(key, out var v)) return v;
        return Properties.FirstOrDefault(p => p.Key == key)?.Default ?? "";
    }

    public double Number(string key, double fallback) =>
        double.TryParse(Value(key), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : fallback;

    public bool Flag(string key, bool fallback) => bool.TryParse(Value(key), out var b) ? b : fallback;

    /// <summary>Свойства в формате Wallpaper Engine: { key: { value: ... } }.</summary>
    public string UserPropertiesJson()
    {
        var root = new JsonObject();
        foreach (var p in Properties)
        {
            var raw = Value(p.Key);
            JsonNode? value = p.Type switch
            {
                "slider" => JsonValue.Create(double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0),
                "bool" => JsonValue.Create(bool.TryParse(raw, out var b) && b),
                "combo" when p.NumericOptions && double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var n) => JsonValue.Create(n),
                _ => JsonValue.Create(raw),
            };
            root[p.Key] = new JsonObject { ["value"] = value };
        }
        return root.ToJsonString();
    }
}

/// <summary>Библиотека обоев: встроенные анимации + добавленные пользователем + импорт из Wallpaper Engine.</summary>
internal sealed class LibraryStore
{
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static string FileOnDisk => System.IO.Path.Combine(Settings.Dir, "library.json");

    public List<WallpaperItem> Items { get; private set; } = new();
    public event Action? Changed;

    public static LibraryStore Load()
    {
        var store = new LibraryStore();
        try
        {
            if (File.Exists(FileOnDisk))
                store.Items = JsonSerializer.Deserialize<List<WallpaperItem>>(File.ReadAllText(FileOnDisk)) ?? new();
        }
        catch (Exception ex)
        {
            Log.Error("Чтение библиотеки", ex);
        }
        store.EnsureBuiltIns();
        return store;
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Settings.Dir);
            File.WriteAllText(FileOnDisk, JsonSerializer.Serialize(Items, Json));
        }
        catch (Exception ex)
        {
            Log.Error("Сохранение библиотеки", ex);
        }
    }

    public void NotifyChanged()
    {
        Save();
        Changed?.Invoke();
    }

    public WallpaperItem? Find(string? id) => id == null ? null : Items.FirstOrDefault(i => i.Id == id);

    public WallpaperItem Resolve(string? id) => Find(id) ?? Find("builtin:aurora") ?? Items[0];

    public void Add(WallpaperItem item)
    {
        Items.Add(item);
        NotifyChanged();
    }

    public void Remove(WallpaperItem item)
    {
        if (item.IsBuiltIn) return;
        Items.Remove(item);
        NotifyChanged();
    }

    /// <summary>Добавить файл: тип определяется по расширению.</summary>
    public WallpaperItem? AddFile(string path)
    {
        var existing = Items.FirstOrDefault(i => string.Equals(i.Path, path, StringComparison.OrdinalIgnoreCase));
        if (existing != null) return existing;

        var ext = System.IO.Path.GetExtension(path);
        string? type =
            WallpaperView.VideoExtensions.Contains(ext) ? WallpaperType.Video :
            ext.Equals(".gif", StringComparison.OrdinalIgnoreCase) ? WallpaperType.Gif :
            WallpaperView.ImageExtensions.Contains(ext) ? WallpaperType.Image :
            ext.Equals(".html", StringComparison.OrdinalIgnoreCase) || ext.Equals(".htm", StringComparison.OrdinalIgnoreCase) ? WallpaperType.Web :
            null;
        if (type == null) return null;

        var item = new WallpaperItem
        {
            Title = System.IO.Path.GetFileNameWithoutExtension(path),
            Type = type,
            Path = path,
            Preview = type is WallpaperType.Image ? path : null,
        };
        if (type == WallpaperType.Web) LoadProjectJson(item, System.IO.Path.GetDirectoryName(path)!);
        Add(item);
        return item;
    }

    /// <summary>Папка с веб-обоями: index.html (+ project.json Wallpaper Engine, если есть).</summary>
    public WallpaperItem? AddWebFolder(string folder)
    {
        var project = System.IO.Path.Combine(folder, "project.json");
        if (File.Exists(project))
        {
            var imported = WebProject.FromProjectFolder(folder);
            if (imported != null)
            {
                Add(imported);
                return imported;
            }
        }
        var index = System.IO.Path.Combine(folder, "index.html");
        return File.Exists(index) ? AddFile(index) : null;
    }

    public WallpaperItem AddUrl(string url)
    {
        var item = new WallpaperItem
        {
            Title = Uri.TryCreate(url, UriKind.Absolute, out var u) ? u.Host : url,
            Type = WallpaperType.Url,
            Path = url,
        };
        Add(item);
        return item;
    }

    static void LoadProjectJson(WallpaperItem item, string folder)
    {
        var p = WebProject.FromProjectFolder(folder);
        if (p == null) return;
        item.Title = p.Title;
        item.Preview = p.Preview;
        item.Properties = p.Properties;
    }

    // ── встроенные анимации ──

    static readonly (string Id, string Title)[] BuiltInScenes =
    {
        ("aurora", "Северное сияние"),
        ("particles", "Сеть частиц"),
        ("spectrum", "Эквалайзер"),
        ("matrix", "Матрица"),
        ("waves", "Неоновые волны"),
    };

    void EnsureBuiltIns()
    {
        int index = 0;
        foreach (var (scene, title) in BuiltInScenes)
        {
            var id = "builtin:" + scene;
            var item = Find(id);
            if (item == null)
            {
                item = new WallpaperItem { Id = id };
                Items.Insert(Math.Min(index, Items.Count), item);
            }
            item.Title = title;
            item.Type = WallpaperType.Scene;
            item.Scene = scene;
            item.Origin = "builtin";
            item.Properties = SceneProperties();
            index++;
        }

        // Веб-обои на шейдерах (нужен WebView2 — в Windows 11 он встроен).
        foreach (var e in BuiltInWeb.All)
        {
            var id = "builtin:web-" + e.Id;
            var item = Find(id);
            if (item == null)
            {
                item = new WallpaperItem { Id = id };
                Items.Insert(Math.Min(index, Items.Count), item);
            }
            item.Title = e.Title;
            item.Type = WallpaperType.Web;
            item.Path = BuiltInWeb.PathFor(e);
            item.Origin = "builtin";
            item.Properties = BuiltInWeb.Properties(e);
            index++;
        }
    }

    static List<PropertyDef> SceneProperties() => new()
    {
        new PropertyDef { Key = "speed", Type = "slider", Text = "Скорость", Min = 0.1, Max = 3, Step = 0.05, Default = "1", Order = 0 },
        new PropertyDef { Key = "hue", Type = "slider", Text = "Оттенок", Min = 0, Max = 360, Step = 1, Default = "0", Order = 1 },
        new PropertyDef { Key = "audio", Type = "bool", Text = "Реагировать на музыку", Default = "true", Order = 2 },
    };

    /// <summary>Перенос обоев из настроек версии 1.</summary>
    public void MigrateFrom(Settings s)
    {
        if (s.SourceType == null) return;
        if (s.SourceType == "file" && !string.IsNullOrWhiteSpace(s.FilePath) && File.Exists(s.FilePath))
        {
            var item = AddFile(s.FilePath);
            if (item != null) s.CurrentId = item.Id;
        }
        else if (s.SourceType == "scene" && s.Scene != null && Find("builtin:" + s.Scene) != null)
        {
            s.CurrentId = "builtin:" + s.Scene;
        }
        s.SourceType = null;
        s.FilePath = null;
        s.Scene = null;
        s.Save();
    }

    public static string StripHtml(string text) => Regex.Replace(text, "<[^>]+>", "").Trim();
}
