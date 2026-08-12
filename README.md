# 速记单词 · Quick Vocab

一个本地优先、可离线安装的英汉背单词 PWA。软件采用“Target 快速浏览 → Review 错词回队”的两步学习方式，支持高考内置词库、CSV/XLSX 导入、生词收藏、统计、学习计划与完整本地备份。

## 快速开始

要求 Node.js 20.19 或更高版本。

```powershell
npm.cmd install
npm.cmd run dev
```

也可以双击 `启动电脑版.cmd`：脚本会清理本程序残留服务、安装依赖、构建生产版本，自动打开电脑端 `http://127.0.0.1:4173`，并同时开放手机端 `电脑IP:4174`。使用期间请保持命令窗口开启。仅需电脑本机访问时，也可以运行 `start-local.cmd`。

## 手机访问

电脑和手机连接同一路由器后，双击 `start-mobile.cmd`。脚本会同时保留电脑端 `127.0.0.1:4173` 和手机端 `电脑IP:4174`，并显示手机应访问的地址。使用期间请保持脚本窗口和电脑开启；Windows 防火墙询问时需允许专用网络访问。

## 自然朗读与离线语音包

- 默认使用美式 Aria Neural 女声，另提供 Guy 美式男声、Sonia 英式女声和系统语音备用项。
- 神经语音由电脑通过 Microsoft Edge Read Aloud 在线服务生成，因此手机和电脑听到的声音一致。
- 在“设置 → 离线语音包”可下载当前词本、当前声音和当前语速的全部音频；下载完成后电脑断网仍可使用缓存。
- 缓存位于 `runtime/tts-cache`，不会提交到源码。切换声音或语速后需下载对应的新语音包。
- 该免密接口并非 Microsoft 承诺长期稳定的正式开放 API，服务变化时可在设置中主动改用系统语音。

## 常用命令

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run preview
npm.cmd run test:e2e
```

## 导入词本

- 支持 UTF-8 CSV 与 `.xlsx`，不支持旧式 `.xls`。
- 必填列：`word/单词`、`meaning/释义`。
- 可选列：`phonetic/音标`、`variants/词形`、`frequency/词频`、`tags/标签`。
- 无表头文件默认前三列为单词、释义、音标。
- 模板位于 `public/import-template.csv`，也可从导入页面下载。

## 内置词库再生成

从 ECDICT 的完整 CSV 中筛选 `gk` 标签：

```powershell
node scripts/build-gaokao.mjs D:\path\to\ecdict.csv public\data\gaokao.json
```

## 数据与隐私

所有词本、进度、头像和设置都存储在浏览器 IndexedDB 中。使用神经朗读时，仅当前英语单词会发送到 Microsoft 在线朗读服务；中文释义、学习记录、昵称和词本不会发送。清理浏览器数据前，请在“设置 → 备份与恢复”中导出 JSON。

## 许可

项目使用 MIT License。初始结构参考 HSK Cards，内置词库来自 ECDICT；详情见 `THIRD_PARTY_NOTICES.md`。
