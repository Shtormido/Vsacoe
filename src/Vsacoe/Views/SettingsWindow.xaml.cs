using System.Collections.ObjectModel;
using System.IO;
using System.Reflection;
using System.Windows;
using Vsacoe.Core;
using Vsacoe.Services;
using Vsacoe.Shell;

namespace Vsacoe.Views;

internal partial class SettingsWindow : Window
{
    public sealed record KindOption(RuleKind Kind, string Name);
    public sealed record FenceOption(Guid Id, string Title);
    public sealed record SnapshotRow(SnapshotFile File, string Text);

    public sealed class RuleRow
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public bool Enabled { get; set; } = true;
        public RuleKind Kind { get; set; } = RuleKind.Extension;
        public string Pattern { get; set; } = "";
        public Guid TargetFenceId { get; set; }
    }

    private readonly FenceManager _manager;
    private readonly ObservableCollection<RuleRow> _rules = new();

    public SettingsWindow(FenceManager manager)
    {
        InitializeComponent();
        _manager = manager;
        DataContext = this;

        KindOptions = new[]
        {
            new KindOption(RuleKind.Extension, "Расширение"),
            new KindOption(RuleKind.NamePattern, "Имя (маска)"),
            new KindOption(RuleKind.Category, "Категория"),
        };
        FenceOptions = manager.Settings.Fences
            .Where(f => f.Kind == FenceKind.Standard)
            .Select(f => new FenceOption(f.Id, string.IsNullOrWhiteSpace(f.Title) ? "(без названия)" : f.Title))
            .ToList();

        LoadValues();
        RulesGrid.ItemsSource = _rules;
        ReloadSnapshots();
        VersionText.Text = "Версия " + (Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0");
    }

    public IReadOnlyList<KindOption> KindOptions { get; }
    public IReadOnlyList<FenceOption> FenceOptions { get; }

    public void SelectTab(int index)
    {
        if (index >= 0 && index < Tabs.Items.Count)
            Tabs.SelectedIndex = index;
    }

    private void LoadValues()
    {
        var s = _manager.Settings;
        try
        {
            StartWithWindows.IsChecked = Autostart.IsEnabled;
        }
        catch (Exception ex)
        {
            Log.Write($"Autostart read failed: {ex.Message}");
        }
        HideDesktopIcons.IsChecked = s.HideDesktopIcons;
        QuickHide.IsChecked = s.QuickHideEnabled;
        AutoApplyRules.IsChecked = s.AutoApplyRules;
        ExpandOnHover.IsChecked = s.ExpandRolledOnHover;
        LockFences.IsChecked = s.LockFences;
        SnapToGrid.IsChecked = s.SnapToGrid;
        GridSize.Value = s.GridSize;
        IconSize.Value = s.IconSize;

        _rules.Clear();
        foreach (var r in s.Rules)
            _rules.Add(new RuleRow { Id = r.Id, Enabled = r.Enabled, Kind = r.Kind, Pattern = r.Pattern, TargetFenceId = r.TargetFenceId });
    }

    private void SaveRules()
    {
        RulesGrid.CommitEdit();
        _manager.Settings.Rules = _rules
            .Where(r => r.TargetFenceId != Guid.Empty)
            .Select(r => new SortRule { Id = r.Id, Enabled = r.Enabled, Kind = r.Kind, Pattern = r.Pattern.Trim(), TargetFenceId = r.TargetFenceId })
            .ToList();
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        var s = _manager.Settings;
        s.QuickHideEnabled = QuickHide.IsChecked == true;
        s.AutoApplyRules = AutoApplyRules.IsChecked == true;
        s.ExpandRolledOnHover = ExpandOnHover.IsChecked == true;
        s.LockFences = LockFences.IsChecked == true;
        s.SnapToGrid = SnapToGrid.IsChecked == true;
        s.GridSize = (int)GridSize.Value;
        s.IconSize = (int)IconSize.Value;
        SaveRules();

        try
        {
            Autostart.IsEnabled = StartWithWindows.IsChecked == true;
        }
        catch (Exception ex)
        {
            ShellActions.ShowError($"Не удалось изменить автозагрузку:\n{ex.Message}");
        }

        var hide = HideDesktopIcons.IsChecked == true;
        if (hide != s.HideDesktopIcons)
            _manager.SetHideDesktopIcons(hide);
        _manager.ApplySettings();
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => Close();

    // ---------- Правила ----------

    private void AddRule_Click(object sender, RoutedEventArgs e)
    {
        if (FenceOptions.Count == 0)
        {
            ShellActions.ShowError("Сначала создайте хотя бы одну обычную ограду.");
            return;
        }
        var row = new RuleRow { TargetFenceId = FenceOptions[0].Id };
        _rules.Add(row);
        RulesGrid.SelectedItem = row;
        RulesGrid.ScrollIntoView(row);
    }

    private void RemoveRule_Click(object sender, RoutedEventArgs e)
    {
        if (RulesGrid.SelectedItem is RuleRow row)
            _rules.Remove(row);
    }

    private void MoveUp_Click(object sender, RoutedEventArgs e) => MoveSelected(-1);

    private void MoveDown_Click(object sender, RoutedEventArgs e) => MoveSelected(1);

    private void MoveSelected(int delta)
    {
        if (RulesGrid.SelectedItem is not RuleRow row)
            return;
        var index = _rules.IndexOf(row);
        var target = index + delta;
        if (target < 0 || target >= _rules.Count)
            return;
        _rules.Move(index, target);
        RulesGrid.SelectedItem = row;
    }

    private void ApplyRules_Click(object sender, RoutedEventArgs e)
    {
        SaveRules();
        _manager.ScheduleSave();
        var moved = _manager.ApplyRulesNow();
        MessageBox.Show(this, moved == 0 ? "Подходящих неразложенных элементов не найдено." : $"Разложено элементов: {moved}.",
            "Vsacoe", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    // ---------- Снимки ----------

    private void ReloadSnapshots()
    {
        SnapshotsList.ItemsSource = _manager.Store.ListSnapshots()
            .Select(f => new SnapshotRow(f, $"{f.Snapshot.Name}   —   {f.Snapshot.CreatedUtc.ToLocalTime():g}, оград: {f.Snapshot.Fences.Count}"))
            .ToList();
    }

    private void SaveSnapshot_Click(object sender, RoutedEventArgs e)
    {
        var name = InputDialog.Show(this, "Снимок макета", "Название снимка:", $"Макет {DateTime.Now:g}");
        if (name == null)
            return;
        _manager.SaveSnapshot(name);
        ReloadSnapshots();
    }

    private void RestoreSnapshot_Click(object sender, RoutedEventArgs e)
    {
        if (SnapshotsList.SelectedItem is not SnapshotRow row)
            return;
        if (MessageBox.Show(this, $"Восстановить «{row.File.Snapshot.Name}»? Текущие ограды будут заменены.",
                "Vsacoe", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
            return;
        _manager.RestoreSnapshot(row.File.Snapshot);
        Close();
    }

    private void DeleteSnapshot_Click(object sender, RoutedEventArgs e)
    {
        if (SnapshotsList.SelectedItem is not SnapshotRow row)
            return;
        _manager.Store.DeleteSnapshot(row.File.FilePath);
        ReloadSnapshots();
    }

    private void OpenSnapshots_Click(object sender, RoutedEventArgs e)
    {
        Directory.CreateDirectory(_manager.Store.SnapshotsDirectory);
        ShellActions.OpenFolder(_manager.Store.SnapshotsDirectory);
    }
}
