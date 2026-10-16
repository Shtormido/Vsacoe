using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using JivieOboi.Scenes;

namespace JivieOboi;

/// <summary>Содержимое обоев: видео, GIF, картинка или встроенная сцена.</summary>
internal sealed class WallpaperView : Grid, IDisposable
{
    public static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".mp4", ".m4v", ".mov", ".wmv", ".avi", ".mkv", ".webm", ".mpg", ".mpeg", ".3gp", ".ts" };

    public static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".jxr" };

    readonly Settings settings;
    readonly bool soundAllowed;
    MediaElement? media;
    GifPlayer? gif;
    SceneElement? scene;
    bool paused = true;

    /// <summary>Если обои — обычная картинка, её можно сразу отдать экрану блокировки.</summary>
    public string? ImageFile { get; private set; }

    public WallpaperView(Settings settings, bool soundAllowed)
    {
        this.settings = settings;
        this.soundAllowed = soundAllowed;
        Background = Brushes.Black;
        ClipToBounds = true;
        IsHitTestVisible = false;
        try
        {
            Build();
        }
        catch (Exception ex)
        {
            Log.Error("Загрузка обоев", ex);
            ShowFallback($"Не удалось открыть файл: {ex.Message}");
        }
    }

    Stretch StretchMode => Enum.TryParse<Stretch>(settings.Stretch, out var s) ? s : Stretch.UniformToFill;

    void Build()
    {
        var path = settings.FilePath;
        if (settings.SourceType == "file" && !string.IsNullOrWhiteSpace(path))
        {
            if (!File.Exists(path))
            {
                ShowFallback($"Файл не найден: {path}");
                return;
            }

            var ext = Path.GetExtension(path);
            if (VideoExtensions.Contains(ext))
            {
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
                    ShowFallback("Windows не смогла воспроизвести видео. Попробуйте MP4 (H.264).");
                };
                Children.Add(media);
                return;
            }

            if (ext.Equals(".gif", StringComparison.OrdinalIgnoreCase))
            {
                gif = new GifPlayer(path) { Stretch = StretchMode };
                RenderOptions.SetBitmapScalingMode(gif, BitmapScalingMode.HighQuality);
                Children.Add(gif);
                return;
            }

            if (ImageExtensions.Contains(ext))
            {
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

            ShowFallback($"Неподдерживаемый формат: {ext}");
            return;
        }

        scene = SceneCatalog.Create(settings.Scene, settings.SceneFps);
        Children.Add(scene);
    }

    void ShowFallback(string message)
    {
        media?.Close();
        media = null;
        gif?.Stop();
        gif = null;
        scene?.Stop();
        Children.Clear();

        scene = SceneCatalog.Create("aurora", settings.SceneFps);
        Children.Add(scene);
        Children.Add(new TextBlock
        {
            Text = message,
            Foreground = new SolidColorBrush(Color.FromArgb(200, 255, 255, 255)),
            FontSize = 16,
            Margin = new Thickness(24),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Bottom,
            TextWrapping = TextWrapping.Wrap,
        });
        if (!paused) scene.Start();
    }

    public void SetPaused(bool value)
    {
        if (paused == value) return;
        paused = value;
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
        if (media == null) return;
        media.IsMuted = !soundAllowed || volume <= 0;
        media.Volume = Math.Clamp(volume, 0, 1);
    }

    /// <summary>Снимок текущего кадра в физических пикселях.</summary>
    public BitmapSource? CaptureFrame()
    {
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
        Children.Clear();
    }
}
