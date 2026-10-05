using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Vsacoe.Core;
using Vsacoe.Interop;
using Vsacoe.Services;
using Vsacoe.Shell;

namespace Vsacoe.Views;

internal partial class FenceWindow : Window
{
    private const string InternalFormat = "Vsacoe.FenceItems";
    private const double RolledHeight = 30;
    private const double MinExpandedHeight = 80;

    private static readonly (string Name, string Color)[] ColorPresets =
    {
        ("Графит", "#99202020"),
        ("Синий", "#99183A6B"),
        ("Зелёный", "#99205A30"),
        ("Бордовый", "#99702030"),
        ("Фиолетовый", "#99502870"),
        ("Янтарный", "#99805010"),
        ("Стекло", "#33FFFFFF"),
        ("Почти невидимая", "#14000000"),
    };

    private static readonly (string Name, ItemSortMode Mode)[] SortModes =
    {
        ("Вручную", ItemSortMode.Manual),
        ("По имени", ItemSortMode.Name),
        ("По типу", ItemSortMode.Type),
        ("По дате изменения", ItemSortMode.DateModified),
        ("По размеру", ItemSortMode.Size),
    };

    private readonly FenceManager _manager;
    private readonly ObservableCollection<FenceItemViewModel> _items = new();
    private readonly DispatcherTimer _collapseTimer;
    private readonly DispatcherTimer _portalRefreshTimer;

    private bool _allowClose;
    private bool _closed;
    private bool _peeking;
    private bool _menuOpen;
    private bool _dragging;
    private Point _dragStart;
    private FenceItemViewModel? _pressedItem;
    private FenceItemViewModel? _deferredSelect;
    private FenceItemViewModel? _anchor;

    private string? _portalCurrent;
    private FileSystemWatcher? _portalWatcher;

    public FenceWindow(FenceManager manager, FenceConfig config)
    {
        InitializeComponent();
        _manager = manager;
        Config = config;
        ItemsHost.ItemsSource = _items;

        _collapseTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(450) };
        _collapseTimer.Tick += (_, _) => TryEndPeek();
        _portalRefreshTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
        _portalRefreshTimer.Tick += (_, _) =>
        {
            _portalRefreshTimer.Stop();
            Refresh();
        };

