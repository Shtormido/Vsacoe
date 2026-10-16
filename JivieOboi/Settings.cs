using System;
using System.IO;
using System.Text.Json;

namespace JivieOboi;

internal sealed class Settings
{
    /// <summary>"scene" — встроенная анимация, "file" — видео / GIF / картинка.</summary>
    public string SourceType { get; set; } = "scene";
    public string Scene { get; set; } = "aurora";
    public string? FilePath { get; set; }
    /// <summary>UniformToFill, Uniform или Fill.</summary>
    public string Stretch { get; set; } = "UniformToFill";
    public double Volume { get; set; }
    public int SceneFps { get; set; } = 30;

    public bool Paused { get; set; }
    public bool PauseOnFullscreen { get; set; } = true;
    public bool PauseOnMaximized { get; set; }
    public bool PauseOnBattery { get; set; }

    /// <summary>Ставить текущий кадр обоев картинкой экрана блокировки при блокировке.</summary>
    public bool LockScreenSync { get; set; } = true;
    /// <summary>Дополнительно обновлять картинку экрана блокировки каждые N минут (0 — выкл.).</summary>
    public int LockScreenSyncMinutes { get; set; }
    /// <summary>Показывать живую заставку после N минут бездействия (0 — выкл.).</summary>
    public int IdleOverlayMinutes { get; set; }
    public bool LockAfterIdleOverlay { get; set; } = true;
    public bool ShowClock { get; set; } = true;
    public bool LockHotkey { get; set; } = true;

    public static string Dir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JivieOboi");

    static string FilePathOnDisk => Path.Combine(Dir, "settings.json");

    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static Settings Load()
    {
        try
        {
            if (File.Exists(FilePathOnDisk))
                return JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePathOnDisk)) ?? new Settings();
        }
        catch (Exception ex)
        {
            Log.Error("Чтение настроек", ex);
        }
        return new Settings();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(FilePathOnDisk, JsonSerializer.Serialize(this, Json));
        }
        catch (Exception ex)
        {
            Log.Error("Сохранение настроек", ex);
        }
    }
}

internal static class Log
{
    public static void Error(string where, Exception ex) => Write($"{where}: {ex}");

    public static void Write(string message)
    {
        try
        {
            Directory.CreateDirectory(Settings.Dir);
            File.AppendAllText(Path.Combine(Settings.Dir, "error.log"),
                $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch
        {
            // Логирование не должно ронять программу.
        }
    }
}
