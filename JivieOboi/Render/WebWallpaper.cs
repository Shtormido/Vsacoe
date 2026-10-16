using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace JivieOboi;

/// <summary>
/// Обои на движке Chromium (WebView2): HTML-обои, сайты и видео.
/// Подключает JS-API Wallpaper Engine, поэтому веб-обои из его мастерской работают как есть:
/// wallpaperPropertyListener (applyUserProperties / applyGeneralProperties / setPaused)
/// и wallpaperRegisterAudioListener (128 значений спектра).
/// </summary>
internal sealed class WebWallpaper : Grid, IDisposable
{
    const string WebHost = "wallpaper.jivie";
    const string MediaHost = "media.jivie";

    static Task<CoreWebView2Environment>? environment;
    static readonly Lazy<bool> available = new(() =>
    {
        try { return !string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString()); }
        catch { return false; }
    });

    /// <summary>Папка профиля WebView2. Заставка (.scr) — отдельный процесс, ей нужна своя.</summary>
    public static string DataFolderName { get; set; } = "WebView2";

    /// <summary>Установлен ли WebView2 Runtime (в Windows 11 он есть всегда).</summary>
    public static bool IsAvailable => available.Value;

    readonly WebView2 view = new();
    readonly WallpaperItem item;
    readonly Settings settings;
    readonly bool soundAllowed;
    readonly bool capturePreview;
    CoreWebView2? core;
    bool audioWanted, paused, suspended, disposed;

    public event Action<BitmapSource>? PreviewCaptured;

    public WebWallpaper(WallpaperItem item, Settings settings, bool soundAllowed, bool capturePreview)
    {
        this.item = item;
        this.settings = settings;
        this.soundAllowed = soundAllowed;
        this.capturePreview = capturePreview;
        view.DefaultBackgroundColor = System.Drawing.Color.Black;
        Children.Add(view);
        Loaded += async (_, _) => await InitAsync();
    }

    static Task<CoreWebView2Environment> Environment() => environment ??= CoreWebView2Environment.CreateAsync(
        null,
        Path.Combine(JivieOboi.Settings.Dir, DataFolderName),
        new CoreWebView2EnvironmentOptions(
            "--autoplay-policy=no-user-gesture-required " +
            "--disable-features=HardwareMediaKeyHandling,msSmartScreenProtection"));

    async Task InitAsync()
    {
        if (core != null || disposed) return;
        try
        {
            await view.EnsureCoreWebView2Async(await Environment());
            if (disposed) return;
            core = view.CoreWebView2;
            var s = core.Settings;
            s.AreDefaultContextMenusEnabled = false;
            s.AreDevToolsEnabled = false;
            s.IsStatusBarEnabled = false;
            s.IsZoomControlEnabled = false;
            s.AreBrowserAcceleratorKeysEnabled = false;
            core.IsMuted = !soundAllowed || settings.Volume <= 0;

            await core.AddScriptToExecuteOnDocumentCreatedAsync(Shim);
            core.WebMessageReceived += (_, e) =>
            {
                if (e.TryGetWebMessageAsString() == "audio") audioWanted = true;
            };
            core.NewWindowRequested += (_, e) => e.Handled = true; // никаких всплывающих окон
            core.NavigationCompleted += OnNavigationCompleted;
            Navigate(core);
        }
        catch (Exception ex)
        {
            Log.Error("WebView2: " + item.Title, ex);
            Children.Add(new TextBlock
            {
                Text = "Не удалось запустить WebView2: " + ex.Message,
                Foreground = System.Windows.Media.Brushes.White,
                Margin = new Thickness(24),
                VerticalAlignment = VerticalAlignment.Bottom,
            });
        }
    }

    void Navigate(CoreWebView2 c)
    {
        switch (item.Type)
        {
            case WallpaperType.Video:
            {
                var folder = Path.GetDirectoryName(item.Path!)!;
                c.SetVirtualHostNameToFolderMapping(MediaHost, folder, CoreWebView2HostResourceAccessKind.Allow);
                c.NavigateToString(VideoPage(Path.GetFileName(item.Path!)));
                break;
            }
            case WallpaperType.Web:
            {
                var folder = Path.GetDirectoryName(item.Path!)!;
                c.SetVirtualHostNameToFolderMapping(WebHost, folder, CoreWebView2HostResourceAccessKind.Allow);
                c.Navigate($"https://{WebHost}/{Uri.EscapeDataString(Path.GetFileName(item.Path!))}");
                break;
            }
            default:
                c.Navigate(item.Path ?? "about:blank");
                break;
        }
    }

    string VideoPage(string file)
    {
        var fit = settings.Stretch switch { "Uniform" => "contain", "Fill" => "fill", _ => "cover" };
        var src = $"https://{MediaHost}/{Uri.EscapeDataString(file)}";
        var volume = Math.Clamp(settings.Volume, 0, 1).ToString(CultureInfo.InvariantCulture);
        var muted = (!soundAllowed || settings.Volume <= 0) ? "true" : "false";
        return $$"""
            <!doctype html><html><head><meta charset="utf-8"><style>
            html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}
            video{width:100%;height:100%;object-fit:{{fit}};display:block}
            </style></head><body>
            <video id="v" src="{{WebUtility.HtmlEncode(src)}}" autoplay loop muted playsinline disablepictureinpicture></video>
            <script>const v=document.getElementById('v');v.volume={{volume}};v.muted={{muted}};v.play().catch(()=>{});</script>
            </body></html>
            """;
    }

    async void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess || core == null) return;
        Post($"{{\"t\":\"general\",\"d\":{{\"fps\":{settings.SceneFps}}}}}");
        ApplyProperties();
        Post($"{{\"t\":\"pause\",\"d\":{(paused ? "true" : "false")}}}");

        // Превью для библиотеки — снимок через пару секунд после загрузки.
        if (capturePreview && item.Preview == null && !File.Exists(Thumbnails.CachePath(item)))
        {
            await Task.Delay(3000);
            var frame = await CaptureAsync();
            if (frame != null) PreviewCaptured?.Invoke(frame);
        }
    }

    void Post(string json)
    {
        if (core == null || disposed) return;
        try { core.PostWebMessageAsJson(json); }
        catch (Exception ex) { Log.Error("WebView2 сообщение", ex); }
    }

    public void ApplyProperties()
    {
        if (item.Properties.Count > 0) Post($"{{\"t\":\"props\",\"d\":{item.UserPropertiesJson()}}}");
    }

    public void ApplyVolume(double volume)
    {
        if (core == null) return;
        core.IsMuted = !soundAllowed || volume <= 0;
        Post($"{{\"t\":\"vol\",\"d\":{Math.Clamp(volume, 0, 1).ToString(CultureInfo.InvariantCulture)}}}");
    }

    public void PushAudio(float[] values)
    {
        if (!audioWanted || paused || core == null) return;
        var sb = new StringBuilder(values.Length * 6 + 24);
        sb.Append("{\"t\":\"audio\",\"d\":[");
        for (int i = 0; i < values.Length; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(values[i].ToString("0.###", CultureInfo.InvariantCulture));
        }
        sb.Append("]}");
        Post(sb.ToString());
    }

    public void PushMouse(string type, double x, double y, int button)
    {
        if (paused || core == null) return;
        Post(string.Create(CultureInfo.InvariantCulture,
            $"{{\"t\":\"mouse\",\"e\":\"{type}\",\"x\":{x:0.#},\"y\":{y:0.#},\"b\":{button}}}"));
    }

    /// <summary>
    /// <paramref name="deep"/> — экран не виден (игра, блокировка): WebView2 скрывается и замораживается,
    /// процессор и видеокарта не тратятся вообще. Иначе — только пауза в самой странице.
    /// </summary>
    public async void SetPaused(bool value, bool deep)
    {
        paused = value;
        if (core == null) return;
        Post($"{{\"t\":\"pause\",\"d\":{(value ? "true" : "false")}}}");
        try
        {
            if (value && deep && !suspended)
            {
                suspended = true;
                view.Visibility = Visibility.Hidden;
                await core.TrySuspendAsync();
            }
            else if (!(value && deep) && suspended)
            {
                suspended = false;
                core.Resume();
                view.Visibility = Visibility.Visible;
            }
        }
        catch (Exception ex)
        {
            Log.Error("WebView2 пауза", ex);
        }
    }

    public async Task<BitmapSource?> CaptureAsync()
    {
        if (core == null || suspended || disposed) return null;
        try
        {
            using var stream = new MemoryStream();
            await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
            stream.Position = 0;
            var frame = BitmapFrame.Create(stream, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
            frame.Freeze();
            return frame;
        }
        catch (Exception ex)
        {
            Log.Error("WebView2 снимок", ex);
            return null;
        }
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        try { view.Dispose(); }
        catch (Exception ex) { Log.Error("WebView2 закрытие", ex); }
    }

    /// <summary>JS-прослойка: API Wallpaper Engine + приём событий мыши, звука, паузы.</summary>
    const string Shim = """
        (() => {
          if (window.__jivie) return; window.__jivie = true;
          const audio = []; let listener = null, props = null, paused = null, general = null;
          const call = (o, name, arg) => { try { if (o && typeof o[name] === 'function') o[name](arg); } catch (e) { console.error(e); } };
          Object.defineProperty(window, 'wallpaperPropertyListener', {
            configurable: true,
            get: () => listener,
            set: v => {
              listener = v;
              if (general) call(v, 'applyGeneralProperties', general);
              if (props) call(v, 'applyUserProperties', props);
              if (paused !== null) call(v, 'setPaused', paused);
            }
          });
          window.wallpaperRegisterAudioListener = f => { audio.push(f); window.chrome?.webview?.postMessage('audio'); };
          for (const n of ['MediaStatus', 'MediaProperties', 'MediaThumbnail', 'MediaPlayback', 'MediaTimeline'])
            window['wallpaperRegister' + n + 'Listener'] = () => {};

          let down = false, downX = 0, downY = 0;
          const fire = (type, x, y, b) => {
            const el = document.elementFromPoint(x, y) || document.body || document.documentElement;
            if (!el) return;
            const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
                           screenX: x, screenY: y, button: b, buttons: down ? (b === 2 ? 2 : 1) : 0, view: window };
            const p = { mousemove: 'pointermove', mousedown: 'pointerdown', mouseup: 'pointerup' }[type];
            if (p) el.dispatchEvent(new PointerEvent(p, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
            el.dispatchEvent(new MouseEvent(type, init));
          };

          window.chrome?.webview?.addEventListener('message', ev => {
            const m = ev.data;
            if (!m || typeof m !== 'object') return;
            switch (m.t) {
              case 'audio':
                for (const f of audio) { try { f(m.d); } catch (e) { console.error(e); } }
                break;
              case 'props':
                props = Object.assign(props || {}, m.d);
                call(listener, 'applyUserProperties', m.d);
                break;
              case 'general':
                general = m.d;
                call(listener, 'applyGeneralProperties', m.d);
                break;
              case 'pause':
                paused = m.d;
                call(listener, 'setPaused', m.d);
                document.querySelectorAll('video,audio').forEach(v => {
                  if (m.d) { v.dataset.jivieWasPlaying = String(!v.paused); v.pause(); }
                  else if (v.dataset.jivieWasPlaying !== 'false') v.play().catch(() => {});
                });
                break;
              case 'vol':
                document.querySelectorAll('video,audio').forEach(v => { v.volume = m.d; v.muted = m.d <= 0; });
                break;
              case 'mouse':
                if (m.e === 'mousedown') { down = true; downX = m.x; downY = m.y; }
                fire(m.e, m.x, m.y, m.b);
                if (m.e === 'mouseup') {
                  const wasDown = down; down = false;
                  if (wasDown && Math.abs(m.x - downX) + Math.abs(m.y - downY) < 6) fire(m.b === 2 ? 'contextmenu' : 'click', m.x, m.y, m.b);
                }
                break;
            }
          });
        })();
        """;
}