        SourceInitialized += (_, _) =>
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            HwndSource.FromHwnd(hwnd)?.AddHook(WndProc);
            DesktopShell.PinToDesktop(hwnd);
        };
        Loaded += (_, _) => Refresh();
        DpiChanged += (_, _) => Refresh();

        ContentArea.PreviewMouseLeftButtonDown += Content_PreviewMouseLeftButtonDown;
        ContentArea.PreviewMouseMove += Content_PreviewMouseMove;
        ContentArea.PreviewMouseLeftButtonUp += Content_PreviewMouseLeftButtonUp;
        MouseRightButtonUp += Window_MouseRightButtonUp;
        PreviewKeyDown += Window_PreviewKeyDown;
        MouseEnter += (_, _) => BeginPeek();
        MouseLeave += (_, _) => ScheduleEndPeek();
        DragEnter += Window_DragOver;
        DragOver += Window_DragOver;
        DragLeave += (_, _) =>
        {
            InsertMarker.Visibility = Visibility.Collapsed;
            ScheduleEndPeek();
        };
        Drop += Window_Drop;

        if (Config.Kind == FenceKind.FolderPortal)
            NavigatePortal(Config.PortalPath, refresh: false);

        ApplyConfig();
    }

    public FenceConfig Config { get; }

    public RectD Bounds => new(Left, Top, Width, Height);

    private bool IsRolledVisual => Config.RolledUp && !_peeking;

    private IntPtr Handle => new WindowInteropHelper(this).Handle;

    // ---------- Внешний вид ----------

    /// <summary>Применяет FenceConfig и общие настройки к окну.</summary>
    public void ApplyConfig()
    {
        EnsureOnScreen();
        Left = Config.Left;
        Top = Config.Top;
        Width = Config.Width;
        Frame.Background = new SolidColorBrush(ParseColor(Config.Background));

        var iconSize = (double)_manager.Settings.IconSize;
        Resources["IconSize"] = iconSize;
        Resources["TileWidth"] = Math.Max(72, iconSize + 36);

        var locked = _manager.Settings.LockFences;
        foreach (var thumb in new[] { ThumbLeft, ThumbRight, ThumbTop, ThumbBottom, ThumbTopLeft, ThumbTopRight, ThumbBottomLeft, ThumbBottomRight })
            thumb.IsEnabled = !locked;
        TitleBar.Cursor = locked ? null : Cursors.SizeAll;

        UpdateTitle();
        UpdateRollState();
    }

    private void UpdateTitle()
    {
        var title = Config.Title;
        if (Config.Kind == FenceKind.FolderPortal && _portalCurrent != null && Config.PortalPath != null
            && !PathUtil.Equal(_portalCurrent, Config.PortalPath))
        {
            title += " › " + Path.GetRelativePath(Config.PortalPath, _portalCurrent).Replace(Path.DirectorySeparatorChar.ToString(), " › ");
        }
        TitleText.Text = title;
        TitleBar.ToolTip = Config.Kind == FenceKind.FolderPortal ? _portalCurrent ?? Config.PortalPath : null;
        BackButton.Visibility = Config.Kind == FenceKind.FolderPortal && _portalCurrent != null && Config.PortalPath != null
                                && PathUtil.IsUnder(_portalCurrent, Config.PortalPath)
            ? Visibility.Visible
            : Visibility.Collapsed;
    }

    private void UpdateRollState()
    {
        var rolled = IsRolledVisual;
        ContentArea.Visibility = rolled ? Visibility.Collapsed : Visibility.Visible;
        Height = rolled ? RolledHeight : Math.Max(MinExpandedHeight, Config.Height);
        foreach (var thumb in new[] { ThumbTop, ThumbBottom, ThumbTopLeft, ThumbTopRight, ThumbBottomLeft, ThumbBottomRight })
            thumb.Visibility = rolled ? Visibility.Collapsed : Visibility.Visible;
        RollIndicator.Text = Config.RolledUp ? $"▾ {_items.Count}" : "";
    }

    private void EnsureOnScreen()
    {
        var virtualScreen = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
            SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
        var titleArea = new Rect(Config.Left, Config.Top, Math.Max(Config.Width, 60), RolledHeight);
        if (!virtualScreen.IntersectsWith(titleArea))
        {
            // Монитор, на котором была ограда, отключён.
            var work = SystemParameters.WorkArea;
            Config.Left = work.Left + 40;
            Config.Top = work.Top + 40;
        }
    }

    public void RePin()
    {
        if (Handle != IntPtr.Zero)
            DesktopShell.PinToDesktop(Handle);
    }

    private static Color ParseColor(string text)
    {
        try
        {
            return (Color)ColorConverter.ConvertFromString(text);
        }
        catch (FormatException)
        {
            return (Color)ColorConverter.ConvertFromString(FenceConfig.DefaultBackground);
        }
    }

    private void SetBackground(Color color)
    {
        // Совсем прозрачная ограда перестала бы ловить мышь.
        if (color.A < 0x14)
            color.A = 0x14;
        Config.Background = color.ToString();
        Frame.Background = new SolidColorBrush(color);
        _manager.ScheduleSave();
    }

    // ---------- Содержимое ----------

    public void Refresh()
    {
        var existing = new Dictionary<(string, bool), FenceItemViewModel>(PathUtilTupleComparer.Instance);
        foreach (var item in _items)
            existing.TryAdd((item.Path, item.IsExtra), item);
        FenceItemViewModel? Make(string path, bool extra) =>
            existing.TryGetValue((path, extra), out var vm) ? vm : FenceItemViewModel.TryCreate(path, extra);

        List<FenceItemViewModel> list;
        if (Config.Kind == FenceKind.Standard)
        {
            var explicitItems = Config.Items.Select(p => Make(p, false)).OfType<FenceItemViewModel>().ToList();
            var extras = Config.IsCatchAll
                ? _manager.GetCatchAllExtras().Select(p => Make(p, true)).OfType<FenceItemViewModel>().ToList()
                : new List<FenceItemViewModel>();

            list = Config.SortMode == ItemSortMode.Manual
                ? explicitItems.Concat(ItemSorter.Sort(extras, ItemSortMode.Name, v => v.Info)).ToList()
                : ItemSorter.Sort(explicitItems.Concat(extras), Config.SortMode, v => v.Info);
            EmptyHint.Text = "Перетащите сюда файлы, папки или ярлыки";
        }
        else
        {
            list = new List<FenceItemViewModel>();
            if (_portalCurrent != null && Directory.Exists(_portalCurrent))
            {
                try
                {
                    foreach (var entry in new DirectoryInfo(_portalCurrent).EnumerateFileSystemInfos())
                    {
                        if (DesktopWatcher.IsVisible(entry) && Make(entry.FullName, false) is { } vm)
                            list.Add(vm);
                    }
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    Log.Write($"Portal {_portalCurrent}: {ex.Message}");
                }
                var mode = Config.SortMode == ItemSortMode.Manual ? ItemSortMode.Name : Config.SortMode;
                list = ItemSorter.Sort(list, mode, v => v.Info);
                EmptyHint.Text = "Папка пуста";
            }
            else
            {
                EmptyHint.Text = Config.PortalPath == null
                    ? "Щёлкните правой кнопкой и выберите папку"
                    : $"Папка недоступна:\n{Config.PortalPath}";
            }
        }

        if (!list.SequenceEqual(_items))
        {
            _items.Clear();
            foreach (var vm in list)
                _items.Add(vm);
        }

        LoadIcons();
        EmptyHint.Visibility = _items.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        RollIndicator.Text = Config.RolledUp ? $"▾ {_items.Count}" : "";
    }

    private void LoadIcons()
    {
        double scale;
        try
        {
            scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
        }
        catch (InvalidOperationException)
        {
            scale = 1;
        }
        var pixels = (int)Math.Round(_manager.Settings.IconSize * scale);
        foreach (var vm in _items)
        {
            if (vm.LoadedIconSize == pixels)
                continue;
            vm.LoadedIconSize = pixels;
            var target = vm;
            _manager.Icons.Load(vm.Path, pixels, image => target.Icon = image);
        }
    }

    private List<FenceItemViewModel> Selected => _items.Where(i => i.IsSelected).ToList();

    private void ClearSelection()
    {
        foreach (var item in _items)
            item.IsSelected = false;
    }

    // ---------- Портал папки ----------

    private void NavigatePortal(string? path, bool refresh = true)
    {
        _portalWatcher?.Dispose();
        _portalWatcher = null;
        _portalCurrent = path;

        if (path != null && Directory.Exists(path))
        {
            try
            {
                _portalWatcher = new FileSystemWatcher(path)
                {
                    IncludeSubdirectories = false,
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size,
                };
                FileSystemEventHandler onChange = (_, _) => Dispatcher.BeginInvoke(() =>
                {
                    _portalRefreshTimer.Stop();
                    _portalRefreshTimer.Start();
                });
                _portalWatcher.Created += onChange;
                _portalWatcher.Deleted += onChange;
                _portalWatcher.Changed += onChange;
                _portalWatcher.Renamed += (s, e) => onChange(s, e);
                _portalWatcher.EnableRaisingEvents = true;
            }
            catch (Exception ex) when (ex is IOException or ArgumentException or UnauthorizedAccessException)
            {
                Log.Write($"Portal watcher {path}: {ex.Message}");
            }
        }

        _anchor = null;
        UpdateTitle();
        if (refresh)
        {
            _items.Clear();
            Refresh();
        }
    }

    private void BackButton_Click(object sender, RoutedEventArgs e) => NavigateUp();

    private void NavigateUp()
    {
        if (_portalCurrent == null || Config.PortalPath == null || !PathUtil.IsUnder(_portalCurrent, Config.PortalPath))
            return;
        NavigatePortal(Path.GetDirectoryName(_portalCurrent.TrimEnd('\\', '/')));
    }

    private void ChoosePortalFolder()
    {
        var dialog = new Microsoft.Win32.OpenFolderDialog { Title = "Папка для портала", InitialDirectory = Config.PortalPath ?? "" };
        if (dialog.ShowDialog(this) != true)
            return;
        Config.PortalPath = dialog.FolderName;
        Config.Title = PathUtil.DisplayName(dialog.FolderName);
        _manager.ScheduleSave();
        NavigatePortal(dialog.FolderName);
    }

    // ---------- Заголовок: перемещение, сворачивание, переименование ----------

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (TitleEditor.IsVisible || IsInside<ButtonBase>(e.OriginalSource as DependencyObject))
            return;

        if (e.ClickCount == 2)
        {
            ToggleRollUp();
            e.Handled = true;
            return;
        }

        if (_manager.Settings.LockFences)
            return;
        try
        {
            DragMove();
        }
        catch (InvalidOperationException)
        {
            return;
        }
        SnapAndSavePosition();
    }

    private void SnapAndSavePosition()
    {
        var snapped = SnapMath.SnapPosition(
            new RectD(Left, Top, Width, Height),
            GetWorkArea(),
            _manager.GetOtherFenceBounds(this),
            _manager.Settings.GridSize,
            _manager.Settings.SnapToGrid);
        Left = snapped.X;
        Top = snapped.Y;
        Config.Left = Left;
        Config.Top = Top;
        _manager.ScheduleSave();
    }

    private RectD GetWorkArea()
    {
        var area = System.Windows.Forms.Screen.FromHandle(Handle).WorkingArea;
        var transform = PresentationSource.FromVisual(this)?.CompositionTarget?.TransformFromDevice ?? Matrix.Identity;
        var topLeft = transform.Transform(new Point(area.Left, area.Top));
        var bottomRight = transform.Transform(new Point(area.Right, area.Bottom));
        return new RectD(topLeft.X, topLeft.Y, bottomRight.X - topLeft.X, bottomRight.Y - topLeft.Y);
    }

    private void ToggleRollUp()
    {
        Config.RolledUp = !Config.RolledUp;
        _peeking = false;
        UpdateRollState();
        _manager.ScheduleSave();
    }

    private void BeginPeek()
    {
        _collapseTimer.Stop();
        if (Config.RolledUp && !_peeking && _manager.Settings.ExpandRolledOnHover)
        {
            _peeking = true;
            UpdateRollState();
        }
    }

    private void ScheduleEndPeek()
    {
        if (_peeking)
        {
            _collapseTimer.Stop();
            _collapseTimer.Start();
        }
    }

    private void TryEndPeek()
    {
        _collapseTimer.Stop();
        if (!_peeking || IsMouseOver || _menuOpen || _dragging || TitleEditor.IsVisible)
            return;
        _peeking = false;
        UpdateRollState();
    }

    private void BeginTitleEdit()
    {
        TitleEditor.Text = Config.Title;
        TitleText.Visibility = Visibility.Collapsed;
        TitleEditor.Visibility = Visibility.Visible;
        Activate();
        TitleEditor.Focus();
        TitleEditor.SelectAll();
    }

    private void EndTitleEdit(bool commit)
    {
        if (TitleEditor.Visibility != Visibility.Visible)
            return;
        if (commit)
        {
            Config.Title = TitleEditor.Text.Trim();
            _manager.ScheduleSave();
        }
        TitleEditor.Visibility = Visibility.Collapsed;
        TitleText.Visibility = Visibility.Visible;
        UpdateTitle();
        ScheduleEndPeek();
    }

    private void TitleEditor_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            EndTitleEdit(commit: true);
            e.Handled = true;
        }
        else if (e.Key == Key.Escape)
        {
            EndTitleEdit(commit: false);
            e.Handled = true;
        }
    }

    private void TitleEditor_LostKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e) => EndTitleEdit(commit: true);

    // ---------- Изменение размера ----------

    private void Resize_DragDelta(object sender, DragDeltaEventArgs e)
    {
        if (_manager.Settings.LockFences)
            return;
        var t = (Thumb)sender;
        var left = t == ThumbLeft || t == ThumbTopLeft || t == ThumbBottomLeft;
        var right = t == ThumbRight || t == ThumbTopRight || t == ThumbBottomRight;
        var top = t == ThumbTop || t == ThumbTopLeft || t == ThumbTopRight;
        var bottom = t == ThumbBottom || t == ThumbBottomLeft || t == ThumbBottomRight;

        if (right)
            Width = Math.Max(MinWidth, Width + e.HorizontalChange);
        if (left)
        {
            var width = Math.Max(MinWidth, Width - e.HorizontalChange);
            Left += Width - width;
            Width = width;
        }
        if (IsRolledVisual)
            return;
        if (bottom)
            Height = Math.Max(MinExpandedHeight, Height + e.VerticalChange);
        if (top)
        {
            var height = Math.Max(MinExpandedHeight, Height - e.VerticalChange);
            Top += Height - height;
            Height = height;
        }
    }

    private void Resize_DragCompleted(object sender, DragCompletedEventArgs e)
    {
        var grid = _manager.Settings.GridSize;
        var snap = _manager.Settings.SnapToGrid;
        var right = Left + Width;
        var bottom = Top + Height;
        Left = snap ? SnapMath.ToGrid(Left, grid) : Left;
        Top = snap && !IsRolledVisual ? SnapMath.ToGrid(Top, grid) : Top;
        Width = SnapMath.SnapSize(right - Left, MinWidth, grid, snap);
        if (!IsRolledVisual)
        {
            Height = SnapMath.SnapSize(bottom - Top, MinExpandedHeight, grid, snap);
            Config.Height = Height;
        }
        Config.Left = Left;
        Config.Top = Top;
        Config.Width = Width;
        _manager.ScheduleSave();
    }

    // ---------- Мышь и клавиатура ----------

    private static FenceItemViewModel? ItemFrom(object? source) => source switch
    {
        FrameworkElement fe => fe.DataContext as FenceItemViewModel,
        FrameworkContentElement fce => fce.DataContext as FenceItemViewModel,
        _ => null,
    };

    private static bool IsInside<T>(DependencyObject? element) where T : DependencyObject
    {
        while (element != null)
        {
            if (element is T)
                return true;
            element = element is Visual ? VisualTreeHelper.GetParent(element) : LogicalTreeHelper.GetParent(element);
        }
        return false;
    }

    private void Content_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (IsInside<ScrollBar>(e.OriginalSource as DependencyObject))
            return;

        Activate();
        var vm = ItemFrom(e.OriginalSource);
        var ctrl = Keyboard.Modifiers.HasFlag(ModifierKeys.Control);
        var shift = Keyboard.Modifiers.HasFlag(ModifierKeys.Shift);
        _deferredSelect = null;

        if (vm == null)
        {
            if (!ctrl && !shift)
                ClearSelection();
            _pressedItem = null;
            return;
        }

        if (e.ClickCount == 2)
        {
            _pressedItem = null;
            OpenItem(vm);
            e.Handled = true;
            return;
        }

        if (ctrl)
        {
            vm.IsSelected = !vm.IsSelected;
            _anchor = vm;
        }
        else if (shift && _anchor != null && _items.Contains(_anchor))
        {
            int a = _items.IndexOf(_anchor), b = _items.IndexOf(vm);
            for (var i = 0; i < _items.Count; i++)
                _items[i].IsSelected = i >= Math.Min(a, b) && i <= Math.Max(a, b);
        }
        else if (!vm.IsSelected)
        {
            ClearSelection();
            vm.IsSelected = true;
            _anchor = vm;
        }
        else
        {
            // Щелчок по уже выделенному: снимем остальное выделение, если это не начало перетаскивания.
            _deferredSelect = vm;
        }

        _pressedItem = vm;
        _dragStart = e.GetPosition(this);
        e.Handled = true;
    }

    private void Content_PreviewMouseMove(object sender, MouseEventArgs e)
    {
        if (_pressedItem == null || e.LeftButton != MouseButtonState.Pressed)
            return;
        var pos = e.GetPosition(this);
        if (Math.Abs(pos.X - _dragStart.X) < SystemParameters.MinimumHorizontalDragDistance
            && Math.Abs(pos.Y - _dragStart.Y) < SystemParameters.MinimumVerticalDragDistance)
            return;

        if (!_pressedItem.IsSelected)
            _pressedItem.IsSelected = true;
        _pressedItem = null;
        _deferredSelect = null;
        StartDrag();
    }

    private void Content_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (_deferredSelect != null)
        {
            ClearSelection();
            _deferredSelect.IsSelected = true;
            _anchor = _deferredSelect;
        }
        _deferredSelect = null;
        _pressedItem = null;
    }

    private void Window_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (TitleEditor.IsVisible)
            return;
        var vm = ItemFrom(e.OriginalSource);
        ContextMenu menu;
        if (vm != null)
        {
            if (!vm.IsSelected)
            {
                ClearSelection();
                vm.IsSelected = true;
                _anchor = vm;
            }
            menu = BuildItemMenu(Selected);
        }
        else
        {
            menu = BuildFenceMenu();
        }
        ShowMenu(menu);
        e.Handled = true;
    }

    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (TitleEditor.IsKeyboardFocusWithin)
            return;
        var selected = Selected;
        switch (e.Key)
        {
            case Key.Enter when selected.Count > 0:
                foreach (var vm in selected)
                    OpenItem(vm);
                break;
            case Key.Delete when selected.Count > 0:
                DeleteItems(selected);
                break;
            case Key.F2 when selected.Count == 1:
                RenameItem(selected[0]);
                break;
            case Key.F2:
                BeginTitleEdit();
                break;
            case Key.A when Keyboard.Modifiers == ModifierKeys.Control:
                foreach (var vm in _items)
                    vm.IsSelected = true;
                break;
            case Key.Escape:
                ClearSelection();
                break;
            case Key.Back when Config.Kind == FenceKind.FolderPortal:
                NavigateUp();
                break;
            case Key.F5:
                _manager.Icons.Clear();
                foreach (var vm in _items)
                    vm.LoadedIconSize = 0;
                Refresh();
                break;
            default:
                return;
        }
        e.Handled = true;
    }

    // ---------- Действия с элементами ----------

    private void OpenItem(FenceItemViewModel vm)
    {
        if (Config.Kind == FenceKind.FolderPortal && vm.IsDirectory)
            NavigatePortal(vm.Path);
        else
            ShellActions.Open(vm.Path);
    }

    private void RenameItem(FenceItemViewModel vm)
    {
        if (vm.IsVirtual)
            return;
        var name = InputDialog.Show(this, "Переименовать", "Новое имя:", vm.Name);
        if (name == null)
            return;
        var newPath = ShellActions.Rename(vm.Path, name);
        if (newPath != null)
            _manager.NotifyRenamed(vm.Path, newPath);
        Refresh();
    }

    private void DeleteItems(IReadOnlyList<FenceItemViewModel> items)
    {
        var paths = items.Where(i => !i.IsVirtual).Select(i => i.Path).ToList();
        if (paths.Count == 0)
            return;
        ShellActions.Delete(paths, Handle);
        _manager.PruneMissing(paths);
        Refresh();
    }

    // ---------- Перетаскивание ----------

    private void StartDrag()
    {
        var selected = Selected;
        if (selected.Count == 0)
            return;

        var paths = selected.Select(s => s.Path).ToList();
        var realPaths = paths.Where(p => !PathUtil.IsVirtual(p)).ToArray();
        var data = new DataObject();
        if (realPaths.Length > 0)
            data.SetData(DataFormats.FileDrop, realPaths);
        data.SetData(InternalFormat, string.Join("\n", paths));

        _dragging = true;
        _manager.BeginInternalDrag();
        bool handledByFence;
        try
        {
            DragDrop.DoDragDrop(this, data, DragDropEffects.Copy | DragDropEffects.Move | DragDropEffects.Link);
        }
        catch (Exception ex) when (ex is System.Runtime.InteropServices.COMException or InvalidOperationException)
        {
            Log.Write($"Drag failed: {ex.Message}");
        }
        finally
        {
            handledByFence = _manager.EndInternalDrag();
            _dragging = false;
        }

        if (handledByFence)
            return;

        if (Config.Kind == FenceKind.Standard)
        {
            // Брошено на рабочий стол — элемент «возвращается» на него (убираем из ограды).
            NativeMethods.GetCursorPos(out var pt);
            var onDesktop = DesktopShell.IsDesktopSurface(NativeMethods.WindowFromPoint(pt));
            var toRemove = selected
                .Where(s => !s.IsExtra && (!PathUtil.Exists(s.Path) || (onDesktop && _manager.IsDesktopItem(s.Path))))
                .Select(s => s.Path)
                .ToList();
            _manager.RemoveItems(Config, toRemove);
        }
        _manager.PruneMissing(realPaths);
        ScheduleEndPeek();
    }

    private static List<string>? ReadInternal(IDataObject data)
    {
        if (!data.GetDataPresent(InternalFormat) || data.GetData(InternalFormat) is not string text)
            return null;
        return text.Split('\n', StringSplitOptions.RemoveEmptyEntries).ToList();
    }

    private DragDropEffects GetDropEffect(DragEventArgs e)
    {
        var isInternal = e.Data.GetDataPresent(InternalFormat);
        var hasFiles = e.Data.GetDataPresent(DataFormats.FileDrop);

        if (Config.Kind == FenceKind.Standard)
        {
            if (isInternal)
                return DragDropEffects.Move;
            if (!hasFiles)
                return DragDropEffects.None;
            // Обычная ограда хранит только ссылки — файлы никуда не копируются.
            if (e.AllowedEffects.HasFlag(DragDropEffects.Link))
                return DragDropEffects.Link;
            return e.AllowedEffects.HasFlag(DragDropEffects.Copy) ? DragDropEffects.Copy : DragDropEffects.None;
        }

        if (!hasFiles || _portalCurrent == null || !Directory.Exists(_portalCurrent))
            return DragDropEffects.None;
        if (e.Data.GetData(DataFormats.FileDrop) is string[] files && files.All(f => PathUtil.Equal(Path.GetDirectoryName(f), _portalCurrent)))
            return DragDropEffects.None;
        var wanted = e.KeyStates.HasFlag(DragDropKeyStates.ControlKey) ? DragDropEffects.Copy : DragDropEffects.Move;
        if (!isInternal && !e.AllowedEffects.HasFlag(wanted))
            wanted = DragDropEffects.Copy;
        return wanted;
    }

    private void Window_DragOver(object sender, DragEventArgs e)
    {
        BeginPeek();
        e.Effects = GetDropEffect(e);
        e.Handled = true;
        UpdateInsertMarker(e);
    }

    private void Window_Drop(object sender, DragEventArgs e)
    {
        InsertMarker.Visibility = Visibility.Collapsed;
        var effect = GetDropEffect(e);
        if (effect == DragDropEffects.None)
        {
            e.Effects = DragDropEffects.None;
            e.Handled = true;
            return;
        }

        var internalPaths = ReadInternal(e.Data);
        var files = e.Data.GetData(DataFormats.FileDrop) as string[];
        if (internalPaths != null)
            _manager.MarkInternalDropHandled();

        if (Config.Kind == FenceKind.Standard)
        {
            var paths = internalPaths ?? files?.ToList() ?? new List<string>();
            var index = Config.SortMode == ItemSortMode.Manual ? GetInsertIndex(e.GetPosition(ItemsHost)).ConfigIndex : -1;
            _manager.MoveItems(paths, Config, index);
            // Никогда не сообщаем внешнему источнику «Move», иначе Проводник удалит исходные файлы.
            e.Effects = internalPaths != null ? DragDropEffects.Move : effect;
        }
        else if (files != null && _portalCurrent != null)
        {
            var target = _portalCurrent;
            var move = effect == DragDropEffects.Move;
            // Перемещение выполняем сами; источнику отвечаем «Copy», чтобы он ничего не удалял.
            e.Effects = DragDropEffects.Copy;
            Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
            {
                ShellActions.Transfer(files, target, move, Handle);
                _manager.PruneMissing(files);
                Refresh();
            });
        }
        e.Handled = true;
    }

    /// <summary>Позиция вставки: индекс среди показанных элементов и соответствующий индекс в Config.Items.</summary>
    private (int DisplayIndex, int ConfigIndex) GetInsertIndex(Point p)
    {
        var display = _items.Count;
        for (var i = 0; i < _items.Count; i++)
        {
            if (ItemsHost.ItemContainerGenerator.ContainerFromIndex(i) is not FrameworkElement c)
                continue;
            var tl = c.TranslatePoint(new Point(0, 0), ItemsHost);
            if (p.Y < tl.Y || (p.Y <= tl.Y + c.ActualHeight && p.X < tl.X + c.ActualWidth / 2))
            {
                display = i;
                break;
            }
        }

        for (var i = display; i < _items.Count; i++)
        {
            var index = Config.Items.FindIndex(x => PathUtil.Equal(x, _items[i].Path));
            if (index >= 0)
                return (display, index);
        }
        return (display, Config.Items.Count);
    }

    private void UpdateInsertMarker(DragEventArgs e)
    {
        if (Config.Kind != FenceKind.Standard || Config.SortMode != ItemSortMode.Manual || IsRolledVisual
            || e.Effects == DragDropEffects.None || _items.Count == 0)
        {
            InsertMarker.Visibility = Visibility.Collapsed;
            return;
        }

        var (display, _) = GetInsertIndex(e.GetPosition(ItemsHost));
        var atEnd = display >= _items.Count;
        if (ItemsHost.ItemContainerGenerator.ContainerFromIndex(atEnd ? _items.Count - 1 : display) is not FrameworkElement c)
        {
            InsertMarker.Visibility = Visibility.Collapsed;
            return;
        }
        var pos = c.TranslatePoint(new Point(atEnd ? c.ActualWidth : 0, 0), ContentArea);
        InsertMarker.Margin = new Thickness(Math.Max(0, pos.X - 1), pos.Y + 4, 0, 0);
        InsertMarker.Height = Math.Max(10, c.ActualHeight - 8);
        InsertMarker.Visibility = Visibility.Visible;
    }

    // ---------- Контекстные меню ----------

    private void ShowMenu(ContextMenu menu)
    {
        _menuOpen = true;
        menu.Closed += (_, _) =>
        {
            _menuOpen = false;
            ScheduleEndPeek();
        };
        menu.PlacementTarget = this;
        menu.Placement = PlacementMode.MousePoint;
        menu.IsOpen = true;
    }

    private static MenuItem Item(string header, Action action, bool enabled = true, bool bold = false, bool? isChecked = null)
    {
        var item = new MenuItem { Header = header, IsEnabled = enabled };
        if (bold)
            item.FontWeight = FontWeights.Bold;
        if (isChecked != null)
        {
            item.IsCheckable = true;
            item.IsChecked = isChecked.Value;
        }
        item.Click += (_, _) => action();
        return item;
    }

    private ContextMenu BuildItemMenu(List<FenceItemViewModel> selected)
    {
        var menu = new ContextMenu();
        var single = selected.Count == 1 ? selected[0] : null;
        var realCount = selected.Count(s => !s.IsVirtual);

        menu.Items.Add(Item("Открыть", () => selected.ForEach(OpenItem), bold: true));
        if (single is { IsDirectory: true } && Config.Kind == FenceKind.FolderPortal)
            menu.Items.Add(Item("Открыть в Проводнике", () => ShellActions.OpenFolder(single.Path)));
        menu.Items.Add(Item("Показать в папке", () => ShellActions.Reveal(single!.Path), enabled: single is { IsVirtual: false }));
        menu.Items.Add(new Separator());
        menu.Items.Add(Item("Переименовать", () => RenameItem(single!), enabled: single is { IsVirtual: false }));
        menu.Items.Add(Item("Удалить в Корзину", () => DeleteItems(selected), enabled: realCount > 0));

        if (Config.Kind == FenceKind.Standard)
        {
            var removable = selected.Where(s => !s.IsExtra).Select(s => s.Path).ToList();
            menu.Items.Add(Item("Убрать из ограды", () => _manager.RemoveItems(Config, removable), enabled: removable.Count > 0));
        }

        var targets = _manager.Settings.Fences.Where(f => f.Kind == FenceKind.Standard && f != Config).ToList();
        if (targets.Count > 0)
        {
            var moveTo = new MenuItem { Header = "Переместить в ограду" };
            foreach (var fence in targets)
            {
                var target = fence;
                var title = string.IsNullOrWhiteSpace(fence.Title) ? "(без названия)" : fence.Title;
                moveTo.Items.Add(Item(title, () => _manager.MoveItems(selected.Select(s => s.Path).ToList(), target, -1)));
            }
            menu.Items.Add(moveTo);
        }

        menu.Items.Add(new Separator());
        menu.Items.Add(Item("Свойства", () => ShellActions.ShowProperties(single!.Path), enabled: single != null));
        return menu;
    }

    private ContextMenu BuildFenceMenu()
    {
        var menu = new ContextMenu();
        var isStandard = Config.Kind == FenceKind.Standard;

        menu.Items.Add(Item("Новая ограда", () => _manager.CreateFence(FenceKind.Standard, position: new Point(Left + 30, Top + 30))));
        menu.Items.Add(Item("Новый портал папки…", () => App.CreatePortalInteractive(_manager, new Point(Left + 30, Top + 30))));
        menu.Items.Add(new Separator());

        // Откладываем до закрытия меню, иначе оно заберёт фокус у поля ввода.
        menu.Items.Add(Item("Переименовать ограду", () => Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, BeginTitleEdit)));
        menu.Items.Add(Item(Config.RolledUp ? "Развернуть" : "Свернуть до заголовка", ToggleRollUp));

        var current = ParseColor(Config.Background);
        var colors = new MenuItem { Header = "Цвет" };
        foreach (var (name, hex) in ColorPresets)
        {
            var preset = ParseColor(hex);
            colors.Items.Add(new MenuItem
            {
                Header = name,
                IsCheckable = true,
                IsChecked = preset.R == current.R && preset.G == current.G && preset.B == current.B,
                Icon = new Border { Width = 14, Height = 14, CornerRadius = new CornerRadius(3), Background = new SolidColorBrush(Color.FromRgb(preset.R, preset.G, preset.B)), BorderBrush = Brushes.Gray, BorderThickness = new Thickness(1) },
            }.Also(m => m.Click += (_, _) => SetBackground(preset)));
        }
        colors.Items.Add(new Separator());
        colors.Items.Add(Item("Другой цвет…", () =>
        {
            using var dialog = new System.Windows.Forms.ColorDialog { FullOpen = true, Color = System.Drawing.Color.FromArgb(current.R, current.G, current.B) };
            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                SetBackground(Color.FromArgb(current.A, dialog.Color.R, dialog.Color.G, dialog.Color.B));
        }));
        menu.Items.Add(colors);

        var opacity = new MenuItem { Header = "Непрозрачность" };
        foreach (var percent in new[] { 10, 25, 40, 60, 80, 100 })
        {
            var alpha = (byte)Math.Round(percent * 255 / 100.0);
            opacity.Items.Add(Item($"{percent}%", () => SetBackground(Color.FromArgb(alpha, current.R, current.G, current.B)),
                isChecked: Math.Abs(current.A - alpha) < 13));
        }
        menu.Items.Add(opacity);

        var sort = new MenuItem { Header = "Сортировка" };
        foreach (var (name, mode) in SortModes)
        {
            if (mode == ItemSortMode.Manual && !isStandard)
                continue;
            var m = mode;
            sort.Items.Add(Item(name, () =>
            {
                Config.SortMode = m;
                _manager.ScheduleSave();
                Refresh();
            }, isChecked: Config.SortMode == mode || (!isStandard && mode == ItemSortMode.Name && Config.SortMode == ItemSortMode.Manual)));
        }
        menu.Items.Add(sort);
        menu.Items.Add(new Separator());

        if (isStandard)
        {
            menu.Items.Add(Item("Добавить файлы…", AddFilesInteractive));
            menu.Items.Add(Item("Показывать неразложенные файлы рабочего стола", () =>
            {
                Config.IsCatchAll = !Config.IsCatchAll;
                _manager.ScheduleSave();
                _manager.RefreshAll();
            }, isChecked: Config.IsCatchAll));
        }
        else
        {
            menu.Items.Add(Item("Открыть папку в Проводнике", () => ShellActions.OpenFolder(_portalCurrent ?? Config.PortalPath!),
                enabled: Config.PortalPath != null));
            menu.Items.Add(Item("Выбрать другую папку…", ChoosePortalFolder));
        }

        menu.Items.Add(new Separator());
        menu.Items.Add(Item("Закрепить все ограды", () => _manager.SetLocked(!_manager.Settings.LockFences), isChecked: _manager.Settings.LockFences));
        menu.Items.Add(Item("Настройки…", () => _manager.ShowSettings()));
        menu.Items.Add(new Separator());
        menu.Items.Add(Item("Удалить ограду", DeleteFenceInteractive));
        return menu;
    }

    private void AddFilesInteractive()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Добавить в ограду",
            Multiselect = true,
            DereferenceLinks = false,
        };
        if (dialog.ShowDialog(this) == true)
            _manager.MoveItems(dialog.FileNames, Config, -1);
    }

    private void DeleteFenceInteractive()
    {
        var name = string.IsNullOrWhiteSpace(Config.Title) ? "без названия" : Config.Title;
        var details = Config.Kind == FenceKind.Standard
            ? "Файлы не будут удалены — они останутся на своих местах (элементы рабочего стола вернутся на рабочий стол)."
            : "Папка и её содержимое останутся на диске.";
        if (MessageBox.Show($"Удалить ограду «{name}»?\n\n{details}", "Vsacoe", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
            _manager.DeleteFence(Config);
    }

    // ---------- Системное ----------

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == NativeMethods.WM_WINDOWPOSCHANGING)
            DesktopShell.KeepAtDesktopLevel(hwnd, lParam);
        return IntPtr.Zero;
    }

    /// <summary>Окно уничтожено не нами (например, вместе с окном-владельцем при падении Проводника).</summary>
    public event EventHandler? UnexpectedlyClosed;

    /// <summary>Закрывает окно по-настоящему (Alt+F4 ограду не закрывает).</summary>
    public void CloseFence()
    {
        if (_closed)
            return;
        _allowClose = true;
        Close();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (!_allowClose)
        {
            e.Cancel = true;
            return;
        }
        base.OnClosing(e);
    }

    protected override void OnClosed(EventArgs e)
    {
        _closed = true;
        _portalWatcher?.Dispose();
        _collapseTimer.Stop();
        _portalRefreshTimer.Stop();
        base.OnClosed(e);
        if (!_allowClose)
            UnexpectedlyClosed?.Invoke(this, EventArgs.Empty);
    }

    private sealed class PathUtilTupleComparer : IEqualityComparer<(string Path, bool Extra)>
    {
        public static readonly PathUtilTupleComparer Instance = new();

        public bool Equals((string Path, bool Extra) x, (string Path, bool Extra) y) =>
            x.Extra == y.Extra && PathUtil.Equal(x.Path, y.Path);

        public int GetHashCode((string Path, bool Extra) obj) =>
            HashCode.Combine(PathUtil.Comparer.GetHashCode(obj.Path), obj.Extra);
    }
}

internal static class ObjectExtensions
{
    public static T Also<T>(this T obj, Action<T> action)
    {
        action(obj);
        return obj;
    }
}
