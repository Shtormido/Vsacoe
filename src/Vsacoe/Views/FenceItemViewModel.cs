using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows.Media;
using Vsacoe.Core;
using Vsacoe.Shell;

namespace Vsacoe.Views;

internal sealed class FenceItemViewModel : INotifyPropertyChanged
{
    private ImageSource? _icon;
    private bool _isSelected;

    private FenceItemViewModel(string path, string name, bool isDirectory, DateTime modified, long size)
    {
        Path = path;
        Name = name;
        IsDirectory = isDirectory;
        Modified = modified;
        Size = size;
    }

    public string Path { get; }
    public string Name { get; }
    public bool IsDirectory { get; }
    public DateTime Modified { get; }
    public long Size { get; }
    public bool IsVirtual => PathUtil.IsVirtual(Path);

    /// <summary>Элемент из «ограды для всего остального», а не явно добавленный.</summary>
    public bool IsExtra { get; init; }

    public int LoadedIconSize { get; set; }

    public ImageSource? Icon
    {
        get => _icon;
        set => Set(ref _icon, value);
    }

    public bool IsSelected
    {
        get => _isSelected;
        set => Set(ref _isSelected, value);
    }

    public FileEntryInfo Info => new(Path, Name, IsDirectory, Modified, Size);

    public static FenceItemViewModel? TryCreate(string path, bool isExtra = false)
    {
        if (PathUtil.IsVirtual(path))
            return new FenceItemViewModel(path, ShellIcons.GetDisplayName(path) ?? path, false, DateTime.MinValue, 0) { IsExtra = isExtra };

        try
        {
            if (Directory.Exists(path))
            {
                var dir = new DirectoryInfo(path);
                return new FenceItemViewModel(path, PathUtil.DisplayName(path), true, dir.LastWriteTime, 0) { IsExtra = isExtra };
            }
            var file = new FileInfo(path);
            if (!file.Exists)
                return null;
            return new FenceItemViewModel(path, PathUtil.DisplayName(path), false, file.LastWriteTime, file.Length) { IsExtra = isExtra };
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return null;
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
