using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using Microsoft.Win32;

namespace JivieOboi.Lock;

/// <summary>
/// Регистрация программы как системной заставки (.scr). Windows сама запускает её
/// при бездействии, а после выхода из заставки показывает экран блокировки с паролем.
/// </summary>
internal static class WindowsScreensaver
{
    const string DesktopKey = @"Control Panel\Desktop";
    const string ScrName = "JivieOboi.scr";

    public static bool IsInstalled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(DesktopKey);
        var value = key?.GetValue("SCRNSAVE.EXE") as string;
        return value != null && Path.GetFileName(value).StartsWith("JIVIEO", StringComparison.OrdinalIgnoreCase);
    }

    public static void Install()
    {
        var target = CopyScr();
        using var key = Registry.CurrentUser.CreateSubKey(DesktopKey);
        key.SetValue("SCRNSAVE.EXE", ShortPath(target));

        if (!int.TryParse(key.GetValue("ScreenSaveTimeOut") as string, out var seconds) || seconds <= 0)
            Native.Spi(Native.SPI_SETSCREENSAVETIMEOUT, 300);
        Native.Spi(Native.SPI_SETSCREENSAVESECURE, 1); // «Начинать с экрана входа в систему»
        Native.Spi(Native.SPI_SETSCREENSAVEACTIVE, 1);
    }

    public static void Uninstall()
    {
        using (var key = Registry.CurrentUser.CreateSubKey(DesktopKey))
        {
            if (IsInstalled()) key.DeleteValue("SCRNSAVE.EXE", false);
        }
        Native.Spi(Native.SPI_SETSCREENSAVEACTIVE, 0);
    }

    /// <summary>После обновления программы .scr-копию нужно освежить.</summary>
    public static void RefreshIfInstalled()
    {
        try
        {
            if (!IsInstalled()) return;
            var exe = Environment.ProcessPath;
            if (exe == null) return;
            foreach (var target in new[] { TargetPath(preferExeDir: true), TargetPath(preferExeDir: false) })
            {
                if (!File.Exists(target)) continue;
                var a = new FileInfo(exe);
                var b = new FileInfo(target);
                if (a.Length != b.Length || a.LastWriteTimeUtc > b.LastWriteTimeUtc) File.Copy(exe, target, true);
            }
        }
        catch (Exception ex)
        {
            Log.Error("Обновление заставки", ex);
        }
    }

    public static void OpenWindowsSettings() =>
        Process.Start(new ProcessStartInfo("control.exe", "desk.cpl,,@screensaver") { UseShellExecute = true });

    static string TargetPath(bool preferExeDir)
    {
        var exe = Environment.ProcessPath ?? throw new InvalidOperationException("Не удалось определить путь к программе");
        return preferExeDir
            ? Path.Combine(Path.GetDirectoryName(exe)!, ScrName)
            : Path.Combine(Settings.Dir, ScrName);
    }

    static string CopyScr()
    {
        var exe = Environment.ProcessPath ?? throw new InvalidOperationException("Не удалось определить путь к программе");
        try
        {
            // Рядом с exe — так работает и обычная сборка, и однофайловая.
            var target = TargetPath(preferExeDir: true);
            File.Copy(exe, target, true);
            return target;
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            // Папка только для чтения (например, Program Files) — кладём в профиль.
            Directory.CreateDirectory(Settings.Dir);
            var target = TargetPath(preferExeDir: false);
            File.Copy(exe, target, true);
            return target;
        }
    }

    /// <summary>Windows исторически запускает заставки по пути без пробелов.</summary>
    static string ShortPath(string path)
    {
        var sb = new StringBuilder(1024);
        var length = Native.GetShortPathName(path, sb, (uint)sb.Capacity);
        return length > 0 && length < sb.Capacity ? sb.ToString() : path;
    }
}
