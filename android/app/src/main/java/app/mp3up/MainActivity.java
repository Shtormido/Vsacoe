package app.mp3up;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

/** Окно приложения: веб-версия MP3UP, встроенная в APK. */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQ_FILES = 1;
    private static final int REQ_NOTIFICATIONS = 2;

    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    private WebView web;
    private FrameLayout root;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler ui = new Handler(Looper.getMainLooper());

    /** Файлы, открытые через «Открыть с помощью» / «Поделиться». */
    private final List<Uri> shared = new ArrayList<>();
    private final List<Uri> pendingShare = new ArrayList<>();
    private String pendingAuth = null; // mp3up://spotify-callback?code=…
    private boolean webReady = false;
    private boolean askedNotifications = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#08080C"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#08080C"));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyInsets();
        setSystemBars(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true); // встроенный плеер YouTube

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/shared/", this::openShared)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("audio/*");
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(pick, REQ_FILES);
                } catch (ActivityNotFoundException e) {
                    Intent get = new Intent(Intent.ACTION_GET_CONTENT);
                    get.addCategory(Intent.CATEGORY_OPENABLE);
                    get.setType("audio/*");
                    get.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    try {
                        startActivityForResult(Intent.createChooser(get, "Выберите музыку"), REQ_FILES);
                    } catch (ActivityNotFoundException e2) {
                        fileCallback = null;
                        return false;
                    }
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "MP3UPAndroid");

        collectShared(getIntent());
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    /** Отступы под системные панели (Android 15 рисует приложение на весь экран). */
    private void applyInsets() {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom, left, right;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                top = bars.top; left = bars.left; right = bars.right;
                bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft();
                right = insets.getSystemWindowInsetRight();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
    }

    /** Цвет фона под системными панелями и цвет значков в них — под тему плеера. */
    private void setSystemBars(boolean dark) {
        int color = Color.parseColor(dark ? "#08080C" : "#E9E9F0");
        root.setBackgroundColor(color);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(color);
            w.setNavigationBarColor(color);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : mask, mask);
            }
        } else if (Build.VERSION.SDK_INT >= 23) {
            View d = w.getDecorView();
            int flags = d.getSystemUiVisibility();
            flags = dark ? (flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
            if (Build.VERSION.SDK_INT >= 26) {
                flags = dark ? (flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
            d.setSystemUiVisibility(flags);
        }
    }

    /* ---------- Файлы из других приложений ---------- */

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        collectShared(intent);
        if (webReady) deliverShared();
    }

    private void collectShared(Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null && "mp3up".equals(intent.getData().getScheme())) {
            pendingAuth = intent.getData().toString();
            return;
        }
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            pendingShare.add(intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) pendingShare.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) pendingShare.addAll(list);
        }
        if (intent.getClipData() != null && pendingShare.isEmpty()) {
            ClipData clip = intent.getClipData();
            for (int i = 0; i < clip.getItemCount(); i++) if (clip.getItemAt(i).getUri() != null) pendingShare.add(clip.getItemAt(i).getUri());
        }
    }

    private void deliverShared() {
        if (pendingAuth != null) {
            web.evaluateJavascript("window.mp3upSpotifyCallback && window.mp3upSpotifyCallback(" + JSONObject.quote(pendingAuth) + ")", null);
            pendingAuth = null;
        }
        if (pendingShare.isEmpty()) return;
        try {
            JSONArray arr = new JSONArray();
            for (Uri u : pendingShare) {
                int idx = shared.size();
                shared.add(u);
                JSONObject o = new JSONObject();
                o.put("url", "https://" + HOST + "/shared/" + idx);
                o.put("name", displayName(u));
                String type = getContentResolver().getType(u);
                o.put("type", type != null ? type : "");
                arr.put(o);
            }
            pendingShare.clear();
            web.evaluateJavascript("window.mp3upOpenShared && window.mp3upOpenShared(" + arr + ")", null);
        } catch (Exception ignored) { }
    }

    private String displayName(Uri u) {
        String name = null;
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) { }
        if (name == null) name = u.getLastPathSegment();
        if (name == null) name = "track.mp3";
        return name;
    }

    /** Отдаёт веб-части содержимое открытого файла по адресу /shared/N. */
    private WebResourceResponse openShared(String path) {
        try {
            int idx = Integer.parseInt(path);
            Uri u = shared.get(idx);
            InputStream in = getContentResolver().openInputStream(u);
            String type = getContentResolver().getType(u);
            if (type == null) {
                String ext = MimeTypeMap.getFileExtensionFromUrl(displayName(u));
                type = ext != null ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) : null;
            }
            return new WebResourceResponse(type != null ? type : "application/octet-stream", null, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    /* ---------- Выбор файлов ---------- */

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILES || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                ClipData clip = data.getClipData();
                result = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    /* ---------- Кнопка «Назад» ---------- */

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.mp3upBack ? window.mp3upBack() : false", value -> {
            if ("true".equals(value)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true); // музыка продолжает играть
        });
    }

    /* ---------- Жизненный цикл ---------- */

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (isFinishing()) stopService(new Intent(this, PlaybackService.class));
        web.destroy();
        super.onDestroy();
    }

    /** Команда из уведомления / наушников / экрана блокировки. */
    static void control(String cmd) {
        MainActivity a = current.get();
        if (a == null) return;
        a.ui.post(() -> a.web.evaluateJavascript("window.mp3upControl && window.mp3upControl('" + cmd + "')", null));
    }

    private void askNotificationsOnce() {
        if (askedNotifications || Build.VERSION.SDK_INT < 33) return;
        askedNotifications = true;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    /* ---------- Мост JavaScript → Android ---------- */

    private class Bridge {
        @JavascriptInterface
        public void ready() {
            ui.post(() -> { webReady = true; deliverShared(); });
        }

        @JavascriptInterface
        public void playback(String title, String artist, String album, boolean playing, boolean hasTrack, double positionMs, double durationMs) {
            ui.post(() -> {
                if (!hasTrack) {
                    if (PlaybackService.isRunning()) stopService(new Intent(MainActivity.this, PlaybackService.class));
                    return;
                }
                if (playing) askNotificationsOnce();
                PlaybackService.State st = new PlaybackService.State(title, artist, album, playing, (long) positionMs, (long) durationMs);
                if (PlaybackService.isRunning()) {
                    PlaybackService.update(st);
                } else if (playing) {
                    PlaybackService.setPending(st);
                    Intent i = new Intent(MainActivity.this, PlaybackService.class);
                    if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
                }
            });
        }

        @JavascriptInterface
        public void artwork(String dataUrl) {
            PlaybackService.setArtwork(dataUrl);
        }

        @JavascriptInterface
        public void theme(String theme) {
            ui.post(() -> setSystemBars(!"light".equals(theme)));
        }
    }
}
