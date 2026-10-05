namespace Vsacoe.Core;

public static class FileCategories
{
    private static readonly Dictionary<string, ItemCategory> ByExtension = Build();

    private static readonly Dictionary<string, ItemCategory> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["папка"] = ItemCategory.Folder, ["папки"] = ItemCategory.Folder,
        ["ярлык"] = ItemCategory.Shortcut, ["ярлыки"] = ItemCategory.Shortcut,
        ["программа"] = ItemCategory.Application, ["программы"] = ItemCategory.Application, ["приложение"] = ItemCategory.Application,
        ["документ"] = ItemCategory.Document, ["документы"] = ItemCategory.Document,
        ["изображение"] = ItemCategory.Image, ["изображения"] = ItemCategory.Image, ["картинки"] = ItemCategory.Image,
        ["видео"] = ItemCategory.Video,
        ["аудио"] = ItemCategory.Audio, ["музыка"] = ItemCategory.Audio,
        ["архив"] = ItemCategory.Archive, ["архивы"] = ItemCategory.Archive,
        ["прочее"] = ItemCategory.Other, ["другое"] = ItemCategory.Other,
    };

    public static readonly IReadOnlyDictionary<ItemCategory, string> RussianNames = new Dictionary<ItemCategory, string>
    {
        [ItemCategory.Folder] = "Папка",
        [ItemCategory.Shortcut] = "Ярлык",
        [ItemCategory.Application] = "Программа",
        [ItemCategory.Document] = "Документ",
        [ItemCategory.Image] = "Изображение",
        [ItemCategory.Video] = "Видео",
        [ItemCategory.Audio] = "Аудио",
        [ItemCategory.Archive] = "Архив",
        [ItemCategory.Other] = "Прочее",
    };

    public static ItemCategory Classify(string path, bool isDirectory)
    {
        if (isDirectory)
            return ItemCategory.Folder;
        var ext = Path.GetExtension(path).TrimStart('.');
        return ByExtension.TryGetValue(ext, out var category) ? category : ItemCategory.Other;
    }

    /// <summary>Разбирает название категории — английское (Image) или русское (Изображения).</summary>
    public static bool TryParse(string text, out ItemCategory category)
    {
        text = text.Trim();
        if (Aliases.TryGetValue(text, out category))
            return true;
        return Enum.TryParse(text, ignoreCase: true, out category) && Enum.IsDefined(category);
    }

    private static Dictionary<string, ItemCategory> Build()
    {
        var map = new Dictionary<string, ItemCategory>(StringComparer.OrdinalIgnoreCase);
        void Add(ItemCategory c, string list)
        {
            foreach (var e in list.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                map[e] = c;
        }

        Add(ItemCategory.Shortcut, "lnk url website appref-ms");
        Add(ItemCategory.Application, "exe msi msix appx bat cmd ps1 com scr");
        Add(ItemCategory.Document, "txt rtf doc docx odt pdf xls xlsx ods csv ppt pptx odp md djvu epub fb2 xps");
        Add(ItemCategory.Image, "jpg jpeg png gif bmp webp tif tiff svg ico heic heif raw psd");
        Add(ItemCategory.Video, "mp4 mkv avi mov wmv webm flv m4v mpg mpeg");
        Add(ItemCategory.Audio, "mp3 wav flac ogg m4a aac wma opus");
        Add(ItemCategory.Archive, "zip rar 7z tar gz tgz bz2 xz iso cab");
        return map;
    }
}
