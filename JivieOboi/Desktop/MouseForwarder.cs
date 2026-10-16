using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Threading;

namespace JivieOboi;

/// <summary>
/// Интерактивные обои: обои лежат под иконками и сами мышь не получают, поэтому
/// глобальный хук мыши ловит движения и щелчки над пустым рабочим столом и пересылает их в обои.
/// Хук работает в отдельном потоке, чтобы занятый интерфейс никогда не тормозил курсор.
/// </summary>
internal sealed class MouseForwarder : IDisposable
{
    const int WH_MOUSE_LL = 14;
    const int WM_MOUSEMOVE = 0x0200, WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202, WM_RBUTTONDOWN = 0x0204, WM_RBUTTONUP = 0x0205;
    const uint WM_QUIT = 0x0012;

    [StructLayout(LayoutKind.Sequential)]
    struct MSLLHOOKSTRUCT
    {
        public Native.POINT pt;
        public uint mouseData, flags, time;
        public IntPtr extraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam, lParam;
        public uint time;
        public Native.POINT pt;
    }

    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint threadId);

    [DllImport("user32.dll")]
    static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr GetModuleHandle(string? name);

    [DllImport("user32.dll")]
    static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);

    [DllImport("user32.dll")]
    static extern bool PostThreadMessage(uint threadId, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll")]
    static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    static extern IntPtr WindowFromPoint(Native.POINT point);

    readonly Dispatcher ui;
    readonly HookProc proc;
    readonly Thread thread;
    readonly DispatcherTimer moveTimer;
    uint threadId;
    bool buttonFromDesktop;
    int moveX, moveY, moveSent, moveVersion;

    /// <summary>Тип события (mousemove/mousedown/mouseup), точка экрана в пикселях, кнопка (0 — левая, 2 — правая).</summary>
    public event Action<string, Point, int>? Mouse;

    public MouseForwarder()
    {
        ui = Application.Current.Dispatcher;
        proc = Hook;
        thread = new Thread(Run) { IsBackground = true, Name = "JivieOboi mouse hook" };
        thread.Start();

        // Движения прореживаем до ~60 в секунду.
        moveTimer = new DispatcherTimer(DispatcherPriority.Input) { Interval = TimeSpan.FromMilliseconds(16) };
        moveTimer.Tick += (_, _) =>
        {
            int v = Volatile.Read(ref moveVersion);
            if (v == moveSent) return;
            moveSent = v;
            Mouse?.Invoke("mousemove", new Point(Volatile.Read(ref moveX), Volatile.Read(ref moveY)), 0);
        };
        moveTimer.Start();
    }

    void Run()
    {
        threadId = GetCurrentThreadId();
        var hook = SetWindowsHookEx(WH_MOUSE_LL, proc, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero)
        {
            Log.Write("Не удалось установить хук мыши: " + Marshal.GetLastWin32Error());
            return;
        }
        while (GetMessage(out _, IntPtr.Zero, 0, 0) > 0) { }
        UnhookWindowsHookEx(hook);
    }

    IntPtr Hook(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            try
            {
                var info = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                int msg = wParam.ToInt32();
                switch (msg)
                {
                    case WM_MOUSEMOVE:
                        if (buttonFromDesktop || OverDesktop(info.pt))
                        {
                            Volatile.Write(ref moveX, info.pt.X);
                            Volatile.Write(ref moveY, info.pt.Y);
                            Interlocked.Increment(ref moveVersion);
                        }
                        break;
                    case WM_LBUTTONDOWN or WM_RBUTTONDOWN:
                        if (OverDesktop(info.pt))
                        {
                            buttonFromDesktop = true;
                            Raise("mousedown", info.pt, msg == WM_RBUTTONDOWN ? 2 : 0);
                        }
                        break;
                    case WM_LBUTTONUP or WM_RBUTTONUP:
                        if (buttonFromDesktop)
                        {
                            buttonFromDesktop = false;
                            Raise("mouseup", info.pt, msg == WM_RBUTTONUP ? 2 : 0);
                        }
                        break;
                }
            }
            catch
            {
                // Хук обязан быстро вернуть управление при любых условиях.
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    void Raise(string type, Native.POINT pt, int button) =>
        ui.BeginInvoke(() => Mouse?.Invoke(type, new Point(pt.X, pt.Y), button));

    /// <summary>Курсор над пустым рабочим столом (а не над окном программы).</summary>
    static bool OverDesktop(Native.POINT pt)
    {
        var h = WindowFromPoint(pt);
        if (h == IntPtr.Zero) return false;
        var cls = Native.ClassName(h);
        if (cls == "SysListView32") cls = Native.ClassName(Native.GetParent(h));
        return cls is "SHELLDLL_DefView" or "WorkerW" or "Progman";
    }

    public void Dispose()
    {
        moveTimer.Stop();
        if (threadId != 0) PostThreadMessage(threadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
    }
}
