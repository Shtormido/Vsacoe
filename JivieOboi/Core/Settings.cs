using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace JivieOboi;

internal sealed class Settings
{
    public int Version { get; set; } = 2;

    // ── что и где показывать ──
    /// <summary>"same" — одни обои на всех мониторах, "per" — свои на каждом, "span" — одни, растянутые на все.</summary>
    public string Mode { get; set; } = "same";
    public string CurrentId { get; set; } = "builtin:aurora";
    /// <summary>Обои для каждого монитора (ключ — имя устройства, например \\.\DISPLAY1) в режиме "per".</summary>
    public Dictionary<string, string> Assignments { get; set; } = new();
    /// <summary>UniformToFill, Uniform или Fill.</summary>
    public string Stretch { get; set; } = "UniformToFill";
    public double Volume { get; set; }
    public int SceneFps { get; set; } = 30;
    /// <summary>"webview" — Chromium (WebView2), "wmf" — Windows Media Foundation.</summary>
    public string VideoEngine { get; set; } = "webview";
    public bool AudioReactive { get; set; } = true;
    /// <summary>Способ встраивания в рабочий стол: "auto" или имя способа (Reparent, ChildWindow, InsideWorker).</summary>
    public string DesktopMethod { get; set; } = "auto";
    /// <summary>Способ, при котором обои точно были видны (подбирается автоматически).</summary>
    public string? LastGoodMethod { get; set; }
    /// <summary>Передавать мышь в веб-обои (интерактивные обои).</summary>
    public bool Interactive { get; set; } = true;

    // ── производительность ──
    public bool Paused { get; set; }
    public bool PauseOnFullscreen { get; set; } = true;
    public bool PauseOnMaximized { get; set; }
    public bool PauseOnBattery { get; set; }
    /// <summary>Имена процессов (без .exe), при активном окне которых обои на паузе.</summary>
    public List<string> PauseApps { get; set; } = new();

    // ── плейлист ──
    public bool PlaylistEnabled { get; set; }
    public int PlaylistMinutes { get; set; } = 30;
    public bool PlaylistShuffle { get; set; }
    public List<string> Playlist { get; set; } = new();

    // ── экран блокировки ──
    /// <summary>Отдельные обои для живого экрана блокировки (null — как на рабочем столе).</summary>
    public string? LockWallpaperId { get; set; }
    public bool ClockOnAllMonitors { get; set; } = true;
    public bool LockScreenSync { get; set; } = true;
    public int LockScreenSyncMinutes { get; set; }
    public int IdleOverlayMinutes { get; set; }
    public bool LockAfterIdleOverlay { get; set; } = true;
    public bool ShowClock { get; set; } = true;
    public bool LockHotkey { get; set; } = true;

    // ── поля версии 1 (читаются только для переноса настроек) ──
    public string? SourceType { get; set; }
    public string? Scene { get; set; }
    public string? FilePath { get; set; }

    public static string Dir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JivieOboi");

    static string FileOnDisk => Path.Combine(Dir, "settings.json");

    /// <summary>Настроек ещё не было — первый запуск программы.</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public bool IsFirstRun { get; private set; }

    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static Settings Load()
    {
        try
        {
            if (File.Exists(FileOnDisk))
                return JsonSerializer.Deserialize<Settings>(File.ReadAllText(FileOnDisk)) ?? new Settings();
        }
        catch (Exception ex)
        {
            Log.Error("Чтение настроек", ex);
        }
        return new Settings { IsFirstRun = !File.Exists(FileOnDisk) };
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(FileOnDisk, JsonSerializer.Serialize(this, Json));
        }
        catch (Exception ex)
        {
            Log.Error("Сохранение настроек", ex);
        }
    }

    /// <summary>Какие обои показывать на мониторе (без учёта плейлиста).</summary>
    public string WallpaperFor(string monitorKey) =>
        Mode == "per" && Assignments.TryGetValue(monitorKey, out var id) ? id : CurrentId;
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
