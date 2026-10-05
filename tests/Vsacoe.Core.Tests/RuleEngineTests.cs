using Vsacoe.Core;

namespace Vsacoe.Core.Tests;

public class RuleEngineTests
{
    private static string P(string name) => Path.Combine("desk", name);

    [Theory]
    [InlineData("jpg; png", "photo.PNG", true)]
    [InlineData(".jpg,.png", "photo.jpg", true)]
    [InlineData("*.jpg", "photo.jpg", true)]
    [InlineData("jpg", "photo.jpeg", false)]
    [InlineData("jpg", "noext", false)]
    public void Extension(string pattern, string file, bool expected)
    {
        var rule = new SortRule { Kind = RuleKind.Extension, Pattern = pattern };
        Assert.Equal(expected, RuleEngine.Matches(rule, P(file), isDirectory: false));
    }

    [Fact]
    public void ExtensionNeverMatchesFolders()
    {
        var rule = new SortRule { Kind = RuleKind.Extension, Pattern = "zip" };
        Assert.False(RuleEngine.Matches(rule, P("backup.zip"), isDirectory: true));
    }

    [Theory]
    [InlineData("Отчёт*", "отчёт за май.docx", true)]
    [InlineData("*.draft.*; tmp?", "tmp1", true)]
    [InlineData("a?c", "abbc", false)]
    [InlineData("(x)*", "(x) file", true)]
    public void NamePattern(string pattern, string file, bool expected)
    {
        var rule = new SortRule { Kind = RuleKind.NamePattern, Pattern = pattern };
        Assert.Equal(expected, RuleEngine.Matches(rule, P(file), isDirectory: false));
    }

    [Theory]
    [InlineData("Shortcut", "Chrome.lnk", false, true)]
    [InlineData("ярлыки", "Chrome.lnk", false, true)]
    [InlineData("Изображения; видео", "clip.mp4", false, true)]
    [InlineData("Папка", "Projects", true, true)]
    [InlineData("Document", "Projects", true, false)]
    [InlineData("нет-такой", "a.txt", false, false)]
    public void Category(string pattern, string file, bool isDir, bool expected)
    {
        var rule = new SortRule { Kind = RuleKind.Category, Pattern = pattern };
        Assert.Equal(expected, RuleEngine.Matches(rule, P(file), isDir));
    }

    [Fact]
    public void FindTargetUsesFirstEnabledRuleWithExistingStandardFence()
    {
        var portal = new FenceConfig { Kind = FenceKind.FolderPortal };
        var images = new FenceConfig { Title = "Images" };
        var all = new FenceConfig { Title = "All" };
        var rules = new List<SortRule>
        {
            new() { Kind = RuleKind.Extension, Pattern = "png", TargetFenceId = Guid.NewGuid() }, // ограды нет
            new() { Kind = RuleKind.Extension, Pattern = "png", TargetFenceId = portal.Id },      // портал
            new() { Kind = RuleKind.Extension, Pattern = "png", TargetFenceId = all.Id, Enabled = false },
            new() { Kind = RuleKind.Category, Pattern = "Image", TargetFenceId = images.Id },
            new() { Kind = RuleKind.NamePattern, Pattern = "*", TargetFenceId = all.Id },
        };
        var fences = new[] { portal, images, all };

        Assert.Same(images, RuleEngine.FindTarget(P("a.png"), false, rules, fences));
        Assert.Same(all, RuleEngine.FindTarget(P("a.txt"), false, rules, fences));
        Assert.Null(RuleEngine.FindTarget(PathUtil.RecycleBin, false, rules, fences));
    }
}
