import { endOfDay, startOfDay } from 'date-fns';
import type { StudySession, WordProgress } from '../types';
import { sessionDuration } from './format';

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
