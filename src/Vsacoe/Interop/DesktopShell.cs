using System.Runtime.InteropServices;
using System.Windows.Automation;
using static Vsacoe.Interop.NativeMethods;

namespace Vsacoe.Interop;

/// <summary>
/// Работа с окнами рабочего стола Проводника.
/// Значки рабочего стола — это SysListView32 внутри SHELLDLL_DefView, который живёт либо в Progman,
/// либо (при анимированных обоях / на части версий Windows) в одном из окон WorkerW.
/// </summary>
internal static class DesktopShell
{
    private static IntPtr _cachedTop;

    /// <summary>Окно верхнего уровня (Progman или WorkerW), в котором находятся значки рабочего стола.</summary>
    public static IntPtr GetDesktopTopWindow()
    {
        if (_cachedTop != IntPtr.Zero && IsWindow(_cachedTop) && FindWindowEx(_cachedTop, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
            return _cachedTop;

        _cachedTop = IntPtr.Zero;
        var progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero && FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
        {
            _cachedTop = progman;
            return progman;
        }

        EnumWindows((hwnd, _) =>
        {
            if (GetClassName(hwnd) == "WorkerW" && FindWindowEx(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
            {
                _cachedTop = hwnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        return _cachedTop != IntPtr.Zero ? _cachedTop : progman;
    }

    public static IntPtr GetIconListView()
    {
        var top = GetDesktopTopWindow();
        if (top == IntPtr.Zero)
            return IntPtr.Zero;
        var defView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
        return defView == IntPtr.Zero ? IntPtr.Zero : FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
    }

    public static bool AreIconsVisible()
    {
        var lv = GetIconListView();
        return lv == IntPtr.Zero || IsWindowVisible(lv);
    }

    /// <summary>Показывает/скрывает стандартные значки рабочего стола (до перезапуска Проводника).</summary>
    public static void SetIconsVisible(bool visible)
    {
        var lv = GetIconListView();
        if (lv != IntPtr.Zero && IsWindowVisible(lv) != visible)
            ShowWindow(lv, visible ? SW_SHOWNA : SW_HIDE);
    }

    /// <summary>
    /// Возвращает значки, если их не скрыл сам пользователь через «Вид → Отображать значки рабочего стола».
    /// </summary>
    public static void RestoreIcons()
    {
        if (!ExplorerSettingHidesIcons())
            SetIconsVisible(true);
    }

    private static bool ExplorerSettingHidesIcons()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced");
            return key?.GetValue("HideIcons") is int value && value != 0;
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or UnauthorizedAccessException or System.IO.IOException)
        {
            return false;
        }
    }

    /// <summary>Находится ли окно на поверхности рабочего стола (значки, обои, Progman/WorkerW).</summary>
    public static bool IsDesktopSurface(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
            return false;
        var root = GetAncestor(hwnd, GA_ROOT);
        var cls = GetClassName(root);
        return cls == "Progman" || cls == "WorkerW";
    }

    public static bool IsIconListView(IntPtr hwnd) =>
        hwnd != IntPtr.Zero && GetClassName(hwnd) == "SysListView32" && GetClassName(GetParent(hwnd)) == "SHELLDLL_DefView";

    /// <summary>Есть ли значок рабочего стола под точкой (экранные пиксели). Вызывать не из UI-потока.</summary>
    public static bool IsIconAtPoint(POINT pt)
    {
        try
        {
            var element = AutomationElement.FromPoint(new System.Windows.Point(pt.X, pt.Y));
            for (var depth = 0; element != null && depth < 4; depth++)
            {
                var type = element.Current.ControlType;
                if (type == ControlType.ListItem)
                    return true;
                if (type == ControlType.List || type == ControlType.Pane || type == ControlType.Window)
                    return false;
                element = TreeWalker.ControlViewWalker.GetParent(element);
            }
        }
        catch (Exception ex) when (ex is ElementNotAvailableException or COMException or InvalidOperationException)
        {
        }
        return false;
    }

    /// <summary>
    /// «Приклеивает» окно к рабочему столу: убирает его из Alt+Tab и панели задач и делает владельцем
    /// окно рабочего стола — так ограда остаётся видимой после Win+D и всегда лежит прямо над обоями.
    /// </summary>
    public static void PinToDesktop(IntPtr hwnd)
    {
        var ex = GetWindowLongPtr(hwnd, GWL_EXSTYLE).ToInt64();
        ex = (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, new IntPtr(ex));

        var top = GetDesktopTopWindow();
        if (top != IntPtr.Zero)
            SetWindowLongPtr(hwnd, GWLP_HWNDPARENT, top);

        SendToDesktopLevel(hwnd);
    }

    public static void SendToDesktopLevel(IntPtr hwnd)
    {
        var after = GetInsertAfter(hwnd);
        if (after != null)
            SetWindowPos(hwnd, after.Value, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }

    /// <summary>Обработчик WM_WINDOWPOSCHANGING: не даёт ограде подняться над обычными окнами.</summary>
    public static void KeepAtDesktopLevel(IntPtr hwnd, IntPtr lParam)
    {
        var pos = Marshal.PtrToStructure<WINDOWPOS>(lParam);
        if ((pos.flags & SWP_NOZORDER) != 0)
            return;

        var after = GetInsertAfter(hwnd);
        if (after == null)
            pos.flags |= SWP_NOZORDER;
        else
            pos.hwndInsertAfter = after.Value;
        Marshal.StructureToPtr(pos, lParam, false);
    }

    /// <summary>
    /// Окно, под которое нужно вставить ограду, чтобы она оказалась сразу над рабочим столом,
    /// или null, если ограда уже там.
    /// </summary>
    private static IntPtr? GetInsertAfter(IntPtr hwnd)
    {
        var top = GetDesktopTopWindow();
        if (top == IntPtr.Zero)
            return null;
        var above = GetWindow(top, GW_HWNDPREV);
        if (above == hwnd)
            return null;
        return above == IntPtr.Zero ? IntPtr.Zero /* HWND_TOP */ : above;
    }
}
