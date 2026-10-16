package com.haishiqiguai.quickvocab.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

public class PlaybackQueueStateMachineTest {
    private static PlaybackQueueStateMachine createMachine() {
        return new PlaybackQueueStateMachine(
            "session-1",
            List.of(
                new PlaybackQueueStateMachine.Item("word-4", 4, "active", "形容词，活跃的", "/audio/en.mp3", "/audio/zh.mp3"),
                new PlaybackQueueStateMachine.Item("word-5", 5, "imported", "形容词，导入的", null, null)
            ),
            2,
            1500,
            true,
            true
        );
    }

    @Test
    public void playsEnglishRepeatsMeaningAndDelayInOrder() {
        PlaybackQueueStateMachine machine = createMachine();
        machine.start();

        assertSegment(machine, PlaybackQueueStateMachine.SegmentKind.ASSET, "en-US", "/audio/en.mp3");
        complete(machine);
        assertSegment(machine, PlaybackQueueStateMachine.SegmentKind.ASSET, "en-US", "/audio/en.mp3");
        complete(machine);
        assertSegment(machine, PlaybackQueueStateMachine.SegmentKind.ASSET, "zh-CN", "/audio/zh.mp3");
        complete(machine);
        assertEquals(PlaybackQueueStateMachine.SegmentKind.DELAY, machine.currentSegment().kind);
        assertEquals(1500, machine.currentSegment().delayMs);
        complete(machine);

        assertEquals(5, machine.completedThroughIndex());
        assertEquals(5, machine.currentStudyIndex());
        assertSegment(machine, PlaybackQueueStateMachine.SegmentKind.TTS, "en-US", null);
    }

    @Test
    public void pauseInvalidatesTheOldCallbackAndResumeReplaysTheCurrentSegment() {
        PlaybackQueueStateMachine machine = createMachine();
        machine.start();
        long oldToken = machine.token();

        machine.pause();
        assertEquals(PlaybackQueueStateMachine.State.PAUSED, machine.state());
        assertFalse(machine.completeSegment(oldToken));
        assertEquals(4, machine.currentStudyIndex());

        machine.resume();
        assertEquals(PlaybackQueueStateMachine.State.PLAYING, machine.state());
        assertSegment(machine, PlaybackQueueStateMachine.SegmentKind.ASSET, "en-US", "/audio/en.mp3");
        assertTrue(machine.token() != oldToken);
    }

    @Test
    public void stopRejectsLateCompletionAndNeverAdvancesProgress() {
        PlaybackQueueStateMachine machine = createMachine();
        machine.start();
        long oldToken = machine.token();

        machine.stop();

        assertEquals(PlaybackQueueStateMachine.State.IDLE, machine.state());
        assertFalse(machine.completeSegment(oldToken));
        assertEquals(4, machine.completedThroughIndex());
    }

    @Test
    public void callbackIdentityRejectsTheSameTokenFromAnOlderSession() {
        PlaybackQueueStateMachine machine = createMachine();
        machine.start();

        assertTrue(machine.acceptsCallback("session-1", machine.token()));
        assertFalse(machine.acceptsCallback("older-session", machine.token()));
    }

    @Test
    public void failureStopsAtTheCurrentWordWithoutCompletingIt() {
        PlaybackQueueStateMachine machine = createMachine();
        machine.start();

        machine.fail("语音不可用", machine.token());

        assertEquals(PlaybackQueueStateMachine.State.FAILED, machine.state());
        assertEquals("语音不可用", machine.failureReason());
        assertEquals(4, machine.completedThroughIndex());
        assertFalse(machine.completeSegment(machine.token()));
    }

    @Test
    public void completingTheFinalItemProducesAnExclusiveCompletedIndex() {
        PlaybackQueueStateMachine machine = new PlaybackQueueStateMachine(
            "session-final",
            List.of(new PlaybackQueueStateMachine.Item("word-9", 9, "final", "形容词，最后的", null, null)),
            1,
            0,
            true,
            false
        );
        machine.start();
        complete(machine);

        assertEquals(PlaybackQueueStateMachine.State.COMPLETED, machine.state());
        assertEquals(10, machine.completedThroughIndex());
        assertEquals(9, machine.currentStudyIndex());
    }

    private static void complete(PlaybackQueueStateMachine machine) {
        assertTrue(machine.completeSegment(machine.token()));
    }

    private static void assertSegment(
        PlaybackQueueStateMachine machine,
        PlaybackQueueStateMachine.SegmentKind kind,
        String language,
        String assetPath
    ) {
        PlaybackQueueStateMachine.Segment segment = machine.currentSegment();
        assertEquals(kind, segment.kind);
        assertEquals(language, segment.language);
        assertEquals(assetPath, segment.assetPath);
    }
}
