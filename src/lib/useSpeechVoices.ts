import { useCallback, useEffect, useState } from 'react';
import { getEnglishSpeechVoices, speechVoiceId } from './speech';

export interface SpeechVoiceChoice {
  id: string;
  name: string;
  lang: string;
  local: boolean;
}

export function useEnglishSpeechVoices(): { voices: SpeechVoiceChoice[]; refresh: () => void } {
  const [voices, setVoices] = useState<SpeechVoiceChoice[]>([]);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const synthesizer = window.speechSynthesis;
    const update = () => setVoices(getEnglishSpeechVoices(synthesizer.getVoices()).map((voice) => ({
      id: speechVoiceId(voice),
      name: voice.name,
      lang: voice.lang,
      local: voice.localService
    })));
    update();
    const timers = [250, 1000, 2500].map((delay) => window.setTimeout(update, delay));
    const handleVisibility = () => { if (document.visibilityState === 'visible') update(); };
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', handleVisibility);
    if (typeof synthesizer.addEventListener === 'function') {
      synthesizer.addEventListener('voiceschanged', update);
      return () => {
        timers.forEach((timer) => window.clearTimeout(timer));
        window.removeEventListener('focus', update);
        document.removeEventListener('visibilitychange', handleVisibility);
        synthesizer.removeEventListener('voiceschanged', update);
      };
    }
    const previous = synthesizer.onvoiceschanged;
    synthesizer.onvoiceschanged = update;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (synthesizer.onvoiceschanged === update) synthesizer.onvoiceschanged = previous;
    };
  }, [revision]);

  return { voices, refresh };
}
