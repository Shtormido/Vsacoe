namespace Vsacoe.Core;

/// <summary>Операции над списками элементов обычных оград.</summary>
public static class FenceItemOps
{
    public static bool Contains(FenceConfig fence, string path) =>
        fence.Items.Any(p => PathUtil.Equal(p, path));

    /// <summary>Обычная ограда, в которой явно лежит элемент.</summary>
    public static FenceConfig? FindOwner(IEnumerable<FenceConfig> fences, string path) =>
        fences.FirstOrDefault(f => f.Kind == FenceKind.Standard && Contains(f, path));

    /// <summary>
    /// Кладёт элемент в ограду <paramref name="target"/> на позицию <paramref name="index"/>
    /// (-1 — в конец), убирая его из всех остальных оград. Элемент может жить только в одной ограде.
    /// </summary>
    public static void Move(IEnumerable<FenceConfig> fences, string path, FenceConfig target, int index = -1)
    {
        foreach (var fence in fences)
        {
            if (fence.Kind != FenceKind.Standard || ReferenceEquals(fence, target))
                continue;
            fence.Items.RemoveAll(p => PathUtil.Equal(p, path));
        }

        var existing = target.Items.FindIndex(p => PathUtil.Equal(p, path));
        if (existing >= 0)
        {
            target.Items.RemoveAt(existing);
            if (index > existing)
                index--;
        }

        if (index < 0 || index > target.Items.Count)
            index = target.Items.Count;
        target.Items.Insert(index, path);
    }

    public static bool Remove(FenceConfig fence, string path) =>
        fence.Items.RemoveAll(p => PathUtil.Equal(p, path)) > 0;

    /// <summary>Удаляет элемент (и всё, что было внутри него, если это папка) из всех оград.</summary>
    public static List<FenceConfig> RemovePath(IEnumerable<FenceConfig> fences, string path)
    {
        var changed = new List<FenceConfig>();
        foreach (var fence in fences)
        {
            if (fence.Items.RemoveAll(p => PathUtil.Equal(p, path) || PathUtil.IsUnder(p, path)) > 0)
                changed.Add(fence);
        }
        return changed;
    }

    /// <summary>Обновляет пути после переименования файла или папки.</summary>
    public static List<FenceConfig> RenamePath(IEnumerable<FenceConfig> fences, string oldPath, string newPath)
    {
        var changed = new List<FenceConfig>();
        foreach (var fence in fences)
        {
            var any = false;
            for (var i = 0; i < fence.Items.Count; i++)
            {
                var item = fence.Items[i];
                if (PathUtil.Equal(item, oldPath))
                {
                    fence.Items[i] = newPath;
                    any = true;
                }
                else if (PathUtil.IsUnder(item, oldPath))
                {
                    fence.Items[i] = newPath.TrimEnd('\\', '/') + item.Substring(oldPath.TrimEnd('\\', '/').Length);
                    any = true;
                }
            }
            if (any)
                changed.Add(fence);
        }

        changed.AddRange(RenamePortals(fences, oldPath, newPath).Except(changed));
        return changed;
    }

    private static List<FenceConfig> RenamePortals(IEnumerable<FenceConfig> fences, string oldPath, string newPath)
    {
        var changed = new List<FenceConfig>();
        foreach (var fence in fences)
        {
            if (fence.Kind != FenceKind.FolderPortal || fence.PortalPath is null)
                continue;
            if (PathUtil.Equal(fence.PortalPath, oldPath))
            {
                fence.PortalPath = newPath;
                changed.Add(fence);
            }
            else if (PathUtil.IsUnder(fence.PortalPath, oldPath))
            {
                fence.PortalPath = newPath.TrimEnd('\\', '/') + fence.PortalPath.Substring(oldPath.TrimEnd('\\', '/').Length);
                changed.Add(fence);
            }
        }
        return changed;
    }

    /// <summary>Элементы рабочего стола, которые не лежат ни в одной обычной ограде.</summary>
    public static List<string> GetUnsorted(IEnumerable<string> desktopItems, IEnumerable<FenceConfig> fences)
    {
        var sorted = new HashSet<string>(
            fences.Where(f => f.Kind == FenceKind.Standard).SelectMany(f => f.Items),
            PathUtil.Comparer);
        return desktopItems.Where(p => !sorted.Contains(p)).Distinct(PathUtil.Comparer).ToList();
    }

    /// <summary>
    /// Раскладывает по правилам элементы, ещё не лежащие ни в одной ограде
    /// (элементы в «ограде для всего остального» тоже считаются неразложенными).
    /// </summary>
    /// <returns>Число перемещённых элементов.</returns>
    public static int ApplyRules(AppSettings settings, IEnumerable<(string Path, bool IsDirectory)> items)
    {
        var moved = 0;
        foreach (var (path, isDirectory) in items)
        {
            var owner = FindOwner(settings.Fences, path);
            if (owner != null && !owner.IsCatchAll)
                continue;
            var target = RuleEngine.FindTarget(path, isDirectory, settings.Rules, settings.Fences);
            if (target == null || ReferenceEquals(target, owner))
                continue;
            Move(settings.Fences, path, target);
            moved++;
        }
        return moved;
    }
}
