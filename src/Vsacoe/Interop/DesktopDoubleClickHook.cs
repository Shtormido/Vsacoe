using System.Runtime.InteropServices;
using System.Windows.Threading;
using static Vsacoe.Interop.NativeMethods;

namespace Vsacoe.Interop;

/// <summary>
/// Глобальный перехват мыши (WH_MOUSE_LL), который распознаёт двойной щелчок в любом месте экрана.
/// Сам обработчик ничего не проверяет — только сообщает координаты через Dispatcher,
/// чтобы не задерживать ввод.
/// </summary>
internal sealed class DesktopDoubleClickHook : IDisposable
{
    private readonly LowLevelMouseProc _proc;
    private readonly Dispatcher _dispatcher;
    private IntPtr _hook;
    private uint _lastTime;
    private POINT _lastPoint;

    public event Action<POINT>? DoubleClick;

    public DesktopDoubleClickHook(Dispatcher dispatcher)
    {
        _dispatcher = dispatcher;
        _proc = Callback; // держим делегат, иначе его соберёт GC
        _hook = SetWindowsHookEx(WH_MOUSE_LL, _proc, GetModuleHandle(null), 0);
        if (_hook == IntPtr.Zero)
            Log.Write($"SetWindowsHookEx failed: {Marshal.GetLastWin32Error()}");
    }

    private IntPtr Callback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && wParam == (IntPtr)WM_LBUTTONDOWN)
        {
            var info = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
            var withinTime = unchecked(info.time - _lastTime) <= GetDoubleClickTime();
            var withinArea = Math.Abs(info.pt.X - _lastPoint.X) <= GetSystemMetrics(SM_CXDOUBLECLK) / 2
                          && Math.Abs(info.pt.Y - _lastPoint.Y) <= GetSystemMetrics(SM_CYDOUBLECLK) / 2;
            if (_lastTime != 0 && withinTime && withinArea)
            {
                _lastTime = 0;
                var pt = info.pt;
                _dispatcher.BeginInvoke(() => DoubleClick?.Invoke(pt));
            }
            else
            {
                _lastTime = info.time;
                _lastPoint = info.pt;
            }
        }
        return CallNextHookEx(_hook, nCode, wParam, lParam);
    }

    public void Dispose()
    {
        if (_hook != IntPtr.Zero)
        {
            UnhookWindowsHookEx(_hook);
            _hook = IntPtr.Zero;
        }
    }
}
