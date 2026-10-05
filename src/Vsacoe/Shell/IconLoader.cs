using System.Collections.Concurrent;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace Vsacoe.Shell;

/// <summary>Загружает значки в отдельном STA-потоке и кэширует их.</summary>
internal sealed class IconLoader : IDisposable
{
    private sealed record Request(string Path, int Size, Action<BitmapSource> Callback);

    private readonly BlockingCollection<Request> _queue = new();
    private readonly ConcurrentDictionary<string, BitmapSource> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dispatcher _dispatcher;
    private readonly Thread _thread;

    public IconLoader(Dispatcher dispatcher)
    {
        _dispatcher = dispatcher;
        _thread = new Thread(Run) { IsBackground = true, Name = "Vsacoe icon loader" };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
    }

    /// <summary>Запрашивает значок; <paramref name="callback"/> вызывается в UI-потоке.</summary>
    public void Load(string path, int size, Action<BitmapSource> callback)
    {
        if (_cache.TryGetValue(Key(path, size), out var cached))
        {
            callback(cached);
            return;
        }
        if (!_queue.IsAddingCompleted)
            _queue.Add(new Request(path, size, callback));
    }

    public void Invalidate(string path)
    {
        foreach (var key in _cache.Keys)
        {
            if (key.EndsWith("|" + path, StringComparison.OrdinalIgnoreCase))
                _cache.TryRemove(key, out _);
        }
    }

    public void Clear() => _cache.Clear();

    private void Run()
    {
        foreach (var request in _queue.GetConsumingEnumerable())
        {
            var key = Key(request.Path, request.Size);
            if (!_cache.TryGetValue(key, out var image))
            {
                try
                {
                    image = ShellIcons.GetImage(request.Path, request.Size);
                }
                catch (Exception ex)
                {
                    Log.Write($"Icon load failed for {request.Path}: {ex.Message}");
                }
                if (image != null)
                    _cache[key] = image;
            }
            if (image != null)
                _dispatcher.BeginInvoke(DispatcherPriority.Background, () => request.Callback(image));
        }
    }

    private static string Key(string path, int size) => size + "|" + path;

    public void Dispose() => _queue.CompleteAdding();
}
