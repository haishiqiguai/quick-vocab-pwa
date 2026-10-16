package com.haishiqiguai.quickvocab.playback;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "NativePlayback")
public class NativePlaybackPlugin extends Plugin {
    private static WeakReference<NativePlaybackPlugin> activePlugin = new WeakReference<>(null);

    @Override
    public void load() {
        activePlugin = new WeakReference<>(this);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            String sessionId = requiredString(call, "sessionId");
            JSArray values = call.getArray("items");
            if (values == null || values.length() == 0) {
                call.reject("播放队列为空");
                return;
            }
            List<PlaybackQueueStateMachine.Item> items = new ArrayList<>();
            for (int index = 0; index < values.length(); index++) {
                JSONObject item = values.getJSONObject(index);
                items.add(new PlaybackQueueStateMachine.Item(
                    item.getString("wordId"),
                    item.getInt("studyIndex"),
                    item.getString("term"),
                    item.getString("meaning"),
                    optionalString(item, "englishAssetPath"),
                    optionalString(item, "meaningAssetPath")
                ));
            }
            PlaybackSessionStore.setPendingConfig(new PlaybackSessionConfig(
                sessionId,
                items,
                Math.max(1, call.getInt("repeatCount", 1)),
                Math.max(0, call.getInt("intervalMs", 0)),
                Math.max(0.5f, Math.min(2f, call.getFloat("rate", 1f))),
                call.getBoolean("playWord", true),
                call.getBoolean("playMeaning", false)
            ));
            Intent intent = new Intent(getContext(), QuickVocabPlaybackService.class)
                .setAction(QuickVocabPlaybackService.ACTION_START);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve(PlaybackSessionStore.getStatus(getContext()));
        } catch (JSONException | IllegalArgumentException error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void pause(PluginCall call) { sendSessionAction(call, QuickVocabPlaybackService.ACTION_PAUSE); }

    @PluginMethod
    public void resume(PluginCall call) { sendSessionAction(call, QuickVocabPlaybackService.ACTION_RESUME); }

    @PluginMethod
    public void stop(PluginCall call) { sendSessionAction(call, QuickVocabPlaybackService.ACTION_STOP); }

    @PluginMethod
    public void getStatus(PluginCall call) { call.resolve(PlaybackSessionStore.getStatus(getContext())); }

    private void sendSessionAction(PluginCall call, String action) {
        String sessionId = call.getString("sessionId", "");
        Intent intent = new Intent(getContext(), QuickVocabPlaybackService.class)
            .setAction(action)
            .putExtra(QuickVocabPlaybackService.EXTRA_SESSION_ID, sessionId);
        getContext().startService(intent);
        call.resolve(PlaybackSessionStore.getStatus(getContext()));
    }

    static void emitStatus(Context context) {
        NativePlaybackPlugin plugin = activePlugin.get();
        if (plugin == null) return;
        JSObject status = PlaybackSessionStore.getStatus(context);
        new Handler(Looper.getMainLooper()).post(() -> plugin.notifyListeners("playbackStatus", status, true));
    }

    private static String requiredString(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.isEmpty()) throw new IllegalArgumentException(key + " 不能为空");
        return value;
    }

    private static String optionalString(JSONObject object, String key) throws JSONException {
        if (!object.has(key) || object.isNull(key)) return null;
        String value = object.getString(key);
        return value.isEmpty() ? null : value;
    }
}
