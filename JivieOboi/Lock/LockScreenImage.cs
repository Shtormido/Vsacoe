using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Windows.Storage;
using Windows.System.UserProfile;

namespace JivieOboi.Lock;

/// <summary>
/// Картинка системного экрана блокировки. Сам экран блокировки Windows (LockApp)
/// не пускает сторонние окна, поэтому туда ставится текущий кадр живых обоев.
/// </summary>
internal static class LockScreenImage
{
    static int flip;

    static bool IsSupportedFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext is ".jpg" or ".jpeg" or ".png" or ".bmp";
    }

    public static async Task<bool> ApplyFromViewAsync(WallpaperView view)
    {
        if (view.ImageFile is string file && IsSupportedFile(file))
            return await SetFileAsync(file);

        var frame = await view.CaptureFrameAsync();
        return frame != null && await SetBitmapAsync(frame);
    }

    /// <summary>То же, но не дольше <paramref name="timeoutMs"/> — чтобы не задерживать блокировку.</summary>
    public static async Task<bool> TryApplyAsync(WallpaperView? view, int timeoutMs)
    {
        if (view == null) return false;
        try
        {
            var task = ApplyFromViewAsync(view);
            var finished = await Task.WhenAny(task, Task.Delay(timeoutMs));
            return finished == task && task.Result;
        }
        catch (Exception ex)
        {
            Log.Error("Экран блокировки", ex);
            return false;
        }
    }

    static async Task<bool> SetBitmapAsync(BitmapSource frame)
    {
        Directory.CreateDirectory(Settings.Dir);
        // Чередуем два файла, чтобы Windows точно заметила новую картинку.
        var path = Path.Combine(Settings.Dir, flip++ % 2 == 0 ? "lockscreen_a.jpg" : "lockscreen_b.jpg");
        await Task.Run(() =>
        {
            var encoder = new JpegBitmapEncoder { QualityLevel = 92 };
            encoder.Frames.Add(BitmapFrame.Create(new FormatConvertedBitmap(frame, PixelFormats.Bgr24, null, 0)));
            using var stream = File.Create(path);
            encoder.Save(stream);
        });
        return await SetFileAsync(path);
    }

    static async Task<bool> SetFileAsync(string path)
    {
        try
        {
            var file = await StorageFile.GetFileFromPathAsync(Path.GetFullPath(path));
            await LockScreen.SetImageFileAsync(file);
            return true;
        }
        catch (Exception ex)
        {
            Log.Error("LockScreen.SetImageFileAsync", ex);
            return false;
        }
    }
}
