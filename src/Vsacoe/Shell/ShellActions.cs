using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using Vsacoe.Core;
using static Vsacoe.Interop.NativeMethods;

namespace Vsacoe.Shell;

internal static class ShellActions
{
    private const int ErrorCancelled = 1223;

    public static void Open(string path)
    {
        try
        {
            if (PathUtil.IsVirtual(path))
            {
                Process.Start(new ProcessStartInfo("explorer.exe", "shell:" + path) { UseShellExecute = true });
                return;
            }
            Process.Start(new ProcessStartInfo(path)
            {
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(path) ?? "",
            });
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == ErrorCancelled)
        {
            // Пользователь отменил запрос UAC.
        }
        catch (Exception ex)
        {
            ShowError($"Не удалось открыть «{PathUtil.DisplayName(path)}»:\n{ex.Message}");
        }
    }

    public static void OpenFolder(string folder)
    {
        try
        {
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{folder}\"") { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
        }
    }

    public static void Reveal(string path)
    {
        try
        {
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
        }
    }

    public static void ShowProperties(string path)
    {
        var info = new SHELLEXECUTEINFO
        {
            cbSize = Marshal.SizeOf<SHELLEXECUTEINFO>(),
            lpVerb = "properties",
            lpFile = PathUtil.IsVirtual(path) ? "shell:" + path : path,
            nShow = 1,
            fMask = SEE_MASK_INVOKEIDLIST,
        };
        ShellExecuteEx(ref info);
    }

    /// <summary>Удаляет в Корзину (с обычным подтверждением Проводника).</summary>
    public static bool Delete(IReadOnlyCollection<string> paths, IntPtr owner)
    {
        var real = paths.Where(p => !PathUtil.IsVirtual(p)).ToList();
        if (real.Count == 0)
            return false;
        return FileOperation(FO_DELETE, real, null, owner, FOF_ALLOWUNDO | FOF_WANTNUKEWARNING);
    }

    /// <summary>Копирует или перемещает файлы в папку средствами Проводника (с прогрессом и вопросами о замене).</summary>
    public static bool Transfer(IReadOnlyCollection<string> paths, string targetFolder, bool move, IntPtr owner)
    {
        var real = paths
            .Where(p => !PathUtil.IsVirtual(p) && !PathUtil.Equal(Path.GetDirectoryName(p), targetFolder.TrimEnd('\\')))
            .ToList();
        if (real.Count == 0)
            return false;
        return FileOperation(move ? FO_MOVE : FO_COPY, real, targetFolder, owner, FOF_ALLOWUNDO);
    }

    /// <summary>Переименовывает файл или папку. Возвращает новый путь или null.</summary>
    public static string? Rename(string path, string newName)
    {
        newName = newName.Trim();
        if (newName.Length == 0 || newName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            ShowError("Имя файла не должно быть пустым и не может содержать символы \\ / : * ? \" < > |");
            return null;
        }

        // Как в Проводнике: у ярлыков расширение скрыто, поэтому сохраняем его.
        var ext = Path.GetExtension(path);
        if ((ext.Equals(".lnk", StringComparison.OrdinalIgnoreCase) || ext.Equals(".url", StringComparison.OrdinalIgnoreCase))
            && !newName.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            newName += ext;

        var target = Path.Combine(Path.GetDirectoryName(path)!, newName);
        if (target == path)
            return null;
        try
        {
            if (Directory.Exists(path))
                Directory.Move(path, target);
            else
                File.Move(path, target);
            return target;
        }
        catch (Exception ex)
        {
            ShowError($"Не удалось переименовать:\n{ex.Message}");
            return null;
        }
    }

    private static bool FileOperation(uint func, IEnumerable<string> paths, string? target, IntPtr owner, ushort flags)
    {
        var op = new SHFILEOPSTRUCT
        {
            hwnd = owner,
            wFunc = func,
            pFrom = string.Join("\0", paths) + "\0\0",
            pTo = target == null ? null : target + "\0\0",
            fFlags = flags,
        };
        return SHFileOperation(ref op) == 0 && op.fAnyOperationsAborted == 0;
    }

    public static void ShowError(string message) =>
        MessageBox.Show(message, "Vsacoe", MessageBoxButton.OK, MessageBoxImage.Warning);
}
