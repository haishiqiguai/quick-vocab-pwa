import { BookOpen, CheckCircle2, CloudDownload, Heart, Import, RotateCcw, SlidersHorizontal, Volume2 } from 'lucide-react';
import { PageHeader } from '../components/ui';

const guideItems = [
  { icon: <BookOpen />, title: 'Target · 快速浏览', detail: '只聚焦单词最核心的中文释义。上滑或点击“下一个”持续浏览，离开卡片即记录为已学习。' },
  { icon: <Volume2 />, title: '自然神经朗读', detail: '点击单词、序号旁的喇叭或音标即可朗读。默认由电脑生成自然神经语音，手机和电脑声音一致；右上角可切换声音、语速和自动朗读。' },
  { icon: <Heart />, title: '收藏陌生单词', detail: '特别陌生的词点击爱心加入生词本，之后可以集中查看和强化。' },
  { icon: <CheckCircle2 />, title: 'Review · 快速复习', detail: '每个单词测试一次。答对即完成；答错会显示正确释义，并自动回到本轮队尾，直到再次答对。' },
  { icon: <RotateCcw />, title: '重复学习', detail: '完成整轮后可立即开始新一轮。可在设置中关闭“重复学习”按钮。' },
  { icon: <SlidersHorizontal />, title: '修改学习计划', detail: '选择浏览或测验、词频或随机顺序、学习词本以及 500 词分段或自定义范围。' },
  { icon: <CloudDownload />, title: '下载离线语音包', detail: '在“设置 → 离线语音包”下载当前词本、当前声音和语速的全部音频。下载完成后电脑断网仍可朗读，但电脑和启动窗口需要保持开启。' },
  { icon: <Import />, title: '导入自己的词本', detail: '设置页支持 CSV 和 .xlsx 文件。导入前可以预览、映射字段并处理重复单词。' }
];

export function GuidePage() {
  return <div className="standalone-page guide-page"><PageHeader title="使用指南" subtitle="Usage Guidelines" back /><div className="page-content-narrow"><section className="guide-intro"><small>快速 · 多轮 · 聚焦核心</small><h1>两步完成一轮学习</h1><p>先用 Target 迅速浏览，再用 Review 检验是否真正记住。范围更小、反馈更快，让注意力留在常考含义上。</p></section><div className="guide-list">{guideItems.map((item, index) => <article key={item.title}><span>{index + 1}</span><div className="guide-icon">{item.icon}</div><div><h2>{item.title}</h2><p>{item.detail}</p></div></article>)}</div></div></div>;
}
