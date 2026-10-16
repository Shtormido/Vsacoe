using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using JivieOboi.Scenes;

namespace JivieOboi;

/// <summary>Содержимое обоев: встроенная анимация, видео, веб-страница, GIF или картинка.</summary>
internal sealed class WallpaperView : Grid, IDisposable
{
    public static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".mp4", ".m4v", ".mov", ".wmv", ".avi", ".mkv", ".webm", ".mpg", ".mpeg", ".3gp", ".ts" };

    public static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".jxr" };

    readonly Settings settings;
    readonly bool soundAllowed;
    readonly bool desktopRole;
    MediaElement? media;
    GifPlayer? gif;
    SceneElement? scene;
    WebWallpaper? web;
    bool paused = true, deep;

    public WallpaperItem Item { get; }

    /// <summary>Если обои — обычная картинка, её можно сразу отдать экрану блокировки.</summary>
    public string? ImageFile { get; private set; }

    /// <summary>Веб-обои сделали снимок для превью (только на рабочем столе).</summary>
    public event Action<WallpaperItem, BitmapSource>? PreviewCaptured;

    public bool IsWeb => web != null;

    public WallpaperView(WallpaperItem item, Settings settings, bool soundAllowed, bool desktopRole)
    {
        Item = item;
        this.settings = settings;
        this.soundAllowed = soundAllowed;
        this.desktopRole = desktopRole;
        Background = Brushes.Black;
        ClipToBounds = true;
        IsHitTestVisible = false;
        try
        {
            Build();
        }
        catch (Exception ex)
        {
            Log.Error("Загрузка обоев " + item.Title, ex);
            ShowFallback($"Не удалось открыть «{item.Title}»: {ex.Message}");
        }
    }

    Stretch StretchMode => Enum.TryParse<Stretch>(settings.Stretch, out var s) ? s : Stretch.UniformToFill;

    void Build()
    {
        var path = Item.Path;
        switch (Item.Type)
        {
            case WallpaperType.Scene:
                scene = SceneCatalog.Create(Item.Scene ?? "aurora", settings.SceneFps, SceneOptions.From(Item));
                Children.Add(scene);
                return;

            case WallpaperType.Url:
                if (!RequireWebView()) return;
                AddWeb();
                return;
        }

        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            ShowFallback($"Файл не найден: {path}");
            return;
        }

        switch (Item.Type)
        {
            case WallpaperType.Web:
                if (!RequireWebView()) return;
                AddWeb();
                return;

            case WallpaperType.Video when settings.VideoEngine == "webview" && WebWallpaper.IsAvailable:
                AddWeb();
                return;

            case WallpaperType.Video:
                media = new MediaElement
                {
                    LoadedBehavior = MediaState.Manual,
                    UnloadedBehavior = MediaState.Manual,
                    Stretch = StretchMode,
                    Source = new Uri(path),
                };
                ApplyVolume(settings.Volume);
                media.MediaEnded += (_, _) =>
                {
                    media.Position = TimeSpan.Zero;
                    if (!paused) media.Play();
                };
                media.MediaFailed += (_, e) =>
                {
                    Log.Error("Видео", e.ErrorException);
                    ShowFallback("Windows не смогла воспроизвести видео. Включите движок Chromium в настройках или попробуйте MP4 (H.264).");
                };
                Children.Add(media);
                return;

            case WallpaperType.Gif:
                gif = new GifPlayer(path) { Stretch = StretchMode };
                RenderOptions.SetBitmapScalingMode(gif, BitmapScalingMode.HighQuality);
                Children.Add(gif);
                return;

            default:
                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.UriSource = new Uri(path);
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.EndInit();
                bitmap.Freeze();
                var image = new Image { Source = bitmap, Stretch = StretchMode };
                RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.HighQuality);
                Children.Add(image);
                ImageFile = path;
                return;
        }
    }

    bool RequireWebView()
    {
        if (WebWallpaper.IsAvailable) return true;
        ShowFallback("Для веб-обоев нужен Microsoft Edge WebView2 Runtime (в Windows 11 он встроен): https://go.microsoft.com/fwlink/p/?LinkId=2124703");
        return false;
    }

    void AddWeb()
    {
        web = new WebWallpaper(Item, settings, soundAllowed, capturePreview: desktopRole);
        web.PreviewCaptured += frame => PreviewCaptured?.Invoke(Item, frame);
        Children.Add(web);
    }

    void ShowFallback(string message)
    {
        media?.Close();
        media = null;
        gif?.Stop();
        gif = null;
        scene?.Stop();
        web?.Dispose();
        web = null;
        Children.Clear();

        scene = SceneCatalog.Create("aurora", settings.SceneFps, new SceneOptions { Audio = false });
        Children.Add(scene);
        Children.Add(new TextBlock
        {
            Text = message,
            Foreground = new SolidColorBrush(Color.FromArgb(210, 255, 255, 255)),
            FontSize = 16,
            Margin = new Thickness(24, 24, 24, 72),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Bottom,
            TextWrapping = TextWrapping.Wrap,
        });
        if (!paused) scene.Start();
    }

    /// <param name="value">Остановить анимацию.</param>
    /// <param name="deepPause">Экран не виден (игра, блокировка) — можно освободить ресурсы целиком.</param>
    public void SetPaused(bool value, bool deepPause = false)
    {
        bool deepNow = value && deepPause;
        if (paused == value && deep == deepNow) return;
        paused = value;
        deep = deepNow;
        web?.SetPaused(value, deepNow);
        if (paused)
        {
            media?.Pause();
            gif?.Stop();
            scene?.Stop();
        }
        else
        {
            media?.Play();
            gif?.Play();
            scene?.Start();
        }
    }

    public void ApplyVolume(double volume)
    {
        web?.ApplyVolume(volume);
        if (media == null) return;
        media.IsMuted = !soundAllowed || volume <= 0;
        media.Volume = Math.Clamp(volume, 0, 1);
    }

    /// <summary>Пользователь поменял свойства обоев в библиотеке.</summary>
    public void ApplyProperties()
    {
        if (scene != null && Item.Type == WallpaperType.Scene) scene.Options = SceneOptions.From(Item);
        web?.ApplyProperties();
    }

    public void PushAudio(float[] values) => web?.PushAudio(values);

    public void PushMouse(string type, double x, double y, int button) => web?.PushMouse(type, x, y, button);

    /// <summary>Снимок текущего кадра в физических пикселях.</summary>
    public async Task<BitmapSource?> CaptureFrameAsync()
    {
        if (web != null) return await web.CaptureAsync();
        if (ActualWidth < 1 || ActualHeight < 1) return null;
        double sx = 1, sy = 1;
        var source = PresentationSource.FromVisual(this);
        if (source?.CompositionTarget != null)
        {
            var m = source.CompositionTarget.TransformToDevice;
            sx = m.M11;
            sy = m.M22;
        }
        var bitmap = new RenderTargetBitmap(
            (int)Math.Round(ActualWidth * sx), (int)Math.Round(ActualHeight * sy),
            96 * sx, 96 * sy, PixelFormats.Pbgra32);
        bitmap.Render(this);
        bitmap.Freeze();
        return bitmap;
    }

    public void Dispose()
    {
        paused = true;
        if (media != null)
        {
            media.Stop();
            media.Close();
            media = null;
        }
        gif?.Stop();
        scene?.Stop();
        web?.Dispose();
        web = null;
        Children.Clear();
    }
}
