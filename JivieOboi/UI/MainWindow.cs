using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using WF = System.Windows.Forms;

namespace JivieOboi;

/// <summary>Главное окно в стиле Windows 11: библиотека, плейлист, экран блокировки, настройки.</summary>
internal sealed partial class MainWindow : Window
{
    const double CardWidth = 232, ThumbHeight = 130;

    readonly TrayApp app;
    readonly ListBox nav = new();
    readonly ContentControl host = new();
    // Страница библиотеки собирается заново при каждом открытии вкладки, поэтому эти элементы
    // тоже создаются заново: элемент WPF не может принадлежать двум родителям сразу.
    WrapPanel cards = new();
    StackPanel details = new();
    TextBox search = new();
    readonly Button pauseButton = new() { HorizontalAlignment = HorizontalAlignment.Stretch, Padding = new Thickness(12, 8, 12, 8) };
    readonly TextBlock status = new() { Opacity = 0.7, FontSize = 12, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(4, 0, 4, 8) };
    readonly DispatcherTimer saveDebounce = new() { Interval = TimeSpan.FromMilliseconds(700) };
    readonly HashSet<WallpaperItem> dirtyScenes = new();
    string targetKey;
    string typeFilter = "";
    WallpaperItem? selected;

    Settings S => app.Settings;
    LibraryStore Lib => app.Library;

    public MainWindow(TrayApp app)
    {
        this.app = app;
        Title = "Живые обои";
        Width = 1280;
        Height = 820;
        MinWidth = 960;
        MinHeight = 600;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ThemeMode = ThemeMode.System; // тема Fluent Windows 11 (светлая/тёмная — как в системе)
        if (app.IconHandle != IntPtr.Zero)
            Icon = Imaging.CreateBitmapSourceFromHIcon(app.IconHandle, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());

        targetKey = S.Mode == "span" ? WallpaperSlot.SpanKey : "same";
        Content = BuildShell();

        AllowDrop = true;
        DragOver += (_, e) =>
        {
            e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None;
            e.Handled = true;
        };
        Drop += OnDrop;

        saveDebounce.Tick += (_, _) => FlushSave();
        Lib.Changed += OnLibraryChanged;
        app.Wallpapers.Changed += OnWallpapersChanged;
        app.StateChanged += UpdateStatus;
        Closed += (_, _) =>
        {
            FlushSave();
            Lib.Changed -= OnLibraryChanged;
            app.Wallpapers.Changed -= OnWallpapersChanged;
            app.StateChanged -= UpdateStatus;
        };

        nav.SelectedIndex = 0;
        UpdateStatus();
    }

    void OnLibraryChanged() => Dispatcher.BeginInvoke(() =>
    {
        if (nav.SelectedIndex == 0) RefreshCards();
    });

    void OnWallpapersChanged() => Dispatcher.BeginInvoke(() =>
    {
        if (nav.SelectedIndex == 0) RefreshCards();
        UpdateStatus();
    });

    // ───────────────────────── каркас ─────────────────────────

