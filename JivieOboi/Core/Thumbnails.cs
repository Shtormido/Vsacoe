using System;
using System.Collections.Concurrent;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using JivieOboi.Scenes;

namespace JivieOboi;

/// <summary>
/// Превью для библиотеки. Видео и картинки — через миниатюры Проводника (IShellItemImageFactory),
/// встроенные анимации — рендером одного кадра. Результат кешируется в %LocalAppData%\JivieOboi\thumbs.
/// </summary>
internal static class Thumbnails
{
    static readonly ConcurrentDictionary<string, Task<ImageSource?>> Cache = new();
    static readonly SemaphoreSlim ShellLimit = new(2);

    public static string Folder => Path.Combine(Settings.Dir, "thumbs");

    public static string CachePath(WallpaperItem item) => Path.Combine(Folder, SafeName(item.Id) + ".jpg");

    static string SafeName(string id)
    {
        foreach (var c in Path.GetInvalidFileNameChars()) id = id.Replace(c, '_');
        return id;
    }

    public static void Invalidate(WallpaperItem item) => Cache.TryRemove(item.Id, out _);

    public static Task<ImageSource?> GetAsync(WallpaperItem item) => Cache.GetOrAdd(item.Id, _ => LoadAsync(item));

    static async Task<ImageSource?> LoadAsync(WallpaperItem item)
    {
        try
        {
            if (item.Preview != null && File.Exists(item.Preview)) return LoadFile(item.Preview);
            var cached = CachePath(item);
            if (File.Exists(cached)) return LoadFile(cached);

            if (item.Type == WallpaperType.Scene)
            {
                var still = SceneCatalog.Create(item.Scene ?? "aurora", 30, SceneOptions.From(item)).RenderPreview(480, 270);
                Save(still, cached);
                return still;
            }

            if (item.Path != null && File.Exists(item.Path) &&
                item.Type is WallpaperType.Video or WallpaperType.Image or WallpaperType.Gif)
            {
                var path = item.Path;
                await ShellLimit.WaitAsync();
                try
                {
                    var bitmap = await RunSta(() => ShellThumbnail(path, 480));
                    if (bitmap != null)
                    {
                        Save(bitmap, cached);
                        return bitmap;
                    }
                }
                finally
                {
                    ShellLimit.Release();
                }
            }
        }
        catch (Exception ex)
        {
            Log.Error("Превью " + item.Title, ex);
        }
        return null;
    }

    /// <summary>Сохранить снимок как превью (для веб-обоев — после первого показа).</summary>
    public static void Store(WallpaperItem item, BitmapSource frame)
    {
        try
        {
            var scaled = new TransformedBitmap(frame, new ScaleTransform(480.0 / frame.PixelWidth, 480.0 / frame.PixelWidth));
            Save(scaled, CachePath(item));
            Invalidate(item);
        }
        catch (Exception ex)
        {
            Log.Error("Сохранение превью", ex);
        }
    }

    static ImageSource LoadFile(string path)
    {
        var bmp = new BitmapImage();
        bmp.BeginInit();
        bmp.UriSource = new Uri(path);
        bmp.DecodePixelWidth = 480;
        bmp.CacheOption = BitmapCacheOption.OnLoad;
        bmp.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
        bmp.EndInit();
        bmp.Freeze();
        return bmp;
    }

    static void Save(BitmapSource bitmap, string path)
    {
        Directory.CreateDirectory(Folder);
        var encoder = new JpegBitmapEncoder { QualityLevel = 85 };
        encoder.Frames.Add(BitmapFrame.Create(new FormatConvertedBitmap(bitmap, PixelFormats.Bgr24, null, 0)));
        using var stream = File.Create(path);
        encoder.Save(stream);
    }

    static Task<T?> RunSta<T>(Func<T?> work) where T : class
    {
        var tcs = new TaskCompletionSource<T?>();
        var thread = new Thread(() =>
        {
            try { tcs.SetResult(work()); }
            catch (Exception ex) { tcs.SetException(ex); }
        }) { IsBackground = true };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return tcs.Task;
    }

    // ── миниатюры Проводника ──

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory
    {
        [PreserveSig]
        int GetImage(SIZE size, int flags, out IntPtr bitmap);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct SIZE { public int cx, cy; }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr bindContext,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItemImageFactory factory);

    [DllImport("gdi32.dll")]
    static extern bool DeleteObject(IntPtr handle);

    static BitmapSource? ShellThumbnail(string path, int width)
    {
        SHCreateItemFromParsingName(path, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out var factory);
        try
        {
            // SIIGBF_BIGGERSIZEOK (0x1)
            if (factory.GetImage(new SIZE { cx = width, cy = width * 9 / 16 }, 0x1, out var hbitmap) != 0 || hbitmap == IntPtr.Zero)
                return null;
            try
            {
                var source = Imaging.CreateBitmapSourceFromHBitmap(hbitmap, IntPtr.Zero, Int32Rect.Empty,
                    BitmapSizeOptions.FromEmptyOptions());
                source.Freeze();
                return source;
            }
            finally
            {
                DeleteObject(hbitmap);
            }
        }
        finally
        {
            Marshal.ReleaseComObject(factory);
        }
    }
}
