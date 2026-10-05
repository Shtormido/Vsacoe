using System.Text.Json;
using System.Text.Json.Serialization;

namespace Vsacoe.Core;

public sealed record SnapshotFile(string FilePath, LayoutSnapshot Snapshot);

/// <summary>Хранение настроек и снимков макета в JSON (по умолчанию в %APPDATA%\Vsacoe).</summary>
public sealed class ConfigStore
{
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    public ConfigStore(string directory)
    {
        Directory = directory;
    }

    public static string DefaultDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Vsacoe");

    public string Directory { get; }
    public string SettingsPath => Path.Combine(Directory, "settings.json");
    public string SnapshotsDirectory => Path.Combine(Directory, "snapshots");

    /// <summary>Загружает настройки. Повреждённый файл откладывается в сторону, и возвращаются настройки по умолчанию.</summary>
    public AppSettings Load()
    {
        if (!File.Exists(SettingsPath))
            return new AppSettings();
        try
        {
            var settings = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(SettingsPath), JsonOptions) ?? new AppSettings();
            return Normalize(settings);
        }
        catch (JsonException)
        {
            File.Copy(SettingsPath, SettingsPath + $".broken-{DateTime.Now:yyyyMMdd-HHmmss}", overwrite: true);
            return new AppSettings();
        }
    }

    public void Save(AppSettings settings) => WriteAtomic(SettingsPath, JsonSerializer.Serialize(settings, JsonOptions));

    public SnapshotFile SaveSnapshot(string name, IEnumerable<FenceConfig> fences)
    {
        var snapshot = new LayoutSnapshot
        {
            Name = string.IsNullOrWhiteSpace(name) ? $"Снимок {DateTime.Now:g}" : name.Trim(),
            CreatedUtc = DateTime.UtcNow,
            Fences = fences.Select(Clone).ToList(),
        };
        var safe = string.Concat(snapshot.Name.Select(c => Path.GetInvalidFileNameChars().Contains(c) || c is '\\' or '/' or ':' ? '_' : c));
        var path = Path.Combine(SnapshotsDirectory, $"{DateTime.Now:yyyyMMdd-HHmmss}-{safe}.json");
        WriteAtomic(path, JsonSerializer.Serialize(snapshot, JsonOptions));
        return new SnapshotFile(path, snapshot);
    }

    public IReadOnlyList<SnapshotFile> ListSnapshots()
    {
        if (!System.IO.Directory.Exists(SnapshotsDirectory))
            return Array.Empty<SnapshotFile>();

        var result = new List<SnapshotFile>();
        foreach (var file in System.IO.Directory.EnumerateFiles(SnapshotsDirectory, "*.json"))
        {
            try
            {
                var snapshot = JsonSerializer.Deserialize<LayoutSnapshot>(File.ReadAllText(file), JsonOptions);
                if (snapshot != null)
                {
                    snapshot.Fences = (snapshot.Fences ?? new()).Select(NormalizeFence).ToList();
                    result.Add(new SnapshotFile(file, snapshot));
                }
            }
            catch (JsonException)
            {
                // Пропускаем повреждённые снимки.
            }
        }
        return result.OrderByDescending(s => s.Snapshot.CreatedUtc).ToList();
    }

    public void DeleteSnapshot(string filePath)
    {
        if (File.Exists(filePath))
            File.Delete(filePath);
    }

    public static FenceConfig Clone(FenceConfig fence) =>
        JsonSerializer.Deserialize<FenceConfig>(JsonSerializer.Serialize(fence, JsonOptions), JsonOptions)!;

    private static AppSettings Normalize(AppSettings s)
    {
        s.Fences = (s.Fences ?? new()).Where(f => f != null).Select(NormalizeFence).ToList();
        s.Rules = (s.Rules ?? new()).Where(r => r != null).ToList();

        // Повторяющиеся Id (например, после ручной правки файла) ломают правила — переназначаем.
        var seen = new HashSet<Guid>();
        foreach (var f in s.Fences)
        {
            if (!seen.Add(f.Id))
                f.Id = Guid.NewGuid();
        }

        s.IconSize = Math.Clamp(s.IconSize, 16, 256);
        s.GridSize = Math.Clamp(s.GridSize, 1, 100);
        return s;
    }

    private static FenceConfig NormalizeFence(FenceConfig f)
    {
        f.Items = (f.Items ?? new()).Where(p => !string.IsNullOrWhiteSpace(p)).Distinct(PathUtil.Comparer).ToList();
        f.Title ??= "";
        if (string.IsNullOrWhiteSpace(f.Background))
            f.Background = FenceConfig.DefaultBackground;
        if (f.Width < 80) f.Width = 80;
        if (f.Height < 40) f.Height = 40;
        return f;
    }

    private static void WriteAtomic(string path, string content)
    {
        System.IO.Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, content);
        File.Move(tmp, path, overwrite: true);
    }
}
