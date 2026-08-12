import { ExternalLink } from 'lucide-react';
import { PageHeader } from '../components/ui';

export function AboutPage() {
  return <div className="standalone-page about-page"><PageHeader title="关于速记单词" subtitle="About Quick Vocab" back /><div className="page-content-narrow"><div className="about-brand"><div className="brand-mark">QV</div><h1>速记单词</h1><p>Quick Vocab · 1.0.0</p></div><section><h2>软件的核心作用</h2><p>单词学习分为两步，整体原则是快速多次：Target 迅速浏览核心释义；Review 快速测试，答错的单词在同一轮中自动重新出现，直到答对。</p><p>每个单词只保留相对简练的核心释义，以缩小记忆范围。特别陌生的单词可收藏到生词本单独强化。</p></section><section><h2>本地优先</h2><p>无需账号或服务器。词本、头像、学习计划和记录全部保存在当前浏览器，并支持 JSON 备份。</p></section><section><h2>开源来源</h2><a href="https://github.com/tnm/hsk" target="_blank" rel="noreferrer">HSK Cards · 工程与交互参考 <ExternalLink size={15} /></a><a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noreferrer">ECDICT · 内置词典数据 <ExternalLink size={15} /></a><p className="license-note">两者均按 MIT License 使用。详细说明见项目中的 THIRD_PARTY_NOTICES.md。</p></section></div></div>;
}
