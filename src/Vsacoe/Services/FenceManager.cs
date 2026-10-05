using System.IO;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using Vsacoe.Core;
using Vsacoe.Interop;
using Vsacoe.Shell;
using Vsacoe.Views;

namespace Vsacoe.Services;

/// <summary>Владеет настройками и окнами оград, реагирует на изменения рабочего стола и Проводника.</summary>
internal sealed class FenceManager : IDisposable
{
    private readonly ConfigStore _store;
    private readonly Dispatcher _dispatcher;
    private readonly Dictionary<Guid, FenceWindow> _windows = new();
    private readonly DispatcherTimer _saveTimer;
    private readonly DispatcherTimer _refreshTimer;
    private readonly DispatcherTimer _iconGuardTimer;
    private DesktopWatcher? _desktop;
    private DesktopDoubleClickHook? _hook;
    private HwndSource? _messageWindow;
    private int _taskbarCreatedMessage;
    private List<string> _desktopItems = new();
    private bool _internalDragActive;
    private bool _internalDropHandled;
    private SettingsWindow? _settingsWindow;
    private bool _disposed;

    public FenceManager(ConfigStore store, Dispatcher dispatcher)
    {
        _store = store;
        _dispatcher = dispatcher;
        Icons = new IconLoader(dispatcher);
        Settings = new AppSettings();

        _saveTimer = new DispatcherTimer(TimeSpan.FromMilliseconds(600), DispatcherPriority.Background, (_, _) => SaveNow(), dispatcher) { IsEnabled = false };
        _refreshTimer = new DispatcherTimer(TimeSpan.FromMilliseconds(200), DispatcherPriority.Background, (_, _) =>
        {
            _refreshTimer!.Stop();
            ReloadDesktopItems();
            RefreshAll();
        }, dispatcher) { IsEnabled = false };

        // Проводник иногда сам возвращает значки (F5, смена темы) — следим за этим.
        _iconGuardTimer = new DispatcherTimer(TimeSpan.FromSeconds(3), DispatcherPriority.Background, (_, _) => ApplyDesktopIconVisibility(), dispatcher) { IsEnabled = false };
    }

    public AppSettings Settings { get; private set; }
    public ConfigStore Store => _store;
    public IconLoader Icons { get; }
    public bool QuickHidden { get; private set; }
    public IEnumerable<FenceWindow> Windows => _windows.Values;

    /// <summary>Изменилось состояние, отображаемое в меню трея.</summary>
    public event EventHandler? StateChanged;

    public void Start()
    {
        Settings = _store.Load();
        _desktop = new DesktopWatcher(_dispatcher);
        _desktop.Changed += OnDesktopChanged;
        ReloadDesktopItems();

        CreateMessageWindow();

        var firstRun = !File.Exists(_store.SettingsPath);
        foreach (var fence in Settings.Fences)
            OpenWindow(fence);

        if (firstRun)
        {
            var fence = CreateFence(FenceKind.Standard);
            fence.Title = "Моя первая ограда";
            _windows[fence.Id].ApplyConfig();
        }

        ApplyDesktopIconVisibility();
        UpdateHook();
        _iconGuardTimer.Start();
        Autostart.RefreshPath();
    }

    // ---------- Ограды ----------

    public FenceConfig CreateFence(FenceKind kind, string? portalPath = null, Point? position = null)
    {
        var area = SystemParameters.WorkArea;
        var offset = (_windows.Count % 8) * 30;
        var fence = new FenceConfig
        {
            Kind = kind,
            PortalPath = portalPath,
            Title = kind == FenceKind.FolderPortal && portalPath != null ? PathUtil.DisplayName(portalPath) : "Новая ограда",
            Left = position?.X ?? area.Left + 80 + offset,
            Top = position?.Y ?? area.Top + 80 + offset,
        };
        Settings.Fences.Add(fence);
        OpenWindow(fence);
        ScheduleSave();
        return fence;
    }

    public void DeleteFence(FenceConfig fence)
    {
        Settings.Fences.Remove(fence);
        Settings.Rules.RemoveAll(r => r.TargetFenceId == fence.Id);
        if (_windows.Remove(fence.Id, out var window))
            window.CloseFence();
        ScheduleSave();
        RefreshAll(); // элементы удалённой ограды вернулись в «остальное»
    }

