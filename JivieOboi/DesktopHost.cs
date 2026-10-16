using System;
using System.Text;

namespace JivieOboi;

/// <summary>Куда вставлять окно обоев: между картинкой рабочего стола и иконками.</summary>
/// <param name="Parent">Окно-родитель (WorkerW или Progman).</param>
/// <param name="ShellView">SHELLDLL_DefView — слой с иконками (на Windows 11 24H2+ он сосед нашего окна).</param>
/// <param name="BottomWorker">WorkerW, который должен оказаться под нашим окном (Windows 11 24H2+).</param>
/// <param name="Raised">Новая схема рабочего стола Windows 11 24H2+.</param>
internal readonly record struct DesktopTarget(IntPtr Parent, IntPtr ShellView, IntPtr BottomWorker, bool Raised);

internal static class DesktopHost
{
    public static DesktopTarget? Find()
    {
        var progman = Native.FindWindow("Progman", null);
        if (progman == IntPtr.Zero) return null;

        // Недокументированное сообщение: просит Explorer создать окно WorkerW позади иконок.
        Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), Native.SMTO_NORMAL, 1000, out _);
        Native.SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, Native.SMTO_NORMAL, 1000, out _);

        // Windows 11 24H2+: SHELLDLL_DefView и WorkerW — дочерние окна Progman.
        var innerWorker = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        if (innerWorker != IntPtr.Zero)
        {
            var shell = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            return new DesktopTarget(progman, shell, innerWorker, true);
        }

        // Windows 10 / 11 до 24H2: нужен WorkerW, идущий сразу за окном с SHELLDLL_DefView.
        var workerw = IntPtr.Zero;
        Native.EnumWindows((top, _) =>
        {
            if (Native.FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
            {
                var w = Native.FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                if (w != IntPtr.Zero) workerw = w;
            }
            return true;
        }, IntPtr.Zero);
        if (workerw != IntPtr.Zero) return new DesktopTarget(workerw, IntPtr.Zero, IntPtr.Zero, false);

        // Запасной вариант: прямо в Progman, под иконками.
        var view = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        return new DesktopTarget(progman, view, IntPtr.Zero, false);
    }

    /// <summary>Ставит наше окно под иконки и над фоном.</summary>
    public static void FixZOrder(IntPtr hwnd, DesktopTarget t)
    {
        const uint flags = Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE;
        if (t.ShellView != IntPtr.Zero && Native.GetParent(t.ShellView) == t.Parent)
            Native.SetWindowPos(hwnd, t.ShellView, 0, 0, 0, 0, flags);
        if (t.BottomWorker != IntPtr.Zero)
            Native.SetWindowPos(t.BottomWorker, hwnd, 0, 0, 0, 0, flags);
    }

    /// <summary>Заставляет Explorer перерисовать обычные обои после выхода.</summary>
    public static void RestoreSystemWallpaper()
    {
        var sb = new StringBuilder(1024);
        if (Native.SystemParametersInfo(Native.SPI_GETDESKWALLPAPER, (uint)sb.Capacity, sb, 0))
            Native.SystemParametersInfo(Native.SPI_SETDESKWALLPAPER, 0, sb.ToString(), Native.SPIF_SENDCHANGE);
    }
}
