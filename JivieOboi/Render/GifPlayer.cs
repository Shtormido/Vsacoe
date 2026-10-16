using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace JivieOboi;

/// <summary>Анимированный GIF: кадры заранее собираются с учётом смещений и способа очистки.</summary>
internal sealed class GifPlayer : Image
{
    const long MemoryBudget = 300L * 1024 * 1024;

    readonly List<BitmapSource> frames = new();
    readonly List<TimeSpan> delays = new();
    readonly DispatcherTimer timer = new(DispatcherPriority.Render);
    int index;

    public GifPlayer(string path)
    {
        var decoder = new GifBitmapDecoder(new Uri(path), BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        var first = decoder.Frames[0];
        int w = Query(SafeMetadata(decoder), "/logscrdesc/Width", first.PixelWidth);
        int h = Query(SafeMetadata(decoder), "/logscrdesc/Height", first.PixelHeight);
        long frameBytes = (long)w * h * 4;

        BitmapSource? canvas = null;
        foreach (var frame in decoder.Frames)
        {
            if (frames.Count > 0 && frameBytes * (frames.Count + 1) > MemoryBudget) break;
            var meta = frame.Metadata as BitmapMetadata;
            var rect = new Rect(Query(meta, "/imgdesc/Left", 0), Query(meta, "/imgdesc/Top", 0), frame.PixelWidth, frame.PixelHeight);
            int delay = Query(meta, "/grctlext/Delay", 10);
            int disposal = Query(meta, "/grctlext/Disposal", 0);

            var full = Compose(w, h, canvas, frame, rect, null);
            frames.Add(full);
            delays.Add(TimeSpan.FromMilliseconds(delay < 2 ? 100 : delay * 10));

            canvas = disposal switch
            {
                2 => Compose(w, h, full, null, rect, rect), // очистить область кадра
                3 => canvas,                                // вернуть предыдущее состояние
                _ => full,
            };
        }

        Source = frames[0];
        timer.Tick += (_, _) =>
        {
            index = (index + 1) % frames.Count;
            Source = frames[index];
            timer.Interval = delays[index];
        };
    }

    public void Play()
    {
        if (frames.Count < 2 || timer.IsEnabled) return;
        timer.Interval = delays[index];
        timer.Start();
    }

    public void Stop() => timer.Stop();

    static BitmapSource Compose(int w, int h, BitmapSource? background, BitmapSource? frame, Rect frameRect, Rect? clear)
    {
        var visual = new DrawingVisual();
        using (var dc = visual.RenderOpen())
        {
            if (background != null)
            {
                if (clear is Rect c)
                    dc.PushClip(new CombinedGeometry(GeometryCombineMode.Exclude,
                        new RectangleGeometry(new Rect(0, 0, w, h)), new RectangleGeometry(c)));
                dc.DrawImage(background, new Rect(0, 0, w, h));
                if (clear != null) dc.Pop();
            }
            if (frame != null) dc.DrawImage(frame, frameRect);
        }
        var bitmap = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(visual);
        bitmap.Freeze();
        return bitmap;
    }

    static ImageMetadata? SafeMetadata(BitmapDecoder decoder)
    {
        try { return decoder.Metadata; }
        catch { return null; }
    }

    static int Query(ImageMetadata? metadata, string query, int fallback)
    {
        try
        {
            if (metadata is BitmapMetadata m && m.ContainsQuery(query))
                return Convert.ToInt32(m.GetQuery(query));
        }
        catch
        {
            // Битые метаданные — берём значение по умолчанию.
        }
        return fallback;
    }
}
