using System.Windows;
using Forms = System.Windows.Forms;

namespace Vsacoe.Services;

/// <summary>Значок в области уведомлений с главным меню приложения.</summary>
internal sealed class TrayIcon : IDisposable
{
    private readonly FenceManager _manager;
    private readonly Forms.NotifyIcon _icon;
    private readonly Forms.ContextMenuStrip _menu = new();

    public TrayIcon(FenceManager manager)
    {
        _manager = manager;
        _icon = new Forms.NotifyIcon
        {
            Text = "Vsacoe — ограды рабочего стола",
            Icon = LoadIcon(),
            ContextMenuStrip = _menu,
            Visible = true,
        };
        _menu.Opening += (_, _) => BuildMenu();
        _icon.MouseDoubleClick += (_, e) =>
        {
            if (e.Button == Forms.MouseButtons.Left)
                _manager.ShowSettings();
        };
        BuildMenu();
    }

    public void ShowBalloon(string title, string text) =>
        _icon.ShowBalloonTip(5000, title, text, Forms.ToolTipIcon.Info);

    private static System.Drawing.Icon LoadIcon()
    {
        try
        {
            var info = Application.GetResourceStream(new Uri("pack://application:,,,/Assets/app.ico"));
            if (info != null)
            {
                using var stream = info.Stream;
                return new System.Drawing.Icon(stream, Forms.SystemInformation.SmallIconSize);
            }
        }
        catch (Exception ex)
        {
            Log.Write($"Tray icon load failed: {ex.Message}");
        }
        return System.Drawing.SystemIcons.Application;
    }

    private void BuildMenu()
    {
        _menu.Items.Clear();
        var s = _manager.Settings;

        Add("Новая ограда", () => _manager.CreateFence(Core.FenceKind.Standard)).Font = new System.Drawing.Font(_menu.Font, System.Drawing.FontStyle.Bold);
        Add("Новый портал папки…", () => App.CreatePortalInteractive(_manager, null));
        Add("Быстрая настройка: разложить рабочий стол…", () =>
        {
            if (MessageBox.Show("Создать ограды «Программы», «Папки», «Документы» и «Медиа» с правилами и разложить по ним рабочий стол?",
                    "Vsacoe", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
                _manager.QuickSetup();
        });
        _menu.Items.Add(new Forms.ToolStripSeparator());

        Add(_manager.QuickHidden ? "Показать ограды" : "Скрыть ограды", _manager.ToggleQuickHide);
        Add("Скрыть значки рабочего стола", () => _manager.SetHideDesktopIcons(!s.HideDesktopIcons)).Checked = s.HideDesktopIcons;
        Add("Закрепить ограды", () => _manager.SetLocked(!s.LockFences)).Checked = s.LockFences;
        Add("Разложить рабочий стол по правилам", () =>
        {
            var moved = _manager.ApplyRulesNow();
            ShowBalloon("Vsacoe", moved == 0 ? "Нечего раскладывать." : $"Разложено элементов: {moved}.");
        }).Enabled = s.Rules.Count > 0;
        _menu.Items.Add(new Forms.ToolStripSeparator());

        var snapshots = new Forms.ToolStripMenuItem("Снимки макета");
        snapshots.DropDownItems.Add(new Forms.ToolStripMenuItem("Сохранить снимок…", null, (_, _) =>
        {
            var name = Views.InputDialog.Show(null, "Снимок макета", "Название снимка:", $"Макет {DateTime.Now:g}");
            if (name != null)
            {
                _manager.SaveSnapshot(name);
                ShowBalloon("Vsacoe", $"Снимок «{name}» сохранён.");
            }
        }));
        var list = _manager.Store.ListSnapshots();
        if (list.Count > 0)
            snapshots.DropDownItems.Add(new Forms.ToolStripSeparator());
        foreach (var file in list.Take(15))
        {
            var snapshot = file.Snapshot;
            snapshots.DropDownItems.Add(new Forms.ToolStripMenuItem($"{snapshot.Name} ({snapshot.CreatedUtc.ToLocalTime():g})", null, (_, _) =>
            {
                if (MessageBox.Show($"Восстановить «{snapshot.Name}»? Текущие ограды будут заменены.", "Vsacoe",
                        MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
                    _manager.RestoreSnapshot(snapshot);
            }));
        }
        snapshots.DropDownItems.Add(new Forms.ToolStripSeparator());
        snapshots.DropDownItems.Add(new Forms.ToolStripMenuItem("Управление снимками…", null, (_, _) => _manager.ShowSettings(2)));
        _menu.Items.Add(snapshots);

        Add("Настройки…", () => _manager.ShowSettings());
        _menu.Items.Add(new Forms.ToolStripSeparator());
        Add("Выход", App.ExitApp);
    }

    private Forms.ToolStripMenuItem Add(string text, Action action)
    {
        var item = new Forms.ToolStripMenuItem(text, null, (_, _) => action());
        _menu.Items.Add(item);
        return item;
    }

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.Dispose();
        _menu.Dispose();
    }
}
