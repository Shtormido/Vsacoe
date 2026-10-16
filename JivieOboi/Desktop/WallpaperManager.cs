using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace JivieOboi;

/// <summary>
/// Обои на рабочем столе: по окну на монитор (или одно на все), плейлист,
/// пауза, звук для реагирующих обоев и мышь для интерактивных.
/// </summary>
internal sealed class WallpaperManager
{
    readonly Settings s;
    readonly LibraryStore library;
    readonly List<DesktopWallpaper> walls = new();
    readonly DispatcherTimer playlistTimer = new();
    readonly Random random = new();
    DesktopTarget? target;
    MouseForwarder? mouse;
    int playlistIndex;
    bool paused = true, deep;
    string buildSignature = "";

    public event Action? Changed;
    public event Action<string>? Problem;

    public WallpaperManager(Settings settings, LibraryStore library)
    {
        s = settings;
        this.library = library;
        playlistTimer.Tick += (_, _) => NextInPlaylist();
        AudioSpectrum.Instance.Updated += values =>
        {
            foreach (var w in walls) w.View.PushAudio(values);
        };
    }

    public IReadOnlyList<DesktopWallpaper> Walls => walls;

    public WallpaperView? PrimaryView => (walls.FirstOrDefault(w => w.Slot.Primary) ?? walls.FirstOrDefault())?.View;

    /// <summary>Какие обои сейчас на этой области (с учётом плейлиста).</summary>
    public WallpaperItem ItemFor(WallpaperSlot slot)
    {
        if (s.PlaylistEnabled)
        {
            var list = s.Playlist.Where(id => library.Find(id) != null).ToList();
            if (list.Count > 0)
            {
                int offset = s.Mode == "per" ? WallpaperSlot.Monitors().FindIndex(m => m.Key == slot.Key) : 0;
                return library.Resolve(list[(playlistIndex + Math.Max(0, offset)) % list.Count]);
            }
        }
        return library.Resolve(s.WallpaperFor(slot.Key));
    }

    /// <summary>
    /// Создать окна обоев. Без <paramref name="force"/> уже работающие обои, которые не поменялись,
    /// не пересоздаются — видео на других мониторах не начинается заново.
    /// </summary>
    public void Build(bool force = false)
    {
        var newTarget = DesktopHost.Find();
        if (newTarget is null)
        {
            DisposeAll();
            Problem?.Invoke("Не найден рабочий стол Explorer. Попробую ещё раз позже.");
            return;
        }

        var signature = $"{s.Stretch}|{s.SceneFps}|{s.VideoEngine}|{s.Mode}";
        if (force || newTarget != target || signature != buildSignature) DisposeAll();
        target = newTarget;
        buildSignature = signature;

        var slots = WallpaperSlot.Current(s);
        foreach (var old in walls.ToList())
        {
            var slot = slots.FirstOrDefault(x => x.Key == old.Slot.Key);
            if (slot == null || slot.Bounds != old.Slot.Bounds || ItemFor(slot).Id != old.View.Item.Id || !Native.IsWindow(old.Handle))
            {
                old.Dispose();
                walls.Remove(old);
            }
        }

        foreach (var slot in slots)
        {
            if (walls.Any(w => w.Slot.Key == slot.Key)) continue;
            try
            {
                var view = new WallpaperView(ItemFor(slot), s, soundAllowed: slot.Primary, desktopRole: true);
                view.PreviewCaptured += OnPreviewCaptured;
                walls.Add(new DesktopWallpaper(target.Value, slot, view));
            }
            catch (Exception ex)
            {
                Log.Error("Обои на " + slot.Title, ex);
            }
        }

        ApplyPause();
        UpdateMouse();
        ApplyPlaylistTimer();
        Changed?.Invoke();
    }

    void DisposeAll()
    {
        foreach (var w in walls) w.Dispose();
        walls.Clear();
    }

