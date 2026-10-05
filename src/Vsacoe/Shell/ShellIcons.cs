using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Vsacoe.Interop;
using static Vsacoe.Interop.NativeMethods;

namespace Vsacoe.Shell;

internal static class ShellIcons
{
    /// <summary>
    /// Значок или миниатюра (для картинок и видео) элемента оболочки размером <paramref name="size"/> пикселей.
    /// Работает и для виртуальных объектов вида «::{GUID}».
    /// </summary>
    public static BitmapSource? GetImage(string path, int size)
    {
        IShellItem? item = null;
        try
        {
            var iid = typeof(IShellItem).GUID;
            if (SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item) != 0 || item == null)
                return GetGenericIcon(path);

            var factory = (IShellItemImageFactory)item;
            var hr = factory.GetImage(new SIZE(size, size), SIIGBF.ResizeToFit, out var hbmp);
            if (hr != 0)
                hr = factory.GetImage(new SIZE(size, size), SIIGBF.IconOnly, out hbmp);
            if (hr != 0 || hbmp == IntPtr.Zero)
                return GetGenericIcon(path);

            try
            {
                return FromHBitmap(hbmp);
            }
            finally
            {
                DeleteObject(hbmp);
            }
        }
        catch (Exception ex) when (ex is COMException or InvalidCastException or ArgumentException)
        {
            return GetGenericIcon(path);
        }
        finally
        {
            if (item != null)
                Marshal.ReleaseComObject(item);
        }
    }

    /// <summary>Отображаемое имя объекта оболочки (например, «Корзина»).</summary>
    public static string? GetDisplayName(string path)
    {
        IShellItem? item = null;
        try
        {
            var iid = typeof(IShellItem).GUID;
            if (SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item) != 0 || item == null)
                return null;
            item.GetDisplayName(SIGDN.NormalDisplay, out var ptr);
            try
            {
                return Marshal.PtrToStringUni(ptr);
            }
            finally
            {
                Marshal.FreeCoTaskMem(ptr);
            }
        }
        catch (COMException)
        {
            return null;
        }
        finally
        {
            if (item != null)
                Marshal.ReleaseComObject(item);
        }
    }

    private static BitmapSource? GetGenericIcon(string path)
    {
        var info = new SHFILEINFO();
        var result = SHGetFileInfo(path, FILE_ATTRIBUTE_NORMAL, ref info, (uint)Marshal.SizeOf<SHFILEINFO>(),
            SHGFI_ICON | SHGFI_LARGEICON | SHGFI_USEFILEATTRIBUTES);
        if (result == IntPtr.Zero || info.hIcon == IntPtr.Zero)
            return null;
        try
        {
            var source = Imaging.CreateBitmapSourceFromHIcon(info.hIcon, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
            source.Freeze();
            return source;
        }
        finally
        {
            DestroyIcon(info.hIcon);
        }
    }

    /// <summary>
    /// Imaging.CreateBitmapSourceFromHBitmap теряет альфа-канал у 32-битных DIB-секций,
    /// поэтому копируем пиксели вручную.
    /// </summary>
    private static BitmapSource? FromHBitmap(IntPtr hbmp)
    {
        var ds = new DIBSECTION();
        var size = Marshal.SizeOf<DIBSECTION>();
        if (GetObject(hbmp, size, ref ds) == size && ds.dsBm.bmBits != IntPtr.Zero && ds.dsBm.bmBitsPixel == 32)
        {
            int width = ds.dsBm.bmWidth, height = Math.Abs(ds.dsBm.bmHeight), stride = ds.dsBm.bmWidthBytes;
            var pixels = new byte[stride * height];
            Marshal.Copy(ds.dsBm.bmBits, pixels, 0, pixels.Length);

            if (ds.dsBmih.biHeight > 0)
                FlipRows(pixels, stride, height);

            var format = DetectFormat(pixels);
            var source = BitmapSource.Create(width, height, 96, 96, format, null, pixels, stride);
            source.Freeze();
            return source;
        }

        var fallback = Imaging.CreateBitmapSourceFromHBitmap(hbmp, IntPtr.Zero, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
        fallback.Freeze();
        return fallback;
    }

    private static PixelFormat DetectFormat(byte[] bgra)
    {
        var hasAlpha = false;
        var premultiplied = true;
        for (var i = 0; i < bgra.Length; i += 4)
        {
            var a = bgra[i + 3];
            if (a != 0)
                hasAlpha = true;
            if (bgra[i] > a || bgra[i + 1] > a || bgra[i + 2] > a)
                premultiplied = false;
        }
        if (!hasAlpha)
            return PixelFormats.Bgr32;
        return premultiplied ? PixelFormats.Pbgra32 : PixelFormats.Bgra32;
    }

    private static void FlipRows(byte[] pixels, int stride, int height)
    {
        var row = new byte[stride];
        for (int top = 0, bottom = height - 1; top < bottom; top++, bottom--)
        {
            Buffer.BlockCopy(pixels, top * stride, row, 0, stride);
            Buffer.BlockCopy(pixels, bottom * stride, pixels, top * stride, stride);
            Buffer.BlockCopy(row, 0, pixels, bottom * stride, stride);
        }
    }
}
