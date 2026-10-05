namespace Vsacoe.Core;

/// <summary>Тип ограды.</summary>
public enum FenceKind
{
    /// <summary>Обычная ограда: хранит ссылки на файлы, папки и ярлыки.</summary>
    Standard,

    /// <summary>Портал папки: показывает содержимое папки на диске.</summary>
    FolderPortal,
}

public enum ItemSortMode
{
    Manual,
    Name,
    Type,
    DateModified,
    Size,
}

public enum RuleKind
{
    /// <summary>Список расширений через «;» или «,»: <c>jpg; png; gif</c>.</summary>
    Extension,

    /// <summary>Маски имени через «;»: <c>Отчёт*; *.draft.*</c>.</summary>
    NamePattern,

    /// <summary>Категория файла, см. <see cref="ItemCategory"/>.</summary>
    Category,
}

public enum ItemCategory
{
    Folder,
    Shortcut,
    Application,
    Document,
    Image,
    Video,
    Audio,
    Archive,
    Other,
}

public sealed class FenceConfig
{
    public const string DefaultBackground = "#99202020";

    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = "Новая ограда";
    public FenceKind Kind { get; set; } = FenceKind.Standard;

    // Положение и размер в независимых от DPI единицах WPF.
    public double Left { get; set; } = 100;
    public double Top { get; set; } = 100;
    public double Width { get; set; } = 360;
    public double Height { get; set; } = 240;

    /// <summary>Свёрнута ли ограда до заголовка.</summary>
    public bool RolledUp { get; set; }

    /// <summary>Цвет фона в формате #AARRGGBB.</summary>
    public string Background { get; set; } = DefaultBackground;

    public ItemSortMode SortMode { get; set; } = ItemSortMode.Manual;

    /// <summary>
    /// Ограда «для всего остального»: дополнительно показывает элементы рабочего стола,
    /// которые не лежат ни в одной другой ограде.
    /// </summary>
    public bool IsCatchAll { get; set; }

    /// <summary>Папка, которую отображает портал (только для <see cref="FenceKind.FolderPortal"/>).</summary>
    public string? PortalPath { get; set; }

    /// <summary>Полные пути элементов обычной ограды в пользовательском порядке.</summary>
    public List<string> Items { get; set; } = new();
}

public sealed class SortRule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public bool Enabled { get; set; } = true;
    public RuleKind Kind { get; set; } = RuleKind.Extension;
    public string Pattern { get; set; } = "";
    public Guid TargetFenceId { get; set; }
}

public sealed class AppSettings
{
    public int Version { get; set; } = 1;
    public List<FenceConfig> Fences { get; set; } = new();
    public List<SortRule> Rules { get; set; } = new();

    /// <summary>Скрывать стандартные значки рабочего стола (их заменяют ограды).</summary>
    public bool HideDesktopIcons { get; set; }

    /// <summary>Двойной щелчок по пустому месту рабочего стола скрывает/показывает ограды.</summary>
    public bool QuickHideEnabled { get; set; } = true;

    public bool SnapToGrid { get; set; } = true;
    public int GridSize { get; set; } = 10;
    public int IconSize { get; set; } = 48;

    /// <summary>Автоматически раскладывать новые файлы рабочего стола по правилам.</summary>
    public bool AutoApplyRules { get; set; } = true;

    /// <summary>Запретить перемещение и изменение размера оград.</summary>
    public bool LockFences { get; set; }

    /// <summary>Свёрнутые ограды раскрываются при наведении мыши.</summary>
    public bool ExpandRolledOnHover { get; set; } = true;
}

public sealed class LayoutSnapshot
{
    public string Name { get; set; } = "";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public List<FenceConfig> Fences { get; set; } = new();
}