    private void OpenWindow(FenceConfig fence)
    {
        var window = new FenceWindow(this, fence);
        window.UnexpectedlyClosed += (_, _) =>
        {
            if (App.IsExiting || _disposed || _dispatcher.HasShutdownStarted)
                return;
            Log.Write($"Fence window '{fence.Title}' was destroyed externally, recreating.");
            _windows.Remove(fence.Id);
            _dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
            {
                if (Settings.Fences.Contains(fence) && !_windows.ContainsKey(fence.Id))
                    OpenWindow(fence);
            });
        };
        _windows[fence.Id] = window;
        if (!QuickHidden)
            window.Show();
    }

    private void CloseAllWindows()
    {
        foreach (var w in _windows.Values.ToList())
            w.CloseFence();
        _windows.Clear();
    }

    public IEnumerable<RectD> GetOtherFenceBounds(FenceWindow except) =>
        _windows.Values.Where(w => w != except && w.IsVisible).Select(w => w.Bounds);

    // ---------- Элементы ----------

    /// <summary>Дополнительные элементы «ограды для всего остального».</summary>
    public IReadOnlyList<string> GetCatchAllExtras()
    {
        var extras = FenceItemOps.GetUnsorted(_desktopItems, Settings.Fences);
        if (Settings.HideDesktopIcons && FenceItemOps.FindOwner(Settings.Fences, PathUtil.RecycleBin) == null)
            extras.Insert(0, PathUtil.RecycleBin);
        return extras;
    }

    public bool IsDesktopItem(string path) => _desktop?.IsDesktopItem(path) == true;

    public void MoveItems(IReadOnlyList<string> paths, FenceConfig target, int index)
    {
        foreach (var path in paths)
        {
            FenceItemOps.Move(Settings.Fences, path, target, index);
            if (index >= 0)
                index = target.Items.FindIndex(p => PathUtil.Equal(p, path)) + 1;
        }
        ScheduleSave();
        RefreshAll();
    }

    public void RemoveItems(FenceConfig fence, IEnumerable<string> paths)
    {
        var any = false;
        foreach (var path in paths)
            any |= FenceItemOps.Remove(fence, path);
        if (any)
        {
            ScheduleSave();
            RefreshAll();
        }
    }

    /// <summary>Убирает ссылки на файлы, которые исчезли (например, после перемещения перетаскиванием).</summary>
    public void PruneMissing(IEnumerable<string> paths)
    {
        var any = false;
        foreach (var path in paths)
        {
            if (!PathUtil.Exists(path))
                any |= FenceItemOps.RemovePath(Settings.Fences, path).Count > 0;
        }
        if (any)
            ScheduleSave();
        RequestRefresh();
    }

    public void NotifyRenamed(string oldPath, string newPath)
    {
        Icons.Invalidate(oldPath);
        if (FenceItemOps.RenamePath(Settings.Fences, oldPath, newPath).Count > 0)
            ScheduleSave();
        RequestRefresh();
    }

    public int ApplyRulesNow()
    {
        var moved = FenceItemOps.ApplyRules(Settings, _desktopItems.Select(p => (p, Directory.Exists(p))));
        if (moved > 0)
        {
            ScheduleSave();
            RefreshAll();
        }
        return moved;
    }

    // Внутреннее перетаскивание: источник узнаёт, приняла ли элементы какая-нибудь ограда.
    public void BeginInternalDrag()
    {
        _internalDragActive = true;
        _internalDropHandled = false;
    }

    public void MarkInternalDropHandled()
    {
        if (_internalDragActive)
            _internalDropHandled = true;
    }

    public bool EndInternalDrag()
    {
        _internalDragActive = false;
        return _internalDropHandled;
    }

    // ---------- Рабочий стол ----------

    private void ReloadDesktopItems()
    {
        _desktopItems = _desktop?.Enumerate() ?? new List<string>();
    }

    private void OnDesktopChanged(DesktopChange? change)
    {
        if (change != null)
        {
            switch (change.Type)
            {
                case WatcherChangeTypes.Created:
                    if (Settings.AutoApplyRules && DesktopWatcher.IsVisible(change.Path)
                        && FenceItemOps.FindOwner(Settings.Fences, change.Path) == null)
                    {
                        var target = RuleEngine.FindTarget(change.Path, Directory.Exists(change.Path), Settings.Rules, Settings.Fences);
                        if (target != null)
                        {
                            FenceItemOps.Move(Settings.Fences, change.Path, target);
                            ScheduleSave();
                        }
                    }
                    break;
                case WatcherChangeTypes.Deleted:
                    Icons.Invalidate(change.Path);
                    if (FenceItemOps.RemovePath(Settings.Fences, change.Path).Count > 0)
                        ScheduleSave();
                    break;
                case WatcherChangeTypes.Renamed when change.OldPath != null:
                    Icons.Invalidate(change.OldPath);
                    if (FenceItemOps.RenamePath(Settings.Fences, change.OldPath, change.Path).Count > 0)
                        ScheduleSave();
                    break;
            }
        }
        RequestRefresh();
    }

    public void RequestRefresh()
    {
        _refreshTimer.Stop();
        _refreshTimer.Start();
    }

    public void RefreshAll()
    {
        foreach (var w in _windows.Values)
            w.Refresh();
    }

    public void SetHideDesktopIcons(bool hide)
    {
        if (hide && !Settings.Fences.Any(f => f.IsCatchAll && f.Kind == FenceKind.Standard))
        {
            // Без такой ограды неразложенные файлы стали бы невидимы.
            var area = SystemParameters.WorkArea;
            var fence = CreateFence(FenceKind.Standard, position: new Point(area.Right - 400, area.Top + 40));
            fence.Title = "Рабочий стол";
            fence.IsCatchAll = true;
            fence.Height = 420;
            _windows[fence.Id].ApplyConfig();
        }
        Settings.HideDesktopIcons = hide;
        ApplyDesktopIconVisibility();
        ScheduleSave();
        RefreshAll();
        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    private void ApplyDesktopIconVisibility()
    {
        var shouldHide = Settings.HideDesktopIcons || QuickHidden;
        var visible = DesktopShell.AreIconsVisible();
        if (shouldHide && visible)
            DesktopShell.SetIconsVisible(false);
        else if (!shouldHide && !visible)
            DesktopShell.RestoreIcons(); // в том числе после аварийного завершения
    }

    public void ToggleQuickHide()
    {
        QuickHidden = !QuickHidden;
        foreach (var w in _windows.Values)
        {
            if (QuickHidden)
                w.Hide();
            else
            {
                w.Show();
                w.RePin();
            }
        }
        ApplyDesktopIconVisibility();
        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetLocked(bool locked)
    {
        Settings.LockFences = locked;
        ApplySettingsToWindows();
        ScheduleSave();
        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    private void UpdateHook()
    {
        if (Settings.QuickHideEnabled && _hook == null)
        {
            _hook = new DesktopDoubleClickHook(_dispatcher);
            _hook.DoubleClick += OnGlobalDoubleClick;
        }
        else if (!Settings.QuickHideEnabled && _hook != null)
        {
            _hook.Dispose();
            _hook = null;
        }
    }

    private async void OnGlobalDoubleClick(NativeMethods.POINT pt)
    {
        var hwnd = NativeMethods.WindowFromPoint(pt);
        if (!DesktopShell.IsDesktopSurface(hwnd))
            return;

        // Двойной щелчок по значку открывает его — это не «пустое место».
        if (DesktopShell.IsIconListView(hwnd) && NativeMethods.IsWindowVisible(hwnd))
        {
            var onIcon = await Task.Run(() => DesktopShell.IsIconAtPoint(pt));
            if (onIcon)
                return;
        }
        ToggleQuickHide();
    }

    private void CreateMessageWindow()
    {
        // Невидимое окно верхнего уровня получает широковещательное «TaskbarCreated» после перезапуска Проводника.
        _taskbarCreatedMessage = NativeMethods.RegisterWindowMessage("TaskbarCreated");
        _messageWindow = new HwndSource(new HwndSourceParameters("VsacoeMessageWindow") { Width = 0, Height = 0, WindowStyle = 0 });
        _messageWindow.AddHook((IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled) =>
        {
            if (msg == _taskbarCreatedMessage && _taskbarCreatedMessage != 0)
                OnExplorerRestarted();
            return IntPtr.Zero;
        });
    }

    private void OnExplorerRestarted()
    {
        Log.Write("Explorer restarted, re-pinning fences.");
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            foreach (var w in _windows.Values)
                w.RePin();
            ApplyDesktopIconVisibility();
        };
        timer.Start();
    }

    // ---------- Настройки ----------

    public void ScheduleSave()
    {
        _saveTimer.Stop();
        _saveTimer.Start();
    }

    public void SaveNow()
    {
        _saveTimer.Stop();
        try
        {
            _store.Save(Settings);
        }
        catch (Exception ex)
        {
            Log.Write($"Save failed: {ex}");
        }
    }

    /// <summary>Вызывается после изменения общих настроек.</summary>
    public void ApplySettings()
    {
        UpdateHook();
        ApplyDesktopIconVisibility();
        ApplySettingsToWindows();
        ScheduleSave();
        RefreshAll();
        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    private void ApplySettingsToWindows()
    {
        foreach (var w in _windows.Values)
            w.ApplyConfig();
    }

    public void ShowSettings(int tab = 0)
    {
        if (_settingsWindow == null)
        {
            _settingsWindow = new SettingsWindow(this);
            _settingsWindow.Closed += (_, _) => _settingsWindow = null;
            _settingsWindow.Show();
        }
        _settingsWindow.SelectTab(tab);
        _settingsWindow.Activate();
    }

    /// <summary>Быстрая настройка: готовые ограды с правилами сортировки.</summary>
    public void QuickSetup()
    {
        var area = SystemParameters.WorkArea;
        const double width = 340, height = 230, gap = 20;
        var presets = new (string Title, string Background, string Categories)[]
        {
            ("Программы", "#99183A6B", "Ярлык; Программа"),
            ("Папки", "#99205A30", "Папка"),
            ("Документы", "#99604020", "Документ; Архив"),
            ("Медиа", "#99502870", "Изображение; Видео; Аудио"),
        };

        double x = area.Left + gap, y = area.Top + gap;
        foreach (var (title, background, categories) in presets)
        {
            var fence = new FenceConfig { Title = title, Background = background, Left = x, Top = y, Width = width, Height = height };
            Settings.Fences.Add(fence);
            Settings.Rules.Add(new SortRule { Kind = RuleKind.Category, Pattern = categories, TargetFenceId = fence.Id });
            OpenWindow(fence);
            x += width + gap;
            if (x + width > area.Right)
            {
                x = area.Left + gap;
                y += height + gap;
            }
        }

        var moved = ApplyRulesNow();
        ScheduleSave();
        RefreshAll();

        var answer = MessageBox.Show(
            $"Созданы 4 ограды, разложено элементов: {moved}.\n\n" +
            "Скрыть стандартные значки рабочего стола, чтобы файлы отображались только в оградах? " +
            "Неразложенные элементы попадут в ограду «Рабочий стол».",
            "Vsacoe — быстрая настройка", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (answer == MessageBoxResult.Yes)
            SetHideDesktopIcons(true);
    }

    // ---------- Снимки макета ----------

    public SnapshotFile SaveSnapshot(string name) => _store.SaveSnapshot(name, Settings.Fences);

    public void RestoreSnapshot(LayoutSnapshot snapshot)
    {
        CloseAllWindows();
        var oldIds = Settings.Fences.Select(f => f.Id).ToHashSet();
        Settings.Fences = snapshot.Fences.Select(ConfigStore.Clone).ToList();

        // Правила, указывающие на исчезнувшие ограды, бесполезны.
        var newIds = Settings.Fences.Select(f => f.Id).ToHashSet();
        Settings.Rules.RemoveAll(r => oldIds.Contains(r.TargetFenceId) && !newIds.Contains(r.TargetFenceId));

        foreach (var fence in Settings.Fences)
            OpenWindow(fence);
        ScheduleSave();
        RefreshAll();
        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void Dispose()
    {
        if (_disposed)
            return;
        _disposed = true;
        SaveNow();
        _iconGuardTimer.Stop();
        _hook?.Dispose();
        _desktop?.Dispose();
        _messageWindow?.Dispose();
        CloseAllWindows();
        Icons.Dispose();
        DesktopShell.RestoreIcons();
    }
}
