package com.haishiqiguai.quickvocab.playback;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.MediaStyleNotificationHelper;

import com.haishiqiguai.quickvocab.MainActivity;
import com.haishiqiguai.quickvocab.R;

import java.util.Locale;

public class QuickVocabPlaybackService extends MediaSessionService {
    public static final String ACTION_START = "com.haishiqiguai.quickvocab.playback.START";
    public static final String ACTION_PAUSE = "com.haishiqiguai.quickvocab.playback.PAUSE";
    public static final String ACTION_RESUME = "com.haishiqiguai.quickvocab.playback.RESUME";
    public static final String ACTION_STOP = "com.haishiqiguai.quickvocab.playback.STOP";
    public static final String EXTRA_SESSION_ID = "sessionId";

    private static final int NOTIFICATION_ID = 1207;
    private static final String CHANNEL_ID = "quick_vocab_playback";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private MediaSession mediaSession;
    private TextToSpeech textToSpeech;
    private boolean ttsInitialized;
    private boolean ttsReady;
    private long pendingTtsToken = -1;
    private String pendingTtsSessionId;
    private String pendingTtsFailure;
    private PlaybackQueueStateMachine machine;
    private PlaybackSessionConfig config;
    private Player.Listener activePlayerListener;
    private boolean currentAssetPaused;
    private boolean resumeAfterFocusGain;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private BroadcastReceiver noisyReceiver;

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> handler.post(() -> {
        if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
            if (resumeAfterFocusGain) {
                resumeAfterFocusGain = false;
                resumeQueue();
            }
            return;
        }
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            resumeAfterFocusGain = machine != null && machine.state() == PlaybackQueueStateMachine.State.PLAYING;
            pauseQueue();
        } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
            resumeAfterFocusGain = false;
            pauseQueue();
        }
    });

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
            .build(), false);
        player.setHandleAudioBecomingNoisy(false);
        player.setWakeMode(C.WAKE_MODE_LOCAL);
        mediaSession = new MediaSession.Builder(this, player)
            .setSessionActivity(contentIntent())
            .build();
        initializeTts();
        registerNoisyReceiver();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START.equals(action)) startPendingSession();
        else if (ACTION_PAUSE.equals(action) && matchesSession(intent)) pauseQueue();
        else if (ACTION_RESUME.equals(action) && matchesSession(intent)) resumeQueue();
        else if (ACTION_STOP.equals(action) && matchesSession(intent)) stopQueue(true);
        return Service.START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopQueue(true);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onUpdateNotification(MediaSession session, boolean startInForegroundRequired) {
        showNotification();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
        }
        if (noisyReceiver != null) unregisterReceiver(noisyReceiver);
        abandonAudioFocus();
        if (mediaSession != null) mediaSession.release();
        if (player != null) player.release();
        super.onDestroy();
    }

    private void startPendingSession() {
        PlaybackSessionConfig next = PlaybackSessionStore.takePendingConfig();
        if (next == null) {
            stopSelf();
            return;
        }
        cancelCurrentOutput();
        config = next;
        machine = new PlaybackQueueStateMachine(
            next.sessionId,
            next.items,
            next.repeatCount,
            next.intervalMs,
            next.playWord,
            next.playMeaning
        );
        machine.start();
        publishStatus();
        startForeground(NOTIFICATION_ID, buildNotification());
        if (!requestAudioFocus()) {
            failCurrent("无法取得媒体播放权限", machine.sessionId(), machine.token());
            return;
        }
        playCurrentSegment();
    }

    private void playCurrentSegment() {
        if (machine == null || machine.state() != PlaybackQueueStateMachine.State.PLAYING) return;
        PlaybackQueueStateMachine.Segment segment = machine.currentSegment();
        if (segment == null) return;
        String callbackSessionId = machine.sessionId();
        long callbackToken = machine.token();
        currentAssetPaused = false;
        publishStatus();
        showNotification();
        if (segment.kind == PlaybackQueueStateMachine.SegmentKind.DELAY) {
            handler.postDelayed(() -> completeCurrent(callbackSessionId, callbackToken), segment.delayMs);
        } else if (segment.kind == PlaybackQueueStateMachine.SegmentKind.ASSET) {
            String assetPath = segment.assetPath.startsWith("/") ? segment.assetPath.substring(1) : segment.assetPath;
            installPlayerListener(callbackSessionId, callbackToken);
            player.setMediaItem(MediaItem.fromUri("asset:///public/" + assetPath));
            player.setPlaybackParameters(new PlaybackParameters(config.rate));
            player.prepare();
            player.play();
        } else {
            playCurrentSegmentAsTts(callbackSessionId, callbackToken, "手机未安装对应语言语音包");
        }
    }

    private void installPlayerListener(String expectedSessionId, long expectedToken) {
        clearPlayerListener();
        activePlayerListener = new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState != Player.STATE_ENDED) return;
                clearPlayerListener();
                completeCurrent(expectedSessionId, expectedToken);
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                clearPlayerListener();
                playCurrentSegmentAsTts(expectedSessionId, expectedToken, "离线音频损坏，且系统语音不可用");
            }
        };
        player.addListener(activePlayerListener);
    }

    private void clearPlayerListener() {
        if (player != null && activePlayerListener != null) player.removeListener(activePlayerListener);
        activePlayerListener = null;
    }

    private void playCurrentSegmentAsTts(String expectedSessionId, long expectedToken, String failureMessage) {
        if (!isCurrent(expectedSessionId, expectedToken)) return;
        clearPlayerListener();
        player.stop();
        PlaybackQueueStateMachine.Segment segment = machine.currentSegment();
        if (!ttsInitialized) {
            pendingTtsSessionId = expectedSessionId;
            pendingTtsToken = expectedToken;
            pendingTtsFailure = failureMessage;
            return;
        }
        if (!ttsReady || segment == null || textToSpeech == null) {
            failCurrent(failureMessage, expectedSessionId, expectedToken);
            return;
        }
        Locale locale = Locale.forLanguageTag(segment.language);
        if (textToSpeech.isLanguageAvailable(locale) < TextToSpeech.LANG_AVAILABLE) {
            failCurrent(failureMessage, expectedSessionId, expectedToken);
            return;
        }
        textToSpeech.setLanguage(locale);
        textToSpeech.setSpeechRate(config.rate);
        String utteranceId = config.sessionId + ":" + expectedToken;
        Bundle parameters = new Bundle();
        parameters.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
        int result = textToSpeech.speak(segment.text, TextToSpeech.QUEUE_FLUSH, parameters, utteranceId);
        if (result == TextToSpeech.ERROR) failCurrent(failureMessage, expectedSessionId, expectedToken);
    }

    private void completeCurrent(String completedSessionId, long completedToken) {
        if (!isCurrent(completedSessionId, completedToken) || !machine.completeSegment(completedToken)) return;
        publishStatus();
        if (machine.state() == PlaybackQueueStateMachine.State.COMPLETED) {
            finishService(false);
            return;
        }
        playCurrentSegment();
    }

    private void pauseQueue() {
        if (machine == null || machine.state() != PlaybackQueueStateMachine.State.PLAYING) return;
        PlaybackQueueStateMachine.Segment segment = machine.currentSegment();
        currentAssetPaused = segment != null
            && segment.kind == PlaybackQueueStateMachine.SegmentKind.ASSET
            && player.getPlaybackState() != Player.STATE_IDLE;
        machine.pause();
        handler.removeCallbacksAndMessages(null);
        clearPlayerListener();
        if (currentAssetPaused) player.pause(); else player.stop();
        if (textToSpeech != null) textToSpeech.stop();
        publishStatus();
        showNotification();
    }

    private void resumeQueue() {
        if (machine == null || machine.state() != PlaybackQueueStateMachine.State.PAUSED) return;
        machine.resume();
        publishStatus();
        if (currentAssetPaused) {
            currentAssetPaused = false;
            installPlayerListener(machine.sessionId(), machine.token());
            player.play();
            showNotification();
        } else {
            playCurrentSegment();
        }
    }

    private void stopQueue(boolean stopService) {
        if (machine == null) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            if (stopService) stopSelf();
            return;
        }
        cancelCurrentOutput();
        machine.stop();
        publishStatus();
        finishService(stopService);
    }

    private void failCurrent(String message, String sessionId, long token) {
        if (!isCurrent(sessionId, token) || !machine.fail(message, token)) return;
        cancelCurrentOutput();
        publishStatus();
        finishService(false);
    }

    private void finishService(boolean stopService) {
        abandonAudioFocus();
        stopForeground(STOP_FOREGROUND_REMOVE);
        if (stopService || machine == null || machine.state() == PlaybackQueueStateMachine.State.COMPLETED || machine.state() == PlaybackQueueStateMachine.State.FAILED) {
            stopSelf();
        }
    }

    private void cancelCurrentOutput() {
        handler.removeCallbacksAndMessages(null);
        pendingTtsSessionId = null;
        pendingTtsToken = -1;
        pendingTtsFailure = null;
        clearPlayerListener();
        if (player != null) player.stop();
        if (textToSpeech != null) textToSpeech.stop();
    }

    private boolean isCurrent(String sessionId, long token) {
        return machine != null && machine.acceptsCallback(sessionId, token);
    }

    private boolean matchesSession(Intent intent) {
        return machine != null && machine.sessionId().equals(intent.getStringExtra(EXTRA_SESSION_ID));
    }

    private void publishStatus() {
        if (machine == null) return;
        PlaybackSessionStore.saveStatus(this, machine);
        NativePlaybackPlugin.emitStatus(this);
    }

    private void initializeTts() {
        textToSpeech = new TextToSpeech(getApplicationContext(), status -> {
            ttsInitialized = true;
            ttsReady = status == TextToSpeech.SUCCESS;
            String sessionId = pendingTtsSessionId;
            long token = pendingTtsToken;
            String failure = pendingTtsFailure;
            pendingTtsSessionId = null;
            pendingTtsToken = -1;
            pendingTtsFailure = null;
            if (sessionId != null && token >= 0) handler.post(() -> {
                if (ttsReady) playCurrentSegmentAsTts(sessionId, token, failure);
                else failCurrent(failure, sessionId, token);
            });
        });
        textToSpeech.setAudioAttributes(new android.media.AudioAttributes.Builder()
            .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
            .build());
        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {}
            @Override public void onDone(String utteranceId) {
                handler.post(() -> completeTtsUtterance(utteranceId, false));
            }
            @Override public void onError(String utteranceId) {
                handler.post(() -> completeTtsUtterance(utteranceId, true));
            }
        });
    }

    private void completeTtsUtterance(String utteranceId, boolean failed) {
        try {
            int separator = utteranceId.lastIndexOf(':');
            String sessionId = utteranceId.substring(0, separator);
            long token = Long.parseLong(utteranceId.substring(separator + 1));
            if (failed) failCurrent("手机系统语音朗读失败", sessionId, token);
            else completeCurrent(sessionId, token);
        } catch (RuntimeException ignored) {}
    }

    private boolean requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build())
                .setOnAudioFocusChangeListener(focusListener, handler)
                .build();
            return audioManager.requestAudioFocus(audioFocusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
            == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(focusListener);
        }
    }

    private void registerNoisyReceiver() {
        noisyReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                resumeAfterFocusGain = false;
                pauseQueue();
            }
        };
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisyReceiver, filter);
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "单词播放", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("锁屏和后台连续朗读单词");
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        boolean paused = machine != null && machine.state() == PlaybackQueueStateMachine.State.PAUSED;
        String title = machine == null || machine.currentWordId() == null ? "速记单词" : "正在播放 · " + currentTerm();
        NotificationCompat.Action toggleAction = paused
            ? new NotificationCompat.Action(android.R.drawable.ic_media_play, "继续", serviceIntent(ACTION_RESUME, 1))
            : new NotificationCompat.Action(android.R.drawable.ic_media_pause, "暂停", serviceIntent(ACTION_PAUSE, 1));
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(paused ? "已暂停" : "锁屏后将继续朗读")
            .setContentIntent(contentIntent())
            .setDeleteIntent(serviceIntent(ACTION_STOP, 2))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(toggleAction)
            .addAction(new NotificationCompat.Action(android.R.drawable.ic_menu_close_clear_cancel, "停止", serviceIntent(ACTION_STOP, 2)))
            .setStyle(new MediaStyleNotificationHelper.MediaStyle(mediaSession).setShowActionsInCompactView(0, 1))
            .build();
    }

    private String currentTerm() {
        if (machine == null || machine.currentSegment() == null) return "速记单词";
        PlaybackQueueStateMachine.Segment segment = machine.currentSegment();
        return "en-US".equals(segment.language) ? segment.text : machine.currentWordId();
    }

    private void showNotification() {
        if (machine == null || machine.state() == PlaybackQueueStateMachine.State.IDLE
            || machine.state() == PlaybackQueueStateMachine.State.COMPLETED
            || machine.state() == PlaybackQueueStateMachine.State.FAILED) return;
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, buildNotification());
    }

    private PendingIntent contentIntent() {
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent serviceIntent(String action, int requestCode) {
        Intent intent = new Intent(this, QuickVocabPlaybackService.class).setAction(action);
        if (machine != null) intent.putExtra(EXTRA_SESSION_ID, machine.sessionId());
        return PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