    UIElement BuildShell()
    {
        var root = new Grid();
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(250) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var side = new DockPanel { Margin = new Thickness(12, 16, 8, 16) };
        var brand = new StackPanel { Margin = new Thickness(8, 0, 0, 20) };
        brand.Children.Add(new TextBlock { Text = "Живые обои", FontSize = 20, FontWeight = FontWeights.SemiBold });
        brand.Children.Add(new TextBlock { Text = "версия 2.0", Opacity = 0.6, FontSize = 12 });
        DockPanel.SetDock(brand, Dock.Top);
        side.Children.Add(brand);

        var bottom = new StackPanel();
        bottom.Children.Add(status);
        bottom.Children.Add(pauseButton);
        pauseButton.Click += (_, _) => app.TogglePause();
        DockPanel.SetDock(bottom, Dock.Bottom);
        side.Children.Add(bottom);

        nav.BorderThickness = new Thickness(0);
        nav.Background = Brushes.Transparent;
        foreach (var (glyph, text) in new[] { ("", "Библиотека"), ("", "Плейлист"), ("", "Экран блокировки"), ("", "Настройки") })
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(4, 6, 4, 6) };
            row.Children.Add(new TextBlock
            {
                Text = glyph,
                FontFamily = new FontFamily("Segoe Fluent Icons, Segoe MDL2 Assets"),
                FontSize = 16,
                Margin = new Thickness(0, 0, 12, 0),
                VerticalAlignment = VerticalAlignment.Center,
            });
            row.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center });
            nav.Items.Add(new ListBoxItem { Content = row });
        }
        nav.SelectionChanged += (_, _) => ShowPage(nav.SelectedIndex);
        side.Children.Add(nav);

        root.Children.Add(side);
        Grid.SetColumn(host, 1);
        root.Children.Add(host);
        return root;
    }

    void ShowPage(int index)
    {
        FlushSave();
        try
        {
            host.Content = index switch
            {
                1 => PlaylistPage(),
                2 => LockPage(),
                3 => SettingsPage(),
                _ => LibraryPage(),
            };
        }
        catch (Exception ex)
        {
            // Ошибка не должна молча оставлять пустую или старую вкладку.
            Log.Error("Вкладка " + index, ex);
            host.Content = Ui.Page(new TextBlock
            {
                Text = "Не удалось открыть вкладку: " + ex.Message + "\n\nПодробности — в error.log (Настройки → Открыть папку настроек).",
                TextWrapping = TextWrapping.Wrap,
            });
        }
    }

    void UpdateStatus()
    {
        pauseButton.Content = S.Paused ? "▶  Продолжить" : "❚❚  Пауза";
        var walls = app.Wallpapers.Walls;
        string now = walls.Count switch
        {
            0 => "Обои не запущены",
            1 => "Сейчас: " + walls[0].View.Item.Title,
            _ => $"Мониторов с обоями: {walls.Count}",
        };
        status.Text = S.Paused ? "На паузе" : app.IsAutoPaused ? now + " · авто-пауза (игра или окно на весь экран)" : now;
    }

    // ───────────────────────── библиотека ─────────────────────────

    UIElement LibraryPage()
    {
        var query = search.Text;
        cards = new WrapPanel { Margin = new Thickness(0, 4, 0, 24) };
        details = new StackPanel();
        search = new TextBox { Width = 220, Margin = new Thickness(0, 0, 8, 8), Text = query };

        var grid = new Grid { Margin = new Thickness(24, 16, 16, 0) };
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(370) });

        var head = new StackPanel();
        head.Children.Add(Ui.Title("Библиотека"));
        head.Children.Add(Ui.Subtitle("Щёлкните обои, чтобы открыть их настройки, двойной щелчок — поставить. " +
                                      "Видео, GIF, картинки и папки с веб-обоями можно просто перетащить в это окно."));
        Grid.SetColumnSpan(head, 2);
        grid.Children.Add(head);

        var toolbar = new WrapPanel { Margin = new Thickness(0, 0, 0, 4) };
        toolbar.Children.Add(new TextBlock { Text = "Куда ставить:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 8) });
        var targets = TargetOptions().ToList();
        if (targets.All(t => t.Value != targetKey)) targetKey = targets[0].Value;
        var target = Ui.Combo(targets, targetKey, v => targetKey = v, 250);
        target.Margin = new Thickness(0, 0, 16, 8);
        toolbar.Children.Add(target);
        toolbar.Children.Add(Ui.Button("+ Файл…", AddFiles, accent: true));
        toolbar.Children.Add(Ui.Button("+ Веб-обои (папка)…", AddWebFolder));
        toolbar.Children.Add(Ui.Button("+ Сайт…", AddUrl));
        toolbar.Children.Add(Ui.Button("Импорт из Wallpaper Engine", ImportWallpaperEngine));
        Grid.SetRow(toolbar, 1);
        Grid.SetColumnSpan(toolbar, 2);
        grid.Children.Add(toolbar);

        var left = new DockPanel();
        var filters = new WrapPanel();
        search.TextChanged += (_, _) => RefreshCards();
        filters.Children.Add(new TextBlock { Text = "Поиск:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 8) });
        filters.Children.Add(search);
        var filter = Ui.Combo(new[]
        {
            ("Все типы", ""), ("Анимации", WallpaperType.Scene), ("Видео", WallpaperType.Video), ("Веб и сайты", WallpaperType.Web),
            ("GIF", WallpaperType.Gif), ("Картинки", WallpaperType.Image), ("Из Wallpaper Engine", "we"),
        }, typeFilter, v => { typeFilter = v; RefreshCards(); }, 180);
        filter.Margin = new Thickness(0, 0, 8, 8);
        filters.Children.Add(filter);
        DockPanel.SetDock(filters, Dock.Top);
        left.Children.Add(filters);
        left.Children.Add(new ScrollViewer
        {
            Content = cards,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
        });
        Grid.SetRow(left, 2);
        grid.Children.Add(left);

        var right = new ScrollViewer
        {
            Content = new Border { Padding = new Thickness(16, 0, 8, 24), Child = details },
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        };
        Grid.SetRow(right, 2);
        Grid.SetColumn(right, 1);
        grid.Children.Add(right);

        RefreshCards();
        ShowDetails(selected ?? Lib.Resolve(S.CurrentId));
        return grid;
    }

    IEnumerable<(string Label, string Value)> TargetOptions()
    {
        yield return ("На все мониторы", "same");
        var monitors = WallpaperSlot.Monitors();
        if (monitors.Count < 2) yield break;
        yield return ("Растянуть на все мониторы", WallpaperSlot.SpanKey);
        foreach (var m in monitors) yield return (m.Title, m.Key);
    }

    IEnumerable<WallpaperItem> FilteredItems()
    {
        var q = search.Text.Trim();
        return Lib.Items.Where(i =>
            (typeFilter == "" || (typeFilter == "we" ? i.Origin == "wallpaperengine"
                : typeFilter == WallpaperType.Web ? i.Type is WallpaperType.Web or WallpaperType.Url
                : i.Type == typeFilter)) &&
            (q.Length == 0 || i.Title.Contains(q, StringComparison.CurrentCultureIgnoreCase)));
    }

    void RefreshCards()
    {
        var active = app.Wallpapers.Walls.Select(w => w.View.Item.Id).ToHashSet();
        cards.Children.Clear();
        foreach (var item in FilteredItems()) cards.Children.Add(Card(item, active.Contains(item.Id)));
        if (cards.Children.Count == 0)
            cards.Children.Add(Ui.Hint("Ничего не найдено."));
    }

    UIElement Card(WallpaperItem item, bool active)
    {
        var accent = Ui.Accent;
        var image = new Image { Stretch = Stretch.UniformToFill, Width = CardWidth, Height = ThumbHeight };
        var thumb = new Grid
        {
            Width = CardWidth,
            Height = ThumbHeight,
            Background = Placeholder(item),
            Clip = new RectangleGeometry(new Rect(0, 0, CardWidth, ThumbHeight), 7, 7),
        };
        thumb.Children.Add(new TextBlock
        {
            Text = TypeGlyph(item.Type),
            FontFamily = new FontFamily("Segoe Fluent Icons, Segoe MDL2 Assets"),
            FontSize = 32,
            Foreground = new SolidColorBrush(Color.FromArgb(160, 255, 255, 255)),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        });
        thumb.Children.Add(image);
        _ = LoadThumbAsync(image, item);

        if (active)
        {
            thumb.Children.Add(new Border
            {
                Background = new SolidColorBrush(accent),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(6, 2, 6, 2),
                Margin = new Thickness(8),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Child = new TextBlock { Text = "На экране", Foreground = Brushes.White, FontSize = 11 },
            });
        }

        var title = new TextBlock { Text = item.Title, TextTrimming = TextTrimming.CharacterEllipsis, FontWeight = FontWeights.SemiBold, ToolTip = item.Title };
        var kind = new TextBlock
        {
            Text = WallpaperType.Title(item.Type) + (item.Origin == "wallpaperengine" ? " · Wallpaper Engine" : "") + (S.Playlist.Contains(item.Id) ? " · в плейлисте" : ""),
            Opacity = 0.65,
            FontSize = 12,
            TextTrimming = TextTrimming.CharacterEllipsis,
        };
        var text = new StackPanel { Margin = new Thickness(10, 8, 10, 10) };
        text.Children.Add(title);
        text.Children.Add(kind);

        var body = new StackPanel();
        body.Children.Add(thumb);
        body.Children.Add(text);

        bool isSelected = selected?.Id == item.Id;
        var card = new Border
        {
            Width = CardWidth + 4,
            Margin = new Thickness(0, 0, 12, 12),
            CornerRadius = new CornerRadius(9),
            BorderThickness = new Thickness(2),
            BorderBrush = isSelected ? new SolidColorBrush(accent) : Brushes.Transparent,
            Child = body,
            Cursor = Cursors.Hand,
        };
        card.SetResourceReference(Border.BackgroundProperty, "CardBackgroundFillColorDefaultBrush");
        card.MouseLeftButtonDown += (_, e) =>
        {
            if (e.ClickCount >= 2) Apply(item, targetKey);
            else
            {
                selected = item;
                ShowDetails(item);
                RefreshCards();
            }
        };
        card.ContextMenu = CardMenu(item);
        return card;
    }

    ContextMenu CardMenu(WallpaperItem item)
    {
        var menu = new ContextMenu();
        foreach (var (label, key) in TargetOptions())
            menu.Items.Add(MenuItem("Поставить: " + label.ToLower(CultureInfo.CurrentCulture), () => Apply(item, key)));
        menu.Items.Add(new Separator());
        menu.Items.Add(MenuItem(S.Playlist.Contains(item.Id) ? "Убрать из плейлиста" : "Добавить в плейлист", () => TogglePlaylist(item)));
        menu.Items.Add(MenuItem(S.LockWallpaperId == item.Id ? "Убрать с экрана блокировки" : "Поставить на экран блокировки", () => ToggleLock(item)));
        if (!item.IsBuiltIn)
        {
            menu.Items.Add(new Separator());
            menu.Items.Add(MenuItem("Удалить из библиотеки", () => Delete(item)));
        }
        return menu;
    }

    static MenuItem MenuItem(string header, Action click)
    {
        var mi = new MenuItem { Header = header };
        mi.Click += (_, _) => click();
        return mi;
    }

    static async Task LoadThumbAsync(Image image, WallpaperItem item)
    {
        var source = await Thumbnails.GetAsync(item);
        if (source != null) image.Source = source;
    }

    static Brush Placeholder(WallpaperItem item)
    {
        double hue = (uint)item.Id.GetHashCode() % 360;
        Color a = Hsv(hue, 0.55, 0.45), b = Hsv(hue + 50, 0.6, 0.25);
        var brush = new LinearGradientBrush(a, b, 45);
        brush.Freeze();
        return brush;
    }

    static Color Hsv(double h, double s, double v)
    {
        h = (h % 360 + 360) % 360;
        double c = v * s, x = c * (1 - Math.Abs(h / 60 % 2 - 1)), m = v - c;
        var (r, g, b) = (int)(h / 60) switch { 0 => (c, x, 0.0), 1 => (x, c, 0.0), 2 => (0.0, c, x), 3 => (0.0, x, c), 4 => (x, 0.0, c), _ => (c, 0.0, x) };
        return Color.FromRgb((byte)((r + m) * 255), (byte)((g + m) * 255), (byte)((b + m) * 255));
    }

    static string TypeGlyph(string type) => type switch
    {
        WallpaperType.Video => "",
        WallpaperType.Web or WallpaperType.Url => "",
        WallpaperType.Scene => "",
        WallpaperType.Gif => "",
        _ => "",
    };

    // ── панель справа ──

    void ShowDetails(WallpaperItem item)
    {
        selected = item;
        details.Children.Clear();

        var preview = new Image { Stretch = Stretch.UniformToFill, Height = 190 };
        var previewHost = new Grid
        {
            Height = 190,
            Background = Placeholder(item),
            Clip = new RectangleGeometry(new Rect(0, 0, 340, 190), 8, 8),
            Width = 340,
            HorizontalAlignment = HorizontalAlignment.Left,
        };
        previewHost.Children.Add(preview);
        _ = LoadThumbAsync(preview, item);
        details.Children.Add(previewHost);

        if (item.IsBuiltIn)
        {
            details.Children.Add(new TextBlock { Text = item.Title, FontSize = 20, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 12, 0, 0), TextWrapping = TextWrapping.Wrap });
        }
        else
        {
            var name = new TextBox { Text = item.Title, FontSize = 16, Margin = new Thickness(0, 12, 0, 0) };
            name.LostFocus += (_, _) =>
            {
                var t = name.Text.Trim();
                if (t.Length == 0 || t == item.Title) return;
                item.Title = t;
                Lib.NotifyChanged();
            };
            details.Children.Add(name);
        }

        string origin = item.Origin switch
        {
            "builtin" => "встроенная анимация",
            "wallpaperengine" => "из Wallpaper Engine" + (item.WorkshopId != null ? $" (#{item.WorkshopId})" : ""),
            _ => "добавлено вами",
        };
        details.Children.Add(Ui.Hint($"{WallpaperType.Title(item.Type)} · {origin}"));
        if (item.Path != null)
            details.Children.Add(new TextBox
            {
                Text = item.Path,
                IsReadOnly = true,
                FontSize = 11,
                TextWrapping = TextWrapping.Wrap,
                Opacity = 0.75,
                Margin = new Thickness(0, 0, 0, 8),
            });

        var buttons = new WrapPanel { Margin = new Thickness(0, 8, 0, 0) };
        buttons.Children.Add(Ui.Button("Поставить", () => Apply(item, targetKey), accent: true));
        buttons.Children.Add(Ui.Button(S.Playlist.Contains(item.Id) ? "Из плейлиста" : "В плейлист", () => TogglePlaylist(item)));
        buttons.Children.Add(Ui.Button(S.LockWallpaperId == item.Id ? "Убрать с блокировки" : "На экран блокировки", () => ToggleLock(item)));
        if (item.Path != null && File.Exists(item.Path))
            buttons.Children.Add(Ui.Button("Открыть папку", () =>
                System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{item.Path}\"")));
        if (!item.IsBuiltIn) buttons.Children.Add(Ui.Button("Удалить", () => Delete(item)));
        details.Children.Add(buttons);

        if (item.Properties.Count > 0)
        {
            details.Children.Add(Ui.Section("Настройки обоев"));
            foreach (var p in item.Properties) details.Children.Add(PropertyControl(item, p));
            details.Children.Add(Ui.Button("Сбросить настройки", () =>
            {
                item.Values.Clear();
                PropertyChanged(item);
                ShowDetails(item);
            }));
        }
        else if (item.Type is WallpaperType.Web or WallpaperType.Url)
        {
            details.Children.Add(Ui.Hint("У этих обоев нет настраиваемых параметров."));
        }
    }

    UIElement PropertyControl(WallpaperItem item, PropertyDef p)
    {
        var panel = new StackPanel { Margin = new Thickness(0, 4, 0, 8) };
        switch (p.Type)
        {
            case "slider":
            {
                panel.Children.Add(new TextBlock { Text = p.Text, TextWrapping = TextWrapping.Wrap });
                var row = new DockPanel();
                var value = new TextBlock { Width = 56, TextAlignment = TextAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
                DockPanel.SetDock(value, Dock.Right);
                var slider = new Slider
                {
                    Minimum = p.Min,
                    Maximum = p.Max,
                    Value = item.Number(p.Key, p.Min),
                    SmallChange = p.Step,
                    LargeChange = p.Step * 10,
                    TickFrequency = p.Step,
                    IsSnapToTickEnabled = p.Step > 0,
                };
                int decimals = p.Step >= 1 ? 0 : Math.Min(4, (int)Math.Ceiling(-Math.Log10(p.Step)));
                string Format(double v) => Math.Round(v, decimals).ToString(CultureInfo.InvariantCulture);
                value.Text = Format(slider.Value);
                slider.ValueChanged += (_, e) =>
                {
                    value.Text = Format(e.NewValue);
                    item.Values[p.Key] = Format(e.NewValue);
                    PropertyChanged(item);
                };
                row.Children.Add(value);
                row.Children.Add(slider);
                panel.Children.Add(row);
                break;
            }
            case "bool":
            {
                var box = new CheckBox { Content = p.Text, IsChecked = item.Flag(p.Key, false) };
                box.Checked += (_, _) => { item.Values[p.Key] = "true"; PropertyChanged(item); };
                box.Unchecked += (_, _) => { item.Values[p.Key] = "false"; PropertyChanged(item); };
                panel.Children.Add(box);
                break;
            }
            case "color":
            {
                var swatch = new Border { Width = 44, Height = 22, CornerRadius = new CornerRadius(4), Background = new SolidColorBrush(ParseColor(item.Value(p.Key))) };
                var button = new Button { Content = swatch, Padding = new Thickness(6, 4, 6, 4), HorizontalAlignment = HorizontalAlignment.Left };
                button.Click += (_, _) =>
                {
                    var c = ParseColor(item.Value(p.Key));
                    using var dialog = new WF.ColorDialog { FullOpen = true, Color = System.Drawing.Color.FromArgb(c.R, c.G, c.B) };
                    if (dialog.ShowDialog() != WF.DialogResult.OK) return;
                    var picked = Color.FromRgb(dialog.Color.R, dialog.Color.G, dialog.Color.B);
                    swatch.Background = new SolidColorBrush(picked);
                    item.Values[p.Key] = string.Create(CultureInfo.InvariantCulture,
                        $"{picked.R / 255.0:0.####} {picked.G / 255.0:0.####} {picked.B / 255.0:0.####}");
                    PropertyChanged(item);
                };
                var row = new StackPanel { Orientation = Orientation.Horizontal };
                row.Children.Add(button);
                row.Children.Add(new TextBlock { Text = p.Text, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(10, 0, 0, 0), TextWrapping = TextWrapping.Wrap });
                panel.Children.Add(row);
                break;
            }
            case "combo":
            {
                panel.Children.Add(new TextBlock { Text = p.Text, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 4) });
                var combo = Ui.Combo(p.Options.Select(o => (o.Label, o.Value)), item.Value(p.Key), v =>
                {
                    item.Values[p.Key] = v;
                    PropertyChanged(item);
                }, 240);
                combo.HorizontalAlignment = HorizontalAlignment.Left;
                panel.Children.Add(combo);
                break;
            }
            case "textinput":
            {
                panel.Children.Add(new TextBlock { Text = p.Text, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 4) });
                var box = new TextBox { Text = item.Value(p.Key) };
                void Commit()
                {
                    if (box.Text == item.Value(p.Key)) return;
                    item.Values[p.Key] = box.Text;
                    PropertyChanged(item);
                }
                box.LostFocus += (_, _) => Commit();
                box.KeyDown += (_, e) => { if (e.Key == Key.Enter) Commit(); };
                panel.Children.Add(box);
                break;
            }
            default:
                panel.Children.Add(new TextBlock { Text = p.Text, TextWrapping = TextWrapping.Wrap, Opacity = 0.8 });
                break;
        }
        return panel;
    }

    static Color ParseColor(string value)
    {
        var parts = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 3
            && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var r)
            && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var g)
            && double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var b))
        {
            byte C(double x) => (byte)Math.Clamp(x <= 1 ? x * 255 : x, 0, 255);
            return Color.FromRgb(C(r), C(g), C(b));
        }
        return Colors.White;
    }

    /// <summary>Свойство изменено: сразу показываем на обоях, сохраняем с небольшой задержкой.</summary>
    void PropertyChanged(WallpaperItem item)
    {
        app.Wallpapers.ApplyProperties(item);
        if (item.Type == WallpaperType.Scene) dirtyScenes.Add(item);
        saveDebounce.Stop();
        saveDebounce.Start();
    }

    void FlushSave()
    {
        if (!saveDebounce.IsEnabled) return;
        saveDebounce.Stop();
        Lib.Save();
        // Превью анимаций зависят от оттенка — перерисуем.
        foreach (var scene in dirtyScenes)
        {
            try { File.Delete(Thumbnails.CachePath(scene)); } catch { /* нет файла */ }
            Thumbnails.Invalidate(scene);
        }
        if (dirtyScenes.Count > 0 && nav.SelectedIndex == 0) RefreshCards();
        dirtyScenes.Clear();
    }

    // ── действия ──

    void Apply(WallpaperItem item, string key)
    {
        FlushSave();
        app.Wallpapers.Apply(item, key);
        selected = item;
        RefreshCards();
        UpdateStatus();
    }

    void TogglePlaylist(WallpaperItem item)
    {
        if (!S.Playlist.Remove(item.Id)) S.Playlist.Add(item.Id);
        S.Save();
        app.Wallpapers.ApplyPlaylistTimer();
        RefreshCards();
        ShowDetails(item);
    }

    void ToggleLock(WallpaperItem item)
    {
        S.LockWallpaperId = S.LockWallpaperId == item.Id ? null : item.Id;
        S.Save();
        ShowDetails(item);
    }

    void Delete(WallpaperItem item)
    {
        if (MessageBox.Show(this, $"Удалить «{item.Title}» из библиотеки? Сам файл на диске останется.", "Живые обои",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        Lib.Remove(item);
        S.Playlist.Remove(item.Id);
        if (S.LockWallpaperId == item.Id) S.LockWallpaperId = null;
        foreach (var k in S.Assignments.Where(a => a.Value == item.Id).Select(a => a.Key).ToList())
            S.Assignments[k] = "builtin:aurora";
        if (S.CurrentId == item.Id) S.CurrentId = "builtin:aurora";
        S.Save();
        selected = null;
        app.Wallpapers.Build();
        ShowDetails(Lib.Resolve(S.CurrentId));
    }

    void Added(WallpaperItem? item, string what)
    {
        if (item == null)
        {
            MessageBox.Show(this, $"Не получилось добавить {what}.", "Живые обои", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        selected = item;
        RefreshCards();
        ShowDetails(item);
    }

    void AddFiles()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Добавить обои",
            Multiselect = true,
            Filter = "Видео, GIF, картинки, HTML|*.mp4;*.m4v;*.mov;*.wmv;*.avi;*.mkv;*.webm;*.mpg;*.mpeg;*.3gp;*.ts;*.gif;*.jpg;*.jpeg;*.png;*.bmp;*.tif;*.tiff;*.webp;*.html;*.htm" +
                     "|Все файлы|*.*",
        };
        if (dialog.ShowDialog(this) != true) return;
        WallpaperItem? last = null;
        foreach (var f in dialog.FileNames) last = Lib.AddFile(f) ?? last;
        Added(last, "файл (неподдерживаемый формат)");
    }

    void AddWebFolder()
    {
        var dialog = new Microsoft.Win32.OpenFolderDialog { Title = "Папка с веб-обоями (index.html или project.json)" };
        if (dialog.ShowDialog(this) != true) return;
        Added(Lib.AddWebFolder(dialog.FolderName), "папку: в ней нет index.html или project.json с типом «web»/«video»");
    }

    void AddUrl()
    {
        var url = Ui.Prompt(this, "Сайт как обои", "Адрес страницы (например, https://www.shadertoy.com/embed/XsXXDn):", "https://");
        if (url == null) return;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || (u.Scheme != "https" && u.Scheme != "http"))
        {
            MessageBox.Show(this, "Это не похоже на адрес сайта.", "Живые обои", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        Added(Lib.AddUrl(url), "сайт");
    }

    async void ImportWallpaperEngine()
    {
        Mouse.OverrideCursor = Cursors.Wait;
        WallpaperEngineImport.Result result;
        try
        {
            var scan = await Task.Run(WallpaperEngineImport.Scan);
            result = WallpaperEngineImport.Merge(Lib, scan);
        }
        finally
        {
            Mouse.OverrideCursor = null;
        }

        string message = result.Folders == 0
            ? "Не нашёл обоев Wallpaper Engine. Программа ищет их в папках Steam (steamapps\\workshop\\content\\431960). " +
              "Если Steam стоит в необычном месте, добавьте папку обоев кнопкой «+ Веб-обои (папка)»."
            : $"Найдено обоев Wallpaper Engine: {result.Folders}.\n\n" +
              $"Добавлено: {result.Added}\nУже были в библиотеке: {result.Skipped}\n" +
              $"Не поддерживаются: {result.Unsupported} — это обои типа «сцена» и «приложение», " +
              "они работают только внутри самого Wallpaper Engine. Видео и веб-обои переносятся полностью, вместе с настройками.";
        MessageBox.Show(this, message, "Импорт из Wallpaper Engine", MessageBoxButton.OK, MessageBoxImage.Information);
        typeFilter = result.Added > 0 ? "we" : typeFilter;
        if (nav.SelectedIndex == 0) ShowPage(0);
    }

    void OnDrop(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(DataFormats.FileDrop) is not string[] paths) return;
        WallpaperItem? last = null;
        int failed = 0;
        foreach (var path in paths)
        {
            var item = Directory.Exists(path) ? Lib.AddWebFolder(path) : Lib.AddFile(path);
            if (item == null) failed++;
            else last = item;
        }
        if (nav.SelectedIndex != 0) nav.SelectedIndex = 0;
        if (last != null) Added(last, "");
        if (failed > 0)
            MessageBox.Show(this, $"Не удалось добавить: {failed}. Поддерживаются видео, GIF, картинки, HTML и папки с веб-обоями.",
                "Живые обои", MessageBoxButton.OK, MessageBoxImage.Information);
    }
}
