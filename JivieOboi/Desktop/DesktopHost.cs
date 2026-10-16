using System;
using System.Text;

namespace JivieOboi;

/// <summary>Куда вставлять окно обоев: между картинкой рабочего стола и иконками.</summary>
/// <param name="Parent">Окно-родитель (WorkerW или Progman).</param>
/// <param name="ShellView">SHELLDLL_DefView — слой с иконками (на Windows 11 24H2+ он сосед нашего окна).</param>
/// <param name="BottomWorker">WorkerW, который должен быть самым нижним (Windows 11 24H2+).</param>
/// <param name="Raised">Новая схема рабочего стола Windows 11 24H2+.</param>
internal readonly record struct DesktopTarget(IntPtr Parent, IntPtr ShellView, IntPtr BottomWorker, bool Raised);

internal static class DesktopHost
{
    const uint ZFlags = Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE;

    public static DesktopTarget? Find()
    {
        var progman = Native.FindWindow("Progman", null);
        if (progman == IntPtr.Zero) return null;

        // Недокументированное сообщение: просит Explorer создать WorkerW позади иконок.
        Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), Native.SMTO_NORMAL, 1000, out _);
        Native.SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, Native.SMTO_NORMAL, 1000, out _);

        // Windows 11 24H2+ («поднятый» рабочий стол): Progman рисуется через DirectComposition
        // (WS_EX_NOREDIRECTIONBITMAP), а SHELLDLL_DefView и WorkerW — его дочерние окна.
        // Обои должны быть дочерним layered-окном Progman между иконками и WorkerW.
        var exStyle = Native.GetWindowLongPtr(progman, Native.GWL_EXSTYLE).ToInt64();
        var innerWorker = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        if ((exStyle & Native.WS_EX_NOREDIRECTIONBITMAP) != 0 || innerWorker != IntPtr.Zero)
        {
            var shell = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shell != IntPtr.Zero) return new DesktopTarget(progman, shell, innerWorker, true);
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
        if (t.ShellView != IntPtr.Zero && Native.GetParent(t.ShellView) == t.Parent)
            Native.SetWindowPos(hwnd, t.ShellView, 0, 0, 0, 0, ZFlags);
        EnsureWorkerAtBottom(t);
    }

    /// <summary>
    /// Windows 11 24H2+: Explorer иногда поднимает WorkerW (смена фона, слайд-шоу, «Windows: интересное»),
    /// и он закрывает обои. Возвращаем его в самый низ.
    /// </summary>
    public static void EnsureWorkerAtBottom(DesktopTarget t)
    {
        if (!t.Raised || t.BottomWorker == IntPtr.Zero) return;
        var first = Native.GetWindow(t.Parent, Native.GW_CHILD);
        if (first == IntPtr.Zero) return;
        if (Native.GetWindow(first, Native.GW_HWNDLAST) != t.BottomWorker)
            Native.SetWindowPos(t.BottomWorker, Native.HWND_BOTTOM, 0, 0, 0, 0, ZFlags);
    }

    /// <summary>Заставляет Explorer перерисовать обычные обои после выхода.</summary>
    public static void RestoreSystemWallpaper()
    {
        var sb = new StringBuilder(1024);
        if (Native.SystemParametersInfo(Native.SPI_GETDESKWALLPAPER, (uint)sb.Capacity, sb, 0))
            Native.SystemParametersInfo(Native.SPI_SETDESKWALLPAPER, 0, sb.ToString(), Native.SPIF_SENDCHANGE);
    }

    /// <summary>Описание окон рабочего стола — пригодится, если обои не видны.</summary>
    public static string Describe()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Windows: {Environment.OSVersion.Version} (Windows 11: {Native.IsWindows11})");
        var progman = Native.FindWindow("Progman", null);
        var ex = progman == IntPtr.Zero ? 0 : Native.GetWindowLongPtr(progman, Native.GWL_EXSTYLE).ToInt64();
        sb.AppendLine($"Progman 0x{progman.ToInt64():X}, exstyle 0x{ex:X} (NOREDIRECTIONBITMAP: {(ex & Native.WS_EX_NOREDIRECTIONBITMAP) != 0})");
        sb.AppendLine("Дочерние окна Progman (сверху вниз):");
        for (var c = Native.GetWindow(progman, Native.GW_CHILD); c != IntPtr.Zero; c = Native.GetWindow(c, 2 /* GW_HWNDNEXT */))
            sb.AppendLine($"  0x{c.ToInt64():X} {Native.ClassName(c)}");
        sb.AppendLine("Окна WorkerW верхнего уровня:");
        for (var w = Native.FindWindowEx(IntPtr.Zero, IntPtr.Zero, "WorkerW", null); w != IntPtr.Zero; w = Native.FindWindowEx(IntPtr.Zero, w, "WorkerW", null))
        {
            var hasShell = Native.FindWindowEx(w, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero;
            sb.AppendLine($"  0x{w.ToInt64():X}{(hasShell ? " (с иконками)" : "")}");
        }
        var t = Find();
        sb.AppendLine(t is DesktopTarget d
            ? $"Выбрано: родитель 0x{d.Parent.ToInt64():X} ({Native.ClassName(d.Parent)}), схема 24H2+: {d.Raised}, WorkerW снизу 0x{d.BottomWorker.ToInt64():X}"
            : "Рабочий стол не найден");
        return sb.ToString();
    }
}
