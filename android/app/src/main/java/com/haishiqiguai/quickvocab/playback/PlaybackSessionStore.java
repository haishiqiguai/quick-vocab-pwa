package com.haishiqiguai.quickvocab.playback;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;

final class PlaybackSessionStore {
    private static final String PREFS = "native_playback_status";
    private static PlaybackSessionConfig pendingConfig;

    private PlaybackSessionStore() {}

    static synchronized void setPendingConfig(PlaybackSessionConfig config) {
        pendingConfig = config;
    }

    static synchronized PlaybackSessionConfig takePendingConfig() {
        PlaybackSessionConfig config = pendingConfig;
        pendingConfig = null;
        return config;
    }

    static void saveStatus(Context context, PlaybackQueueStateMachine machine) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("state", machine.state().name().toLowerCase())
            .putString("sessionId", machine.sessionId())
            .putInt("currentIndex", machine.currentStudyIndex())
            .putInt("completedThroughIndex", machine.completedThroughIndex());
        String wordId = machine.currentWordId();
        String failureReason = machine.failureReason();
        if (wordId == null) editor.remove("currentWordId"); else editor.putString("currentWordId", wordId);
        if (failureReason == null) editor.remove("failureReason"); else editor.putString("failureReason", failureReason);
        editor.apply();
    }

    static void saveIdle(Context context, String sessionId, int currentIndex, int completedThroughIndex) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("state", "idle")
            .putString("sessionId", sessionId == null ? "" : sessionId)
            .putInt("currentIndex", currentIndex)
            .putInt("completedThroughIndex", completedThroughIndex)
            .remove("failureReason")
            .apply();
    }

    static JSObject getStatus(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject status = new JSObject();
        status.put("state", prefs.getString("state", "idle"));
        status.put("currentIndex", prefs.getInt("currentIndex", 0));
        status.put("completedThroughIndex", prefs.getInt("completedThroughIndex", 0));
        putIfPresent(status, "sessionId", prefs.getString("sessionId", null));
        putIfPresent(status, "currentWordId", prefs.getString("currentWordId", null));
        putIfPresent(status, "failureReason", prefs.getString("failureReason", null));
        return status;
    }

    private static void putIfPresent(JSObject object, String key, String value) {
        if (value != null && !value.isEmpty()) object.put(key, value);
    }
}
