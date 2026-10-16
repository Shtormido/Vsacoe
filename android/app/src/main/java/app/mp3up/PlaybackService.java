package app.mp3up;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Base64;

/**
 * Фоновое воспроизведение: уведомление с кнопками, управление с наушников
 * и экрана блокировки. Сам звук играет веб-часть, сервис не даёт системе её усыпить.
 */
public class PlaybackService extends Service {

    static final class State {
        final String title, artist, album;
        final boolean playing;
        final long positionMs, durationMs;

        State(String title, String artist, String album, boolean playing, long positionMs, long durationMs) {
            this.title = title; this.artist = artist; this.album = album;
            this.playing = playing; this.positionMs = positionMs; this.durationMs = durationMs;
        }
    }

    private static final String CHANNEL = "playback";
    private static final int NOTIFICATION_ID = 1;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static PlaybackService instance;
    private static State pending;
    private static Bitmap artwork;

    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private State state;

    static boolean isRunning() { return instance != null; }
    static void setPending(State s) { pending = s; }

    static void update(State s) {
        if (instance != null) instance.apply(s);
    }

    static void setArtwork(String dataUrl) {
        Bitmap bmp = null;
        try {
            if (dataUrl != null && dataUrl.startsWith("data:")) {
                byte[] bytes = Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), Base64.DEFAULT);
                bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            }
        } catch (Exception ignored) { }
        final Bitmap result = bmp;
        MAIN.post(() -> {
            artwork = result;
            if (instance != null && instance.state != null) instance.apply(instance.state);
        });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
            ch.setDescription(getString(R.string.channel_desc));
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        session = new MediaSession(this, "MP3UP");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { MainActivity.control("play"); }
            @Override public void onPause() { MainActivity.control("pause"); }
            @Override public void onSkipToNext() { MainActivity.control("next"); }
            @Override public void onSkipToPrevious() { MainActivity.control("prev"); }
            @Override public void onStop() { MainActivity.control("pause"); }
            @Override public void onSeekTo(long pos) { MainActivity.control("seek:" + pos); }
        });
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        session.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE));
        session.setActive(true);
        PowerManager pm = getSystemService(PowerManager.class);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MP3UP:playback");
        wakeLock.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (action != null) MainActivity.control(action);
        State s = state != null ? state : pending;
        if (s == null) s = new State("MP3UP", "", "", false, 0, 0);
        pending = null;
        Notification n = build(s);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTIFICATION_ID, n);
        apply(s);
        return START_NOT_STICKY;
    }

    private void apply(State s) {
        state = s;
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, s.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, s.artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, s.album)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, s.durationMs);
        if (artwork != null) meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        session.setMetadata(meta.build());
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO)
                .setState(s.playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, s.positionMs, s.playing ? 1f : 0f, SystemClock.elapsedRealtime())
                .build());
        if (s.playing) wakeLock.acquire(6 * 60 * 60 * 1000L);
        else if (wakeLock.isHeld()) wakeLock.release();
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, build(s));
    }

    private PendingIntent action(String name, int code) {
        Intent i = new Intent(this, PlaybackService.class).setAction(name);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification build(State s) {
        Context c = this;
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        b.setSmallIcon(R.drawable.ic_stat_note)
                .setContentTitle(s.title)
                .setContentText(s.artist)
                .setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE))
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(s.playing)
                .setShowWhen(false)
                .setColor(0xFF8B5CF6)
                .addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_prev), getString(R.string.prev), action("prev", 1)).build())
                .addAction(s.playing
                        ? new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_pause), getString(R.string.pause), action("pause", 2)).build()
                        : new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_play), getString(R.string.play), action("play", 3)).build())
                .addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_next), getString(R.string.next), action("next", 4)).build())
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        if (artwork != null) b.setLargeIcon(artwork);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // приложение смахнули из списка недавних — останавливаем музыку
        MainActivity.control("pause");
        stopSelf();
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (session != null) { session.setActive(false); session.release(); }
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
