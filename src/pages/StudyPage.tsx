import { ArrowLeft, Check, EyeOff, Heart, RotateCcw, Settings2, Volume2, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '../lib/router';
import { useSwipeable } from 'react-swipeable';
import { Button, EmptyState } from '../components/ui';
import { db, markWordViewed, progressId, recordReview, toggleFavorite } from '../lib/db';
import { createLocalId } from '../lib/id';
import { useSearchParams } from '../lib/router';
import { applyStudyPlan, buildReviewOptions, moveWrongWordToBack } from '../lib/study';
import { prefetchSpeechWords, SPEECH_RATE_PRESETS, speakWord, speechOptionsFromSettings, stopSpeaking } from '../lib/speech';
import { NEURAL_SPEECH_VOICES } from '../lib/speechApi';
import { useApp } from '../state/AppContext';
import type { StudyBackgroundMode, StudySession, Word } from '../types';

interface Metrics { viewed: number; correct: number; wrong: number }

const STUDY_BACKGROUNDS: Array<{ value: StudyBackgroundMode; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'eyeCare', label: '护眼绿' },
  { value: 'warmPaper', label: '暖纸黄' },
  { value: 'coolGray', label: '冷灰蓝' }
];

export function StudyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeBook, plan, settings, updateSettings } = useApp();
  const resumeWordId = searchParams.get('resumeWord');
  const resumeSessionId = searchParams.get('resumeSession');
  const allWords = useLiveQuery(() => activeBook ? db.words.where('bookId').equals(activeBook.id).toArray() : [], [activeBook?.id], []) ?? [];
  const resumeSession = useLiveQuery(
    async () => resumeSessionId ? db.sessions.get(resumeSessionId) : null,
    [resumeSessionId],
    resumeSessionId ? undefined : null
  );
  const plannedWords = useMemo(() => applyStudyPlan(allWords, plan), [allWords, plan]);
  const studyWords = useMemo(() => {
    if (!resumeSession?.wordIds?.length) return plannedWords;
    const wordsById = new Map(plannedWords.map((word) => [word.id, word]));
    const restored = resumeSession.wordIds.map((id) => wordsById.get(id)).filter((word): word is Word => Boolean(word));
    return restored.length === plannedWords.length ? restored : plannedWords;
  }, [plannedWords, resumeSession]);
  const [index, setIndex] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [wrongFeedback, setWrongFeedback] = useState<string>();
  const [pronunciationNotice, setPronunciationNotice] = useState<string>();
  const [studySettingsOpen, setStudySettingsOpen] = useState(false);
  const [complete, setComplete] = useState(false);
  const [studyReady, setStudyReady] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>({ viewed: 0, correct: 0, wrong: 0 });
  const metricsRef = useRef(metrics);
  const completedRef = useRef(false);
  const sessionIdRef = useRef('');
  const sessionRecordRef = useRef<StudySession>();
  const sessionWriteRef = useRef<Promise<void>>(Promise.resolve());
  const resumeInitializedRef = useRef(false);
  const autoReadWordRef = useRef<string>();
  const autoReadWrongAttemptRef = useRef<string>();
  const focusWordRef = useRef<HTMLHeadingElement>(null);

  const currentWord = plan.mode === 'review'
    ? studyWords.find((word) => word.id === queue[0])
    : studyWords[index];
  const currentProgress = useLiveQuery(
    () => currentWord ? db.progress.get(progressId(currentWord.bookId, currentWord.id)) : undefined,
    [currentWord?.id]
  );

  useLayoutEffect(() => {
    const element = focusWordRef.current;
    const container = element?.parentElement;
    if (!element || !container || !currentWord) return;

    let animationFrame = 0;
    const fitWordOnOneLine = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        element.style.removeProperty('font-size');
        const maximumSize = Number.parseFloat(getComputedStyle(element).fontSize);
        const minimumSize = Math.min(18, maximumSize);
        let lowerBound = minimumSize;
        let upperBound = maximumSize;
        const textRange = document.createRange();
        textRange.selectNodeContents(element);
        const computedStyle = getComputedStyle(element);
        const horizontalPadding = Number.parseFloat(computedStyle.paddingLeft) + Number.parseFloat(computedStyle.paddingRight);

        element.style.fontSize = `${maximumSize}px`;
        for (let attempt = 0; attempt < 9; attempt += 1) {
          const candidate = (lowerBound + upperBound) / 2;
          element.style.fontSize = `${candidate}px`;
          const textWidth = textRange.getBoundingClientRect().width + horizontalPadding;
          if (textWidth <= element.clientWidth + 1) lowerBound = candidate;
          else upperBound = candidate;
        }
        element.style.fontSize = `${Math.floor(lowerBound * 10) / 10}px`;
      });
    };

    fitWordOnOneLine();
    const resizeObserver = new ResizeObserver(fitWordOnOneLine);
    resizeObserver.observe(container);
    void document.fonts?.ready.then(fitWordOnOneLine);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [currentWord, plan.mode]);

  const persistSession = useCallback((changes: Partial<StudySession> = {}) => {
    const current = sessionRecordRef.current;
    if (!current) return Promise.resolve();

    const next = { ...current, ...changes };
    sessionRecordRef.current = next;
    const queuedWrite = sessionWriteRef.current
      .catch(() => undefined)
      .then(() => db.sessions.put(next))
      .then(() => undefined);

    sessionWriteRef.current = queuedWrite.catch((error: unknown) => {
      console.error('Failed to save study session', error);
    });
    return sessionWriteRef.current;
  }, []);

  const beginSession = useCallback((wordIds: string[], resumeIndex = 0, reviewQueue = wordIds) => {
    if (!activeBook || !studyWords.length) return Promise.resolve();
    const id = createLocalId();
    const startedAt = new Date().toISOString();
    sessionIdRef.current = id;
    const session: StudySession = {
      id,
      bookId: activeBook.id,
      mode: plan.mode,
      rangeStart: plan.rangeStart,
      rangeEnd: plan.rangeEnd,
      startedAt,
      viewed: 0,
      correct: 0,
      wrong: 0,
      roundCompleted: false,
      order: plan.order,
      wordIds,
      resumeIndex,
      reviewQueue: plan.mode === 'review' ? reviewQueue : undefined
    };
    sessionRecordRef.current = session;
    return persistSession();
  }, [activeBook, studyWords.length, plan, persistSession]);

  useEffect(() => {
    if (!studyWords.length || sessionIdRef.current || resumeInitializedRef.current) return;
    if (resumeSessionId && resumeSession === undefined) return;
    const resumableSession = resumeSession
      && !resumeSession.roundCompleted
      && resumeSession.bookId === activeBook?.id
      && resumeSession.mode === plan.mode
      ? resumeSession
      : undefined;
    const legacyResumedIndex = resumeWordId ? studyWords.findIndex((word) => word.id === resumeWordId) : -1;
    const storedIndex = resumableSession?.resumeIndex;
    const startIndex = typeof storedIndex === 'number'
      ? Math.min(Math.max(0, storedIndex), studyWords.length - 1)
      : legacyResumedIndex >= 0 ? legacyResumedIndex : 0;
    const ids = studyWords.map((word) => word.id);
    const savedReviewQueue = resumableSession?.reviewQueue?.filter((id) => ids.includes(id));
    const initialQueue = plan.mode === 'review'
      ? savedReviewQueue?.length ? savedReviewQueue : startIndex > 0 ? [...ids.slice(startIndex), ...ids.slice(0, startIndex)] : ids
      : ids;
    setIndex(startIndex);
    setQueue(initialQueue);
    resumeInitializedRef.current = true;
    if (resumableSession) {
      sessionIdRef.current = resumableSession.id;
      sessionRecordRef.current = resumableSession;
      const restoredMetrics = { viewed: resumableSession.viewed, correct: resumableSession.correct, wrong: resumableSession.wrong };
      metricsRef.current = restoredMetrics;
      setMetrics(restoredMetrics);
      void persistSession({ endedAt: undefined });
    } else {
      void beginSession(ids, startIndex, initialQueue);
    }
    setStudyReady(true);
  }, [activeBook?.id, studyWords, beginSession, persistSession, plan.mode, resumeSession, resumeSessionId, resumeWordId]);

  useEffect(() => {
    if (!settings.autoPronounce) {
      autoReadWordRef.current = undefined;
      setPronunciationNotice(undefined);
      return;
    }
    if (!studyReady || complete || wrongFeedback || !currentWord || autoReadWordRef.current === currentWord.id) return;
    autoReadWordRef.current = currentWord.id;
    setPronunciationNotice(undefined);
    void speakWord(currentWord.term, speechOptionsFromSettings(settings, {
      quiet: true,
      onError: (message) => setPronunciationNotice(message)
    }));
  }, [complete, currentWord, plan.mode, settings, studyReady, wrongFeedback]);

  useEffect(() => {
    if (!wrongFeedback) {
      autoReadWrongAttemptRef.current = undefined;
      return;
    }
    if (!settings.autoPronounce || !studyReady || complete || plan.mode !== 'review' || !currentWord) return;
    const attemptKey = `${currentWord.id}:${metrics.wrong}`;
    if (autoReadWrongAttemptRef.current === attemptKey) return;
    autoReadWrongAttemptRef.current = attemptKey;
    setPronunciationNotice(undefined);
    void speakWord(currentWord.term, speechOptionsFromSettings(settings, {
      quiet: true,
      onError: (message) => setPronunciationNotice(message)
    }));
  }, [complete, currentWord, metrics.wrong, plan.mode, settings, studyReady, wrongFeedback]);

  useEffect(() => {
    if (!currentWord || !settings.autoPronounce) return;
    const upcomingWords = plan.mode === 'review'
      ? queue.slice(1, 4).map((id) => studyWords.find((word) => word.id === id)).filter((word): word is Word => Boolean(word))
      : studyWords.slice(index + 1, index + 4);
    prefetchSpeechWords(upcomingWords.map((word) => word.term), settings);
  }, [currentWord?.id, index, plan.mode, queue, settings, studyWords]);

  useEffect(() => {
    if (plan.mode === 'review' && currentWord) setOptions(buildReviewOptions(currentWord, allWords));
  }, [plan.mode, currentWord?.id, allWords]);

  useEffect(() => {
    metricsRef.current = metrics;
    if (sessionIdRef.current) void persistSession(metrics);
  }, [metrics, persistSession]);

  useEffect(() => {
    if (!studyReady || complete || !sessionIdRef.current) return;
    void persistSession(plan.mode === 'browse' ? { resumeIndex: index } : { reviewQueue: queue });
  }, [complete, index, persistSession, plan.mode, queue, studyReady]);

  useEffect(() => () => {
    stopSpeaking();
    if (sessionIdRef.current && !completedRef.current) {
      void persistSession({ ...metricsRef.current, endedAt: new Date().toISOString() });
    }
  }, [persistSession]);

  const finishRound = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (sessionIdRef.current) {
      await persistSession({
        ...metricsRef.current,
        endedAt: new Date().toISOString(),
        roundCompleted: true,
        resumeIndex: studyWords.length,
        reviewQueue: plan.mode === 'review' ? [] : undefined
      });
    }
    setComplete(true);
  }, [persistSession, plan.mode, studyWords.length]);

  const nextBrowse = useCallback(async () => {
    const word = studyWords[index];
    if (!word) return;
    const isLastWord = index >= studyWords.length - 1;
    if (!isLastWord) setIndex((current) => current + 1);
    await markWordViewed(word);
    const nextMetrics = { ...metricsRef.current, viewed: metricsRef.current.viewed + 1 };
    metricsRef.current = nextMetrics;
    setMetrics(nextMetrics);
    if (!isLastWord) void persistSession({ resumeIndex: index + 1 });
    if (isLastWord) await finishRound();
  }, [index, studyWords, finishRound, persistSession]);

  const previousBrowse = useCallback(() => setIndex((current) => Math.max(0, current - 1)), []);

  const answerReview = useCallback(async (answer: string) => {
    if (!currentWord || wrongFeedback) return;
    const correct = answer === currentWord.meaning;
    await recordReview(currentWord, correct);
    if (correct) {
      const next = queue.slice(1);
      const nextMetrics = { ...metricsRef.current, viewed: metricsRef.current.viewed + 1, correct: metricsRef.current.correct + 1 };
      metricsRef.current = nextMetrics;
      setMetrics(nextMetrics);
      setQueue(next);
      void persistSession({ reviewQueue: next });
      if (!next.length) await finishRound();
    } else {
      const nextMetrics = { ...metricsRef.current, viewed: metricsRef.current.viewed + 1, wrong: metricsRef.current.wrong + 1 };
      metricsRef.current = nextMetrics;
      setMetrics(nextMetrics);
      setWrongFeedback(currentWord.meaning);
    }
  }, [currentWord, queue, wrongFeedback, finishRound, persistSession]);

  const exitStudy = useCallback(async () => {
    if (!complete && plan.mode === 'browse' && currentWord) {
      const finishesCurrentRound = index >= studyWords.length - 1;
      await markWordViewed(currentWord);
      const nextMetrics = { ...metricsRef.current, viewed: metricsRef.current.viewed + 1 };
      metricsRef.current = nextMetrics;
      setMetrics(nextMetrics);
      if (sessionIdRef.current) await persistSession({
        ...nextMetrics,
        endedAt: new Date().toISOString(),
        roundCompleted: finishesCurrentRound,
        resumeIndex: index
      });
      if (finishesCurrentRound) completedRef.current = true;
    } else if (!complete && sessionIdRef.current) {
      await persistSession({ ...metricsRef.current, endedAt: new Date().toISOString(), reviewQueue: queue });
    }
    navigate('/');
  }, [complete, currentWord, index, navigate, persistSession, plan.mode, queue, studyWords.length]);

  const continueAfterWrong = useCallback(() => {
    setQueue((current) => {
      const next = moveWrongWordToBack(current);
      void persistSession({ reviewQueue: next });
      return next;
    });
    setWrongFeedback(undefined);
  }, [persistSession]);

  async function restart() {
    completedRef.current = false;
    sessionIdRef.current = '';
    sessionRecordRef.current = undefined;
    setComplete(false);
    setIndex(0);
    setQueue(studyWords.map((word) => word.id));
    setMetrics({ viewed: 0, correct: 0, wrong: 0 });
    const ids = studyWords.map((word) => word.id);
    await beginSession(ids, 0, ids);
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (studySettingsOpen) {
        if (event.key === 'Escape') setStudySettingsOpen(false);
        return;
      }
      if (complete) return;
      if (plan.mode === 'browse') {
        if (['ArrowRight', 'ArrowUp', ' '].includes(event.key)) { event.preventDefault(); void nextBrowse(); }
        if (event.key === 'ArrowLeft') previousBrowse();
      } else if (/^[1-4]$/.test(event.key)) {
        const answer = options[Number(event.key) - 1];
        if (answer) void answerReview(answer);
      } else if (event.key === 'Enter' && wrongFeedback) continueAfterWrong();
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [answerReview, complete, continueAfterWrong, nextBrowse, options, plan.mode, previousBrowse, studySettingsOpen, wrongFeedback]);

  const swipe = useSwipeable({
    onSwipedUp: () => plan.mode === 'browse' && void nextBrowse(),
    onSwipedLeft: () => plan.mode === 'browse' && void nextBrowse(),
    onSwipedRight: () => plan.mode === 'browse' && previousBrowse(),
    preventScrollOnSwipe: true,
    trackTouch: true
  });

  if (!studyWords.length) return <div className="study-page" data-study-background={settings.studyBackground}><button className="study-back" onClick={() => navigate(-1)}><ArrowLeft /></button><EmptyState title="当前范围没有单词" detail="请返回学习计划调整词本或范围" /></div>;

  const position = plan.mode === 'browse' ? index + 1 : studyWords.length - queue.length + 1;
  const progressPercent = complete ? 100 : Math.max(0, ((position - 1) / studyWords.length) * 100);

  return (
    <div className="study-page" data-study-background={settings.studyBackground} {...swipe}>
      <header className="study-header">
        <button className="icon-button" onClick={() => void exitStudy()} aria-label="退出学习"><ArrowLeft /></button>
        <div className="study-header-title"><strong>{plan.mode === 'browse' ? 'Target' : 'Review'}</strong><small>{activeBook?.name}</small></div>
        <div className="study-header-actions"><span>{Math.min(position, studyWords.length)} / {studyWords.length}</span><button className="icon-button" onClick={() => setStudySettingsOpen(true)} aria-label="打开学习设置"><Settings2 /></button></div>
      </header>
      <div className="study-progress"><i style={{ width: `${progressPercent}%` }} /></div>

      {studySettingsOpen && (
        <div className="study-settings-overlay" onMouseDown={() => setStudySettingsOpen(false)}>
          <section className="study-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="study-settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><small>Study settings</small><h2 id="study-settings-title">学习设置</h2></div><button className="icon-button" onClick={() => setStudySettingsOpen(false)} aria-label="关闭学习设置"><X /></button></header>
            <fieldset className="study-background-control">
              <legend>背景模式</legend>
              <div>
                {STUDY_BACKGROUNDS.map((background) => (
                  <label key={background.value} className={settings.studyBackground === background.value ? 'active' : ''} data-background-preview={background.value}>
                    <input type="radio" name="study-background" value={background.value} checked={settings.studyBackground === background.value} onChange={() => void updateSettings({ ...settings, studyBackground: background.value })} />
                    <i aria-hidden="true" />
                    <span>{background.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="auto-pronounce-control"><span><Volume2 size={18} /><span><strong>自动朗读</strong><small>切换到下一个单词时朗读</small></span></span><span className="switch"><input aria-label="浏览时自动朗读" type="checkbox" checked={settings.autoPronounce} onChange={(event) => void updateSettings({ ...settings, autoPronounce: event.target.checked })} /><i /></span></label>
            <label className="auto-pronounce-control phonetic-visibility-control"><span><EyeOff size={18} /><span><strong>隐藏音标</strong><small>学习时只显示单词和释义</small></span></span><span className="switch"><input aria-label="隐藏音标" type="checkbox" checked={settings.hidePhonetic} onChange={(event) => void updateSettings({ ...settings, hidePhonetic: event.target.checked })} /><i /></span></label>
            <div className="speech-rate-control">
              <span><strong>朗读速度</strong><small>{SPEECH_RATE_PRESETS.find((preset) => preset.value === settings.speechRate)?.label ?? `${settings.speechRate}×`}</small></span>
              <div className="speech-rate-presets" role="group" aria-label="朗读速度档位">
                {SPEECH_RATE_PRESETS.map((preset) => <button key={preset.value} type="button" aria-label={`${preset.label} ${preset.value} 倍速`} aria-pressed={settings.speechRate === preset.value} className={settings.speechRate === preset.value ? 'active' : ''} onClick={() => void updateSettings({ ...settings, speechRate: preset.value })}>{preset.value}×</button>)}
              </div>
            </div>
            <div className="speech-voice-control">
              <label><strong>朗读声音</strong><small>{settings.speechEngine === 'neural' ? '电脑神经语音 · 手机电脑一致' : '手机或电脑系统声音'}</small><select aria-label="朗读声音" value={settings.speechEngine === 'system' ? 'system' : settings.neuralVoice} onChange={(event) => { const value = event.target.value; void updateSettings(value === 'system' ? { ...settings, speechEngine: 'system' } : { ...settings, speechEngine: 'neural', neuralVoice: value }); }}><optgroup label="自然神经语音">{NEURAL_SPEECH_VOICES.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.label}</option>)}</optgroup><option value="system">系统语音（备用）</option></select></label>
              <button type="button" aria-label="试听朗读声音" onClick={() => void speakWord(currentWord?.term ?? 'welcome', speechOptionsFromSettings(settings))}><Volume2 size={16} />试听</button>
            </div>
            <p>设置会自动保存。神经语音由电脑生成，手机和电脑听到的声音一致；系统语音仅作为备用。</p>
          </section>
        </div>
      )}

      {!complete && currentWord && plan.mode === 'browse' && (
        <main className="browse-card">
          <button className="word-number" onClick={() => void speakWord(currentWord.term, speechOptionsFromSettings(settings))}>{currentWord.order}<Volume2 size={15} /></button>
          <h1 ref={focusWordRef} key={currentWord.id} className="focus-word" onClick={() => void speakWord(currentWord.term, speechOptionsFromSettings(settings))}>{currentWord.term}</h1>
          <div className="phonetic-slot" aria-hidden={settings.hidePhonetic || !currentWord.phonetic}>
            {!settings.hidePhonetic && currentWord.phonetic && <p className="phonetic">/{currentWord.phonetic.replace(/^\/?|\/?$/g, '')}/</p>}
          </div>
          <p className="core-meaning">{currentWord.meaning}</p>
          {currentWord.variants.length > 0 && <div className="variants">{currentWord.variants.slice(0, 6).map((variant) => <span key={variant}>{variant}</span>)}</div>}
          <button className={`favorite-study ${currentProgress?.favorite ? 'active' : ''}`} onClick={() => void toggleFavorite(currentWord)} aria-label="收藏"><Heart fill={currentProgress?.favorite ? 'currentColor' : 'none'} /><span>{currentProgress?.favorite ? '已收藏' : '收藏到生词本'}</span></button>
          {pronunciationNotice && <p className="pronunciation-notice" role="status">{pronunciationNotice}。可在右上角设置中临时改用系统语音。</p>}
          <div className="swipe-hint">上滑学习下一个单词</div>
          <div className="study-controls"><Button className="secondary" onClick={previousBrowse} disabled={index === 0}>上一个</Button><Button onClick={() => void nextBrowse()}>下一个</Button></div>
        </main>
      )}

      {!complete && currentWord && plan.mode === 'review' && (
        <main className="review-card">
          <small>选择最贴近的核心释义</small>
          <h1 ref={focusWordRef} key={currentWord.id} className="focus-word">{currentWord.term}</h1>
          {currentWord.phonetic && <button className="pronounce-link" onClick={() => void speakWord(currentWord.term, speechOptionsFromSettings(settings))}><Volume2 size={17} />{!settings.hidePhonetic && <> /{currentWord.phonetic.replace(/^\/?|\/?$/g, '')}/</>}</button>}
          <div className="review-options">
            {options.map((option, optionIndex) => <button key={`${currentWord.id}-${option}`} disabled={Boolean(wrongFeedback)} onClick={() => void answerReview(option)} className={wrongFeedback && option === currentWord.meaning ? 'correct' : ''}><span>{optionIndex + 1}</span>{option}</button>)}
          </div>
          {wrongFeedback && <div className="wrong-feedback"><X /><div><strong>再记一次</strong><p>{wrongFeedback}</p></div><Button onClick={continueAfterWrong}>继续</Button></div>}
          <p className="review-queue">待完成 {queue.length} 个 · 答错的单词会自动回到队尾</p>
        </main>
      )}

      {complete && (
        <main className="completion-card">
          <div className="completion-icon"><Check /></div><small>Round complete</small><h1>这一轮完成了</h1><p>学习 {metrics.viewed} 次 · 答对 {metrics.correct} 次 · 答错 {metrics.wrong} 次</p>
          {settings.repetitiveLearning && <Button onClick={() => void restart()}><RotateCcw size={18} /> 再来一轮</Button>}
          <Button className="secondary" onClick={() => navigate('/')}>返回首页</Button>
        </main>
      )}
    </div>
  );
}
