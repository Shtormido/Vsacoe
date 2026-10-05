using System.IO;
using Vsacoe.Core;

namespace Vsacoe;

internal static class Log
{
    private static readonly object Sync = new();
    private static readonly string FilePath = Path.Combine(ConfigStore.DefaultDirectory, "vsacoe.log");

    public static void Write(string message)
    {
        try
        {
            lock (Sync)
            {
                Directory.CreateDirectory(ConfigStore.DefaultDirectory);
                var info = new FileInfo(FilePath);
                if (info.Exists && info.Length > 1_000_000)
                    info.Delete();
                File.AppendAllText(FilePath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