    public void Shutdown()
    {
        playlistTimer.Stop();
        mouse?.Dispose();
        mouse = null;
        DisposeAll();
        AudioSpectrum.Instance.SetActive(false);
    }

    // ── назначение обоев ──

    /// <summary>
    /// Поставить обои. <paramref name="targetKey"/>: "same" — на все мониторы, "span" — растянуть,
    /// иначе — имя монитора.
    /// </summary>
    public void Apply(WallpaperItem item, string targetKey)
    {
        switch (targetKey)
        {
            case "same":
                s.Mode = "same";
                s.CurrentId = item.Id;
                break;
            case WallpaperSlot.SpanKey:
                s.Mode = "span";
                s.CurrentId = item.Id;
                break;
            default:
                if (s.Mode != "per")
                {
                    foreach (var m in WallpaperSlot.Monitors()) s.Assignments[m.Key] = s.CurrentId;
                    s.Mode = "per";
                }
                s.Assignments[targetKey] = item.Id;
                break;
        }
        s.PlaylistEnabled = false; // явный выбор важнее плейлиста
        s.Save();
        Build();
    }

    public void ApplyProperties(WallpaperItem item)
    {
        foreach (var w in walls.Where(w => w.View.Item.Id == item.Id)) w.View.ApplyProperties();
    }

    public void ApplyVolume()
    {
        foreach (var w in walls) w.View.ApplyVolume(s.Volume);
    }

    void OnPreviewCaptured(WallpaperItem item, BitmapSource frame)
    {
        Thumbnails.Store(item, frame);
        library.NotifyChanged();
    }

    // ── плейлист ──

    public void ApplyPlaylistTimer()
    {
        playlistTimer.Stop();
        if (!s.PlaylistEnabled || s.Playlist.Count < 2) return;
        playlistTimer.Interval = TimeSpan.FromMinutes(Math.Max(1, s.PlaylistMinutes));
        playlistTimer.Start();
    }

    public void NextInPlaylist()
    {
        if (!s.PlaylistEnabled || s.Playlist.Count == 0) return;
        playlistIndex = s.PlaylistShuffle ? random.Next(s.Playlist.Count) : playlistIndex + 1;
        Build();
    }

    // ── пауза, звук, мышь ──

    public void SetPaused(bool value, bool deepPause)
    {
        paused = value;
        deep = value && deepPause;
        ApplyPause();
    }

    void ApplyPause()
    {
        foreach (var w in walls) w.View.SetPaused(paused, deep);
    }

    public bool IsActive => !paused && walls.Count > 0;

    void UpdateMouse()
    {
        bool need = s.Interactive && walls.Any(w => w.View.IsWeb);
        if (need && mouse == null)
        {
            mouse = new MouseForwarder();
            mouse.Mouse += OnMouse;
        }
        else if (!need && mouse != null)
        {
            mouse.Dispose();
            mouse = null;
        }
    }

    public void SetInteractive() => UpdateMouse();

    void OnMouse(string type, Point screen, int button)
    {
        if (paused) return;
        var wall = walls.FirstOrDefault(w => w.Slot.Bounds.Contains((int)screen.X, (int)screen.Y));
        if (wall == null || !wall.View.IsWeb) return;
        try
        {
            var local = wall.View.PointFromScreen(screen);
            wall.View.PushMouse(type, local.X, local.Y, button);
        }
        catch
        {
            // Окно ещё не показано.
        }
    }

    /// <summary>
    /// Explorer мог перестроить рабочий стол (перезапуск, смена темы, слайд-шоу фона в Windows 11):
    /// следим, что наши окна живы и стоят на месте. Возвращает false, если нужно пересоздать окна.
    /// </summary>
    public bool CheckDesktop()
    {
        if (target is not DesktopTarget t) return false;
        if (!Native.IsWindow(t.Parent) || walls.Exists(w => !Native.IsWindow(w.Handle))) return false;
        DesktopHost.EnsureWorkerAtBottom(t);
        return true;
    }
}
