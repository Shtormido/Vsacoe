using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace JivieOboi;

/// <summary>Небольшие помощники для интерфейса, собранного в коде (стили даёт тема Fluent Windows 11).</summary>
internal static class Ui
{
    public static Color Accent
    {
        get
        {
            var c = Win11Palette.Current().Accent;
            return Color.FromRgb(c.R, c.G, c.B);
        }
    }

    public static TextBlock Title(string text) => new()
    {
        Text = text,
        FontSize = 28,
        FontWeight = FontWeights.SemiBold,
        Margin = new Thickness(0, 0, 0, 4),
    };

    public static TextBlock Subtitle(string text) => new()
    {
        Text = text,
        Opacity = 0.7,
        TextWrapping = TextWrapping.Wrap,
        Margin = new Thickness(0, 0, 0, 16),
    };

    public static TextBlock Section(string text) => new()
    {
        Text = text,
        FontSize = 16,
        FontWeight = FontWeights.SemiBold,
        Margin = new Thickness(0, 20, 0, 8),
    };

    public static TextBlock Hint(string text) => new()
    {
        Text = text,
        Opacity = 0.65,
        FontSize = 12,
        TextWrapping = TextWrapping.Wrap,
        Margin = new Thickness(0, 2, 0, 6),
    };

    /// <summary>Карточка-группа настроек в стиле параметров Windows 11.</summary>
    public static Border Card(UIElement content)
    {
        var border = new Border
        {
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(16, 12, 16, 12),
            Margin = new Thickness(0, 0, 0, 6),
            BorderThickness = new Thickness(1),
            Child = content,
        };
        border.SetResourceReference(Border.BackgroundProperty, "CardBackgroundFillColorDefaultBrush");
        border.SetResourceReference(Border.BorderBrushProperty, "CardStrokeColorDefaultBrush");
        return border;
    }

    /// <summary>Строка «подпись слева — элемент справа».</summary>
    public static Border Row(string label, UIElement control, string? hint = null)
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 16, 0) };
        text.Children.Add(new TextBlock { Text = label, TextWrapping = TextWrapping.Wrap });
        if (hint != null) text.Children.Add(Hint(hint));
        grid.Children.Add(text);
        if (control is FrameworkElement fe) fe.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(control, 1);
        grid.Children.Add(control);
        return Card(grid);
    }

    public static CheckBox Toggle(bool value, Action<bool> changed)
    {
        var box = new CheckBox { IsChecked = value, MinWidth = 0 };
        box.Checked += (_, _) => changed(true);
        box.Unchecked += (_, _) => changed(false);
        return box;
    }

    public static Border ToggleRow(string label, bool value, Action<bool> changed, string? hint = null) =>
        Row(label, Toggle(value, changed), hint);

    public static ComboBox Combo<T>(IEnumerable<(string Label, T Value)> options, T current, Action<T> changed, double width = 260)
    {
        var list = options.ToList();
        var combo = new ComboBox { MinWidth = width };
        foreach (var (label, _) in list) combo.Items.Add(label);
        combo.SelectedIndex = Math.Max(0, list.FindIndex(o => EqualityComparer<T>.Default.Equals(o.Value, current)));
        combo.SelectionChanged += (_, _) =>
        {
            if (combo.SelectedIndex >= 0) changed(list[combo.SelectedIndex].Value);
        };
        return combo;
    }

    public static Button Button(string text, Action click, bool accent = false)
    {
        var b = new Button { Content = text, Margin = new Thickness(0, 0, 8, 8), Padding = new Thickness(14, 6, 14, 6) };
        if (accent) b.SetResourceReference(FrameworkElement.StyleProperty, "AccentButtonStyle");
        b.Click += (_, _) =>
        {
            try { click(); }
            catch (Exception ex)
            {
                Log.Error("Кнопка " + text, ex);
                MessageBox.Show(ex.Message, "Живые обои", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        };
        return b;
    }

    public static ScrollViewer Page(UIElement content) => new()
    {
        Content = new Border { Padding = new Thickness(32, 24, 32, 32), MaxWidth = 1000, HorizontalAlignment = HorizontalAlignment.Left, Child = content },
        VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
    };

    /// <summary>Простое окно ввода строки.</summary>
    public static string? Prompt(Window owner, string title, string label, string initial = "")
    {
        var box = new TextBox { Text = initial, MinWidth = 420, Margin = new Thickness(0, 8, 0, 16) };
        var ok = new Button { Content = "ОК", IsDefault = true, MinWidth = 90, Margin = new Thickness(0, 0, 8, 0) };
        ok.SetResourceReference(FrameworkElement.StyleProperty, "AccentButtonStyle");
        var cancel = new Button { Content = "Отмена", IsCancel = true, MinWidth = 90 };
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(ok);
        buttons.Children.Add(cancel);
        var panel = new StackPanel { Margin = new Thickness(24) };
        panel.Children.Add(new TextBlock { Text = label, TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(box);
        panel.Children.Add(buttons);
        var dialog = new Window
        {
            Title = title,
            Owner = owner,
            Content = panel,
            SizeToContent = SizeToContent.WidthAndHeight,
            ResizeMode = ResizeMode.NoResize,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            ShowInTaskbar = false,
            ThemeMode = ThemeMode.System,
        };
        ok.Click += (_, _) => dialog.DialogResult = true;
        dialog.Loaded += (_, _) => { box.Focus(); box.SelectAll(); Keyboard.Focus(box); };
        return dialog.ShowDialog() == true ? box.Text.Trim() : null;
    }
}
