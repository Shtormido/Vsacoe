using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using JivieOboi.Lock;
using WF = System.Windows.Forms;

namespace JivieOboi;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        app.DispatcherUnhandledException += (_, e) =>
        {
            Log.Error("Необработанная ошибка", e.Exception);
            e.Handled = true;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Write("Критическая ошибка: " + e.ExceptionObject);
        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            Log.Error("Фоновая задача", e.Exception);
            e.SetObserved();
        };

        switch (ScreensaverMode(args))
        {
            case 's': // Windows запустила нас как заставку
                app.Startup += (_, _) => StartScreensaver();
                return app.Run();
            case 'p': // маленький предпросмотр в окне настроек — не поддерживается
                return 0;
            case 'c': // кнопка «Параметры» в окне заставок
                MessageBox.Show("Настройки — в окне «Живые обои»: запустите программу или щёлкните её значок в трее.",
                    "Живые обои", MessageBoxButton.OK, MessageBoxImage.Information);
                return 0;
        }

        using var mutex = new Mutex(true, @"Local\JivieOboi.SingleInstance", out bool isFirst);
        if (!isFirst)
        {
            // Уже запущены — просим первую копию показать окно библиотеки.
            Native.PostMessage(Native.HWND_BROADCAST, Native.RegisterWindowMessage(TrayApp.ShowWindowMessage), IntPtr.Zero, IntPtr.Zero);
            return 0;
        }

        WF.Application.EnableVisualStyles();
        bool openWindow = !args.Any(a => a.Equals("/tray", StringComparison.OrdinalIgnoreCase));
        var tray = new TrayApp();
        app.Startup += (_, _) => tray.Start(openWindow);
        app.Exit += (_, _) => tray.Cleanup();
        return app.Run();
    }

    /// <summary>Аргументы заставки Windows: /s, /p &lt;hwnd&gt;, /c[:hwnd]. Для .scr без аргументов — /c.</summary>
    static char ScreensaverMode(string[] args)
    {
        bool isScr = string.Equals(Path.GetExtension(Environment.ProcessPath ?? ""), ".scr", StringComparison.OrdinalIgnoreCase);
        if (args.Length == 0) return isScr ? 'c' : '\0';
        var a = args[0].Trim().TrimStart('/', '-').ToLowerInvariant();
        return a.Length > 0 && a[0] is 's' or 'p' or 'c' ? a[0] : '\0';
    }

    static void StartScreensaver()
    {
        var settings = Settings.Load();
        var library = LibraryStore.Load();
        WebWallpaper.DataFolderName = "WebView2-screensaver"; // профиль основного процесса занят
        AudioSpectrum.Instance.SetActive(settings.AudioReactive);
        var overlay = new LockOverlay(settings, slot =>
            library.Find(settings.LockWallpaperId) ?? library.Resolve(settings.WallpaperFor(slot.Key)));
        overlay.Dismissed += async () =>
        {
            // Windows сама покажет экран входа — подсунем ему текущий кадр.
            if (settings.LockScreenSync) await LockScreenImage.TryApplyAsync(overlay.PrimaryView, 1200);
            overlay.Close();
            Application.Current.Shutdown();
        };
        overlay.Show();
    }
}
