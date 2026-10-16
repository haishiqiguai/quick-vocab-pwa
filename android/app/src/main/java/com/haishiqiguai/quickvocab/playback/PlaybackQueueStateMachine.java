package com.haishiqiguai.quickvocab.playback;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class PlaybackQueueStateMachine {
    public enum State { IDLE, PREPARING, PLAYING, PAUSED, COMPLETED, FAILED }
    public enum SegmentKind { ASSET, TTS, DELAY }

    public static final class Item {
        public final String wordId;
        public final int studyIndex;
        public final String term;
        public final String meaning;
        public final String englishAssetPath;
        public final String meaningAssetPath;

        public Item(String wordId, int studyIndex, String term, String meaning, String englishAssetPath, String meaningAssetPath) {
            this.wordId = wordId;
            this.studyIndex = studyIndex;
            this.term = term;
            this.meaning = meaning;
            this.englishAssetPath = englishAssetPath;
            this.meaningAssetPath = meaningAssetPath;
        }
    }

    public static final class Segment {
        public final SegmentKind kind;
        public final String language;
        public final String text;
        public final String assetPath;
        public final int delayMs;

        private Segment(SegmentKind kind, String language, String text, String assetPath, int delayMs) {
            this.kind = kind;
            this.language = language;
            this.text = text;
            this.assetPath = assetPath;
            this.delayMs = delayMs;
        }

        public static Segment speech(String language, String text, String assetPath) {
            return new Segment(assetPath == null ? SegmentKind.TTS : SegmentKind.ASSET, language, text, assetPath, 0);
        }

        public static Segment delay(int milliseconds) {
            return new Segment(SegmentKind.DELAY, null, null, null, milliseconds);
        }
    }

    private final String sessionId;
    private final List<Item> items;
    private final int repeatCount;
    private final int intervalMs;
    private final boolean playWord;
    private final boolean playMeaning;
    private int itemCursor;
    private int segmentCursor;
    private int completedThroughIndex;
    private long token;
    private State state = State.IDLE;
    private String failureReason;

    public PlaybackQueueStateMachine(
        String sessionId,
        List<Item> items,
        int repeatCount,
        int intervalMs,
        boolean playWord,
        boolean playMeaning
    ) {
        this.sessionId = sessionId;
        this.items = Collections.unmodifiableList(new ArrayList<>(items));
        this.repeatCount = Math.max(1, repeatCount);
        this.intervalMs = Math.max(0, intervalMs);
        this.playWord = playWord;
        this.playMeaning = playMeaning;
        this.completedThroughIndex = items.isEmpty() ? 0 : items.get(0).studyIndex;
    }

    public void start() {
        failureReason = null;
        itemCursor = 0;
        segmentCursor = 0;
        token++;
        state = items.isEmpty() ? State.COMPLETED : State.PLAYING;
    }

    public void pause() {
        if (state != State.PLAYING) return;
        token++;
        state = State.PAUSED;
    }

    public void resume() {
        if (state != State.PAUSED) return;
        token++;
        state = State.PLAYING;
    }

    public void stop() {
        token++;
        state = State.IDLE;
    }

    public boolean completeSegment(long completedToken) {
        if (state != State.PLAYING || completedToken != token || items.isEmpty()) return false;
        List<Segment> segments = segmentsForCurrentItem();
        segmentCursor++;
        if (segmentCursor >= segments.size()) {
            completedThroughIndex = items.get(itemCursor).studyIndex + 1;
            itemCursor++;
            segmentCursor = 0;
            if (itemCursor >= items.size()) state = State.COMPLETED;
        }
        token++;
        return true;
    }

    public boolean fail(String reason, long failedToken) {
        if (state != State.PLAYING || failedToken != token) return false;
        failureReason = reason;
        token++;
        state = State.FAILED;
        return true;
    }

    public Segment currentSegment() {
        if (items.isEmpty() || itemCursor >= items.size()) return null;
        List<Segment> segments = segmentsForCurrentItem();
        return segments.get(Math.min(segmentCursor, segments.size() - 1));
    }

    private List<Segment> segmentsForCurrentItem() {
        Item item = items.get(itemCursor);
        List<Segment> segments = new ArrayList<>();
        if (playWord) {
            for (int repeat = 0; repeat < repeatCount; repeat++) {
                segments.add(Segment.speech("en-US", item.term, item.englishAssetPath));
            }
        }
        if (playMeaning) segments.add(Segment.speech("zh-CN", item.meaning, item.meaningAssetPath));
        if (intervalMs > 0 && itemCursor < items.size() - 1) segments.add(Segment.delay(intervalMs));
        if (segments.isEmpty()) segments.add(Segment.delay(0));
        return segments;
    }

    public String sessionId() { return sessionId; }
    public State state() { return state; }
    public long token() { return token; }
    public boolean acceptsCallback(String callbackSessionId, long callbackToken) {
        return state == State.PLAYING
            && sessionId.equals(callbackSessionId)
            && token == callbackToken;
    }
    public String failureReason() { return failureReason; }
    public int completedThroughIndex() { return completedThroughIndex; }
    public int currentStudyIndex() {
        if (items.isEmpty()) return completedThroughIndex;
        return items.get(Math.min(itemCursor, items.size() - 1)).studyIndex;
    }
    public String currentWordId() {
        if (items.isEmpty()) return null;
        return items.get(Math.min(itemCursor, items.size() - 1)).wordId;
    }
}
