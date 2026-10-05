using System.Windows;
using System.Windows.Threading;
using Vsacoe.Core;
using Vsacoe.Interop;
using Vsacoe.Services;

namespace Vsacoe;

public partial class App : Application
{
    private Mutex? _mutex;
    private bool _ownsMutex;
    private FenceManager? _manager;
    private TrayIcon? _tray;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _mutex = new Mutex(true, @"Local\Vsacoe.SingleInstance", out _ownsMutex);
        if (!_ownsMutex)
        {
            MessageBox.Show("Vsacoe уже запущен — его значок находится в области уведомлений.", "Vsacoe",
                MessageBoxButton.OK, MessageBoxImage.Information);
            Shutdown();
            return;
        }

        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            Log.Write($"Fatal: {args.ExceptionObject}");
            DesktopShell.RestoreIcons(); // не оставляем пользователя без значков
        };

        var store = new ConfigStore(ConfigStore.DefaultDirectory);
        var firstRun = !System.IO.File.Exists(store.SettingsPath);
        _manager = new FenceManager(store, Dispatcher);
        _manager.Start();
        _tray = new TrayIcon(_manager);

        if (firstRun)
        {
            _tray.ShowBalloon("Vsacoe запущен",
                "Перетащите файлы с рабочего стола в ограду. Правый щелчок по ограде или по значку здесь — меню.");
        }
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        Log.Write($"Unhandled: {e.Exception}");
        MessageBox.Show($"Произошла ошибка:\n{e.Exception.Message}\n\nПодробности записаны в журнал.", "Vsacoe",
            MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _tray?.Dispose();
        _manager?.Dispose();
        if (_ownsMutex)
            _mutex?.ReleaseMutex();
        _mutex?.Dispose();
        base.OnExit(e);
    }

    /// <summary>Приложение завершается: закрытие окон оград больше не считается сбоем.</summary>
    internal static bool IsExiting { get; private set; }

    internal static void ExitApp()
    {
        IsExiting = true;
        Current.Shutdown();
    }

    protected override void OnSessionEnding(SessionEndingCancelEventArgs e)
    {
        IsExiting = true;
        _manager?.SaveNow();
        base.OnSessionEnding(e);
    }

    /// <summary>Выбор папки и создание портала.</summary>
    internal static void CreatePortalInteractive(FenceManager manager, Point? position)
    {
        var dialog = new Microsoft.Win32.OpenFolderDialog { Title = "Выберите папку для портала" };
        if (dialog.ShowDialog() == true)
            manager.CreateFence(FenceKind.FolderPortal, dialog.FolderName, position);
    }
}
