import { AudioLines, BookA, BookHeart, CircleHelp, DatabaseBackup, FileUp, Gauge, HardDrive, Info, List, MoonStar, Play, Route, UserRound, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from '../lib/router';
import { PageHeader, SettingsLink } from '../components/ui';
import { SpeechCacheCard } from '../components/SpeechCacheCard';
import { SPEECH_RATE_PRESETS, speakWord, speechOptionsFromSettings, warmUpChineseSpeech } from '../lib/speech';
import { NEURAL_SPEECH_VOICES } from '../lib/speechApi';
import { isNativeAndroid } from '../lib/platform';
import { useApp } from '../state/AppContext';

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useApp();
  const [nickname, setNickname] = useState(settings.nickname);
  const nativeAndroid = isNativeAndroid();
  const neuralVoices = nativeAndroid
    ? NEURAL_SPEECH_VOICES.filter((voice) => voice.id === 'en-US-AriaNeural')
    : NEURAL_SPEECH_VOICES;

  useEffect(() => setNickname(settings.nickname), [settings.nickname]);

  function saveNickname() {
    const nextNickname = nickname.trim() || 'Learner';
    setNickname(nextNickname);
    if (nextNickname !== settings.nickname) void updateSettings({ ...settings, nickname: nextNickname });
  }

  async function handleAvatar(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert('头像不能超过 2 MB');
    const reader = new FileReader();
    reader.onload = () => void updateSettings({ ...settings, avatar: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div className="page-content settings-page">
      <PageHeader title="设置" subtitle="Settings" />
      <section className="profile-card">
        <label className="avatar-editor">
          {settings.avatar ? <img src={settings.avatar} alt="头像" /> : <span>{settings.nickname.slice(0, 1).toUpperCase()}</span>}
          <input type="file" accept="image/*" onChange={(event) => void handleAvatar(event.target.files?.[0])} />
        </label>
        <div><small>本地学习者</small><input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} onBlur={saveNickname} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label="昵称" /></div>
        <UserRound size={22} />
      </section>

      <section className="settings-group">
        <div className="inline-setting"><span className="settings-icon"><MoonStar /></span><span><strong>主题</strong><small>Theme</small></span><select aria-label="主题" value={settings.theme} onChange={(event) => void updateSettings({ ...settings, theme: event.target.value as typeof settings.theme })}><option value="system">跟随系统</option><option value="dark">深色</option><option value="light">浅色</option></select></div>
        <div className="inline-setting"><span className="settings-icon"><Route /></span><span><strong>重复学习</strong><small>Repetitive learning</small></span><label className="switch"><input type="checkbox" checked={settings.repetitiveLearning} onChange={(event) => void updateSettings({ ...settings, repetitiveLearning: event.target.checked })} /><i /></label></div>
        <div className="inline-setting"><span className="settings-icon"><Volume2 /></span><span><strong>自动朗读</strong><small>Auto pronunciation</small></span><label className="switch"><input aria-label="自动朗读" type="checkbox" checked={settings.autoPronounce} onChange={(event) => void updateSettings({ ...settings, autoPronounce: event.target.checked })} /><i /></label></div>
        <div className="inline-setting"><span className="settings-icon"><Gauge /></span><span><strong>朗读速度</strong><small>Pronunciation speed</small></span><select aria-label="朗读速度" value={settings.speechRate} onChange={(event) => void updateSettings({ ...settings, speechRate: Number(event.target.value) })}>{SPEECH_RATE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.value}× · {preset.label}</option>)}</select></div>
        <div className="inline-setting voice-inline-setting"><span className="settings-icon"><AudioLines /></span><span><strong>朗读声音</strong><small>{settings.speechEngine === 'neural' ? (nativeAndroid ? 'Offline neural voice' : 'Neural voice') : 'System voice'}</small></span><div className="voice-setting-actions"><select className="voice-select" aria-label="朗读声音" value={settings.speechEngine === 'system' || (nativeAndroid && settings.neuralVoice !== 'en-US-AriaNeural') ? 'system' : settings.neuralVoice} onChange={(event) => { const value = event.target.value; void updateSettings(value === 'system' ? { ...settings, speechEngine: 'system' } : { ...settings, speechEngine: 'neural', neuralVoice: value }); }}><optgroup label={nativeAndroid ? '预装离线神经语音' : '自然神经语音'}>{neuralVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.label}</option>)}</optgroup><option value="system">系统语音（备用）</option></select><button type="button" aria-label="试听朗读声音" onClick={() => void speakWord('welcome', speechOptionsFromSettings(settings))}><Volume2 size={15} />试听</button></div></div>
      </section>

      <section className="settings-group playback-settings" aria-labelledby="playback-settings-title">
        <header><span className="settings-icon"><Play /></span><div><strong id="playback-settings-title">播放设置</strong><small>Automatic playback</small></div></header>
        <div className="inline-setting playback-setting"><span><strong>自动播放</strong><small>在浏览模式中启用播放控制</small></span><label className="switch"><input aria-label="自动播放" type="checkbox" checked={settings.autoPlayEnabled} onChange={(event) => void updateSettings({ ...settings, autoPlayEnabled: event.target.checked })} /><i /></label></div>
        <div className="inline-setting playback-setting"><span><strong>间隔时间</strong><small>每个单词播放完成后等待</small></span><label className="number-setting"><input aria-label="间隔时间" type="number" min="0" max="60" step="1" value={settings.autoPlayInterval} onChange={(event) => void updateSettings({ ...settings, autoPlayInterval: Number(event.target.value) })} /><span>秒</span></label></div>
        <div className="inline-setting playback-setting"><span><strong>单词循环次数</strong><small>每个英文单词的重复次数</small></span><label className="number-setting"><input aria-label="单词循环次数" type="number" min="1" max="10" step="1" value={settings.autoPlayRepeatCount} onChange={(event) => void updateSettings({ ...settings, autoPlayRepeatCount: Number(event.target.value) })} /><span>次</span></label></div>
        <div className="inline-setting playback-setting"><span><strong>播放单词</strong><small>Play English word</small></span><label className="switch"><input aria-label="播放单词" type="checkbox" checked={settings.autoPlayWord} onChange={(event) => void updateSettings({ ...settings, autoPlayWord: event.target.checked })} /><i /></label></div>
        <div className="inline-setting playback-setting"><span><strong>播放单词中文意思</strong><small>{nativeAndroid ? '默认词本使用离线晓晓女声' : '使用设备系统中文语音'}</small></span><label className="switch"><input aria-label="播放单词中文意思" type="checkbox" checked={settings.autoPlayMeaning} onChange={(event) => { if (event.target.checked) void warmUpChineseSpeech(); void updateSettings({ ...settings, autoPlayMeaning: event.target.checked }); }} /><i /></label></div>
      </section>

      {nativeAndroid ? <section className="speech-cache-card" aria-labelledby="speech-cache-title"><header><span className="settings-icon"><HardDrive /></span><div><h2 id="speech-cache-title">内置离线语音</h2><small>Bundled neural voices</small></div><span className="speech-service-state online">已预装</span></header><p className="speech-privacy-note">两本内置词库已预装 Aria 1.0× 英文和晓晓中文神经语音，无需联网。导入词以及没有预装的英文语速会使用手机系统语音。</p></section> : <SpeechCacheCard />}

      <section className="settings-group">
        <SettingsLink icon={<List />} title="单词列表" subtitle="Vocabulary List" onClick={() => navigate('/words')} />
        <SettingsLink icon={<BookHeart />} title="生词本" subtitle="Vocabulary Builder" onClick={() => navigate('/favorites')} />
        <SettingsLink icon={<BookA />} title="修改学习计划" subtitle="Study Plan" onClick={() => navigate('/plan')} />
        <SettingsLink icon={<FileUp />} title="导入单词本" subtitle="CSV / Excel Import" onClick={() => navigate('/import')} />
      </section>

      <section className="settings-group">
        <SettingsLink icon={<DatabaseBackup />} title="备份与恢复" subtitle="Local Data Backup" onClick={() => navigate('/backup')} />
        <SettingsLink icon={<CircleHelp />} title="使用指南" subtitle="Usage Guidelines" onClick={() => navigate('/guide')} />
        <SettingsLink icon={<Info />} title="关于软件" subtitle="About Quick Vocab" onClick={() => navigate('/about')} />
      </section>
      <p className="local-warning">所有词本与学习记录只保存在当前设备。清理应用数据或卸载前，请先导出备份。</p>
    </div>
  );
}
