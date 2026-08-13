import { endOfDay, startOfDay } from 'date-fns';
import type { StudyActivityRecord, StudySession, WordProgress } from '../types';
import { sessionDuration } from './format';
import { dayKey } from './format';

function addCount(counts: Map<string, number>, date: string, count: number) {
  if (!date || !Number.isFinite(count) || count <= 0) return;
  counts.set(date, (counts.get(date) ?? 0) + count);
}

export function calculateDailyActivity(
  allProgress: WordProgress[],
  sessions: StudySession[],
  storedActivity: StudyActivityRecord[] = []
): Map<string, number> {
  const progressCounts = new Map<string, number>();
  const sessionCounts = new Map<string, number>();
  const storedCounts = new Map<string, number>();

  allProgress.forEach((item) => {
    if (item.lastViewedAt) addCount(progressCounts, dayKey(item.lastViewedAt), 1);
  });
  sessions.forEach((session) => {
    const count = Math.max(session.viewed, session.correct + session.wrong);
    if (count <= 0) return;
    addCount(sessionCounts, dayKey(session.startedAt), count);
    if (session.endedAt && dayKey(session.endedAt) !== dayKey(session.startedAt)) {
      addCount(sessionCounts, dayKey(session.endedAt), count);
    }
  });
  storedActivity.forEach((record) => addCount(storedCounts, record.date, record.count));

  const dates = new Set([...progressCounts.keys(), ...sessionCounts.keys(), ...storedCounts.keys()]);
  return new Map([...dates].map((date) => [date, Math.max(
    progressCounts.get(date) ?? 0,
    sessionCounts.get(date) ?? 0,
    storedCounts.get(date) ?? 0
  )]));
}

export function calculateStudyStats(
  activeProgress: WordProgress[],
  allProgress: WordProgress[],
  sessions: StudySession[],
  now = new Date()
) {
  const todayStart = startOfDay(now).getTime();
  const todayEnd = endOfDay(now).getTime();
  const learned = activeProgress.filter((item) => item.viewedCount > 0).length;
  const cumulativeLearned = allProgress.filter((item) => item.viewedCount > 0).length;
  const correct = allProgress.reduce((sum, item) => sum + item.correctCount, 0);
  const wrong = allProgress.reduce((sum, item) => sum + item.wrongCount, 0);
  const totalTime = sessions.reduce((sum, session) => sum + sessionDuration(session), 0);
  const todayTime = sessions
    .filter((session) => {
      const time = new Date(session.startedAt).getTime();
      return time >= todayStart && time <= todayEnd;
    })
    .reduce((sum, session) => sum + sessionDuration(session), 0);
  const todayLearned = allProgress.filter((item) => {
    const time = item.lastViewedAt ? new Date(item.lastViewedAt).getTime() : 0;
    return time >= todayStart && time <= todayEnd;
  }).length;
  return { learned, cumulativeLearned, correct, wrong, totalTime, todayTime, todayLearned };
}
