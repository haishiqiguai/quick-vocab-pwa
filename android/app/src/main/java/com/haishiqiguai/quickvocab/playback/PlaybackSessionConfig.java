package com.haishiqiguai.quickvocab.playback;

import java.util.Collections;
import java.util.List;

final class PlaybackSessionConfig {
    final String sessionId;
    final List<PlaybackQueueStateMachine.Item> items;
    final int repeatCount;
    final int intervalMs;
    final float rate;
    final boolean playWord;
    final boolean playMeaning;

    PlaybackSessionConfig(
        String sessionId,
        List<PlaybackQueueStateMachine.Item> items,
        int repeatCount,
        int intervalMs,
        float rate,
        boolean playWord,
        boolean playMeaning
    ) {
        this.sessionId = sessionId;
        this.items = Collections.unmodifiableList(items);
        this.repeatCount = repeatCount;
        this.intervalMs = intervalMs;
        this.rate = rate;
        this.playWord = playWord;
        this.playMeaning = playMeaning;
    }
}
