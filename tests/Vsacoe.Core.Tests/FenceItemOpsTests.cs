using Vsacoe.Core;

namespace Vsacoe.Core.Tests;

public class FenceItemOpsTests
{
    [Fact]
    public void MoveRemovesFromOtherFencesAndInserts()
    {
        var a = new FenceConfig { Items = { "x", "y" } };
        var b = new FenceConfig { Items = { "z" } };
        FenceItemOps.Move(new[] { a, b }, "X", b, 0);
        Assert.Equal(new[] { "y" }, a.Items);
        Assert.Equal(new[] { "X", "z" }, b.Items);
    }

    [Theory]
    [InlineData(0, 3, new[] { "b", "c", "a" })]
    [InlineData(0, 2, new[] { "b", "a", "c" })]
    [InlineData(2, 0, new[] { "c", "a", "b" })]
    [InlineData(1, -1, new[] { "a", "c", "b" })]
    public void ReorderWithinFence(int from, int to, string[] expected)
    {
        var f = new FenceConfig { Items = { "a", "b", "c" } };
        FenceItemOps.Move(new[] { f }, f.Items[from], f, to);
        Assert.Equal(expected, f.Items);
    }

    [Fact]
    public void RenameUpdatesItemChildrenAndPortals()
    {
        var sep = Path.DirectorySeparatorChar;
        var dir = $"D{sep}Old";
        var f = new FenceConfig { Items = { dir, $"{dir}{sep}file.txt", $"D{sep}Older" } };
        var portal = new FenceConfig { Kind = FenceKind.FolderPortal, PortalPath = $"{dir}{sep}Sub" };

        var changed = FenceItemOps.RenamePath(new[] { f, portal }, dir, $"D{sep}New");

        Assert.Equal(new[] { $"D{sep}New", $"D{sep}New{sep}file.txt", $"D{sep}Older" }, f.Items);
        Assert.Equal($"D{sep}New{sep}Sub", portal.PortalPath);
        Assert.Equal(2, changed.Count);
    }

    [Fact]
    public void RemovePathRemovesChildren()
    {
        var sep = Path.DirectorySeparatorChar;
        var f = new FenceConfig { Items = { "dir", $"dir{sep}a", "dir2" } };
        FenceItemOps.RemovePath(new[] { f }, "DIR");
        Assert.Equal(new[] { "dir2" }, f.Items);
    }

    [Fact]
    public void UnsortedIgnoresPortalsAndIsCaseInsensitive()
    {
        var f = new FenceConfig { Items = { "A" } };
        var portal = new FenceConfig { Kind = FenceKind.FolderPortal, Items = { "b" } };
        var result = FenceItemOps.GetUnsorted(new[] { "a", "b", "c", "C" }, new[] { f, portal });
        Assert.Equal(new[] { "b", "c" }, result);
    }

    [Fact]
    public void ApplyRulesMovesUnsortedAndCatchAllItemsOnly()
    {
        var images = new FenceConfig { Title = "Images" };
        var manual = new FenceConfig { Items = { "kept.png" } };
        var catchAll = new FenceConfig { IsCatchAll = true, Items = { "c.png" } };
        var settings = new AppSettings
        {
            Fences = { images, manual, catchAll },
            Rules = { new SortRule { Kind = RuleKind.Extension, Pattern = "png", TargetFenceId = images.Id } },
        };

        var moved = FenceItemOps.ApplyRules(settings, new[] { ("new.png", false), ("kept.png", false), ("c.png", false), ("doc.txt", false) });

        Assert.Equal(2, moved);
        Assert.Equal(new[] { "new.png", "c.png" }, images.Items);
        Assert.Equal(new[] { "kept.png" }, manual.Items);
        Assert.Empty(catchAll.Items);
    }
}
