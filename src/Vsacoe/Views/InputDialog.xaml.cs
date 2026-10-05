using System.IO;
using System.Windows;

namespace Vsacoe.Views;

internal partial class InputDialog : Window
{
    private InputDialog()
    {
        InitializeComponent();
    }

    /// <summary>Показывает окно ввода строки. Возвращает null при отмене.</summary>
    public static string? Show(Window? owner, string title, string prompt, string initial = "")
    {
        var dialog = new InputDialog { Title = title };
        if (owner is { IsVisible: true })
            dialog.Owner = owner;
        else
            dialog.WindowStartupLocation = WindowStartupLocation.CenterScreen;
        dialog.PromptText.Text = prompt;
        dialog.Input.Text = initial;
        dialog.Loaded += (_, _) =>
        {
            dialog.Input.Focus();
            // Как в Проводнике: выделяем имя без расширения.
            var ext = Path.GetExtension(initial);
            var length = ext.Length > 0 && ext.Length < initial.Length ? initial.Length - ext.Length : initial.Length;
            dialog.Input.Select(0, length);
        };
        return dialog.ShowDialog() == true ? dialog.Input.Text : null;
    }

    private void Ok_Click(object sender, RoutedEventArgs e) => DialogResult = true;
}
