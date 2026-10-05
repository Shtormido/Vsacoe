using Vsacoe.Core;

namespace Vsacoe.Core.Tests;

public class MiscTests
{
    [Fact]
    public void SnapToGridAndEdges()
    {
        var work = new RectD(0, 0, 1000, 800);
        var r = SnapMath.SnapPosition(new RectD(104, 203, 200, 100), work, Array.Empty<RectD>(), 10, true);
        Assert.Equal(100, r.X);
        Assert.Equal(200, r.Y);

        // Край экрана сильнее сетки.
        r = SnapMath.SnapPosition(new RectD(7, 795 - 100, 200, 100), work, Array.Empty<RectD>(), 50, true);
        Assert.Equal(0, r.X);
        Assert.Equal(700, r.Y);

        // Прилипание к соседней ограде справа.
        var other = new RectD(300, 300, 100, 100);
        r = SnapMath.SnapPosition(new RectD(405, 310, 100, 100), work, new[] { other }, 1, false);
        Assert.Equal(400, r.X);
        Assert.Equal(300, r.Y);

        // Не уезжает за экран.
        r = SnapMath.SnapPosition(new RectD(-500, 2000, 100, 100), work, Array.Empty<RectD>(), 1, false);
        Assert.Equal(new RectD(0, 700, 100, 100), r);
    }

    [Fact]
    public void NaturalSort()
    {
        var names = new[] { "file10", "File2", "file1", "a" };
        Assert.Equal(new[] { "a", "file1", "File2", "file10" }, names.OrderBy(n => n, NaturalComparer.Instance));
    }

    [Fact]
    public void SortByNamePutsFoldersFirst()
    {
        var items = new[]
        {
            new FileEntryInfo("b.txt", "b.txt", false, DateTime.MinValue, 1),
            new FileEntryInfo("Z", "Z", true, DateTime.MinValue, 0),
            new FileEntryInfo("a.txt", "a.txt", false, DateTime.MinValue, 5),
        };
        Assert.Equal(new[] { "Z", "a.txt", "b.txt" }, ItemSorter.Sort(items, ItemSortMode.Name, x => x).Select(x => x.Name));
        Assert.Equal(new[] { "b.txt", "Z", "a.txt" }, ItemSorter.Sort(items, ItemSortMode.Manual, x => x).Select(x => x.Name));
    }

    [Fact]
    public void DisplayNameHidesShortcutExtensions()
    {
        Assert.Equal("Chrome", PathUtil.DisplayName(Path.Combine("d", "Chrome.lnk")));
        Assert.Equal("site", PathUtil.DisplayName(Path.Combine("d", "site.URL")));
        Assert.Equal("doc.txt", PathUtil.DisplayName(Path.Combine("d", "doc.txt")));
    }

    [Fact]
    public void ConfigRoundTripAndSnapshots()
    {
        var dir = Path.Combine(Path.GetTempPath(), "vsacoe-test-" + Guid.NewGuid());
        try
        {
            var store = new ConfigStore(dir);
            Assert.Empty(store.Load().Fences);

            var fence = new FenceConfig { Title = "Работа", Items = { "a", "A", "b" }, Kind = FenceKind.Standard, RolledUp = true };
            var settings = new AppSettings { Fences = { fence }, IconSize = 64 };
            store.Save(settings);

            var loaded = store.Load();
            Assert.Equal("Работа", loaded.Fences[0].Title);
            Assert.Equal(new[] { "a", "b" }, loaded.Fences[0].Items); // дубликаты убраны
            Assert.True(loaded.Fences[0].RolledUp);
            Assert.Equal(64, loaded.IconSize);

            store.SaveSnapshot("Мой: макет", settings.Fences);
            var snaps = store.ListSnapshots();
            Assert.Single(snaps);
            Assert.Equal("Мой: макет", snaps[0].Snapshot.Name);
            Assert.NotSame(fence, snaps[0].Snapshot.Fences[0]);
            store.DeleteSnapshot(snaps[0].FilePath);
            Assert.Empty(store.ListSnapshots());

            File.WriteAllText(store.SettingsPath, "{ broken");
            Assert.Empty(store.Load().Fences);
            Assert.Contains(Directory.GetFiles(dir), f => f.Contains(".broken-"));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
