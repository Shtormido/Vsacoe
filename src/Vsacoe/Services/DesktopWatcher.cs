using System.IO;
using System.Windows.Threading;
using Vsacoe.Core;

namespace Vsacoe.Services;

internal sealed record DesktopChange(WatcherChangeTypes Type, string Path, string? OldPath = null);

/// <summary>Следит за папками рабочего стола пользователя и общего рабочего стола.</summary>
internal sealed class DesktopWatcher : IDisposable
{
    private readonly List<FileSystemWatcher> _watchers = new();
    private readonly Dispatcher _dispatcher;

    /// <summary>Изменение одного элемента; null — нужно перечитать всё (переполнение буфера).</summary>
    public event Action<DesktopChange?>? Changed;

    public IReadOnlyList<string> Folders { get; }

    public DesktopWatcher(Dispatcher dispatcher)
    {
        _dispatcher = dispatcher;
        Folders = new[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            }
            .Where(f => !string.IsNullOrEmpty(f) && Directory.Exists(f))
            .Distinct(PathUtil.Comparer)
            .ToList();

        foreach (var folder in Folders)
        {
            try
            {
                var w = new FileSystemWatcher(folder)
                {
                    IncludeSubdirectories = false,
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName,
                    InternalBufferSize = 64 * 1024,
                };
                w.Created += (_, e) => Raise(new DesktopChange(WatcherChangeTypes.Created, e.FullPath));
                w.Deleted += (_, e) => Raise(new DesktopChange(WatcherChangeTypes.Deleted, e.FullPath));
                w.Renamed += (_, e) => Raise(new DesktopChange(WatcherChangeTypes.Renamed, e.FullPath, e.OldFullPath));
                w.Error += (_, _) => Raise(null);
                w.EnableRaisingEvents = true;
                _watchers.Add(w);
            }
            catch (Exception ex)
            {
                Log.Write($"Cannot watch {folder}: {ex.Message}");
            }
        }
    }

    public bool IsDesktopItem(string path) => Folders.Any(f => PathUtil.IsDirectChild(path, f));

    /// <summary>Видимые элементы рабочего стола (без скрытых и системных файлов вроде desktop.ini).</summary>
    public List<string> Enumerate()
    {
        var result = new List<string>();
        foreach (var folder in Folders)
        {
            try
            {
                foreach (var entry in new DirectoryInfo(folder).EnumerateFileSystemInfos())
                {
                    if (IsVisible(entry))
                        result.Add(entry.FullName);
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                Log.Write($"Cannot enumerate {folder}: {ex.Message}");
            }
        }
        return result;
    }

    public static bool IsVisible(FileSystemInfo entry) =>
        (entry.Attributes & (FileAttributes.Hidden | FileAttributes.System)) == 0;

    public static bool IsVisible(string path)
    {
        try
        {
            var attributes = File.GetAttributes(path);
            return (attributes & (FileAttributes.Hidden | FileAttributes.System)) == 0;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    private void Raise(DesktopChange? change) => _dispatcher.BeginInvoke(() => Changed?.Invoke(change));

    public void Dispose()
    {
        foreach (var w in _watchers)
            w.Dispose();
        _watchers.Clear();
    }
}
