# 速记单词 · Quick Vocab

<p align="center"><strong>完美适配「陶大背单词法」</strong> · 让方法有节奏，让复习更顺手</p>

一个本地优先、可离线安装的英汉背单词应用。软件采用“Target 快速浏览 → Review 错词回队”的两步学习方式，内置 357 词高考真题词本和 896 词对口升学复习指导词本，支持 CSV/XLSX 导入、生词收藏、统计、学习计划与完整本地备份。

## 下载安装

Android 用户可直接下载 [最新版 APK（1.0.5）](https://github.com/haishiqiguai/quick-vocab-pwa/releases/latest/download/quick-vocab-1.0.5-release.apk)，支持 Android 7.0 及以上。下载后允许浏览器或文件管理器安装该 APK 即可使用。

[查看全部版本与发布说明](https://github.com/haishiqiguai/quick-vocab-pwa/releases) · [查看最新版本 SHA-256 校验文件](https://github.com/haishiqiguai/quick-vocab-pwa/releases/latest/download/SHA256SUMS.txt)

已有旧版时，建议先导出 JSON 备份，再直接覆盖安装新版，不要卸载。历史版本仅供留档，Android 通常不允许直接降级覆盖安装。

## 快速开始

要求 Node.js 20.19 或更高版本。

```powershell
npm.cmd install
npm.cmd run dev
```

也可以双击 `启动电脑版.cmd`：脚本会清理本程序残留服务、安装依赖、构建生产版本，自动打开电脑端 `http://127.0.0.1:4173`，并同时开放手机端 `电脑IP:4174`。使用期间请保持命令窗口开启。仅需电脑本机访问时，也可以运行 `start-local.cmd`。

## 手机访问

电脑和手机连接同一路由器后，双击 `start-mobile.cmd`。脚本会同时保留电脑端 `127.0.0.1:4173` 和手机端 `电脑IP:4174`，并显示手机应访问的地址。使用期间请保持脚本窗口和电脑开启；Windows 防火墙询问时需允许专用网络访问。

## 独立安卓 APK

Android 版使用 Capacitor 封装，页面、两本内置词库、Aria 1.0× 英文及晓晓中文 MP3 全部包含在 APK 中。安装后不需要域名、服务器、电脑或网络；导入词本、其他英文语速以及非 Aria 声音会自动使用手机系统语音。

首次构建需安装 Android Studio、Microsoft OpenJDK 21、Android SDK 36 和 FFmpeg（语音校验使用 `ffprobe`）。项目使用忽略提交的 `.android-sdk` 与 `android/local.properties` 固定本机 SDK 路径：

```powershell
npm.cmd run build:data
npm.cmd run build:speech
npm.cmd run android:debug
```

调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。发布版签名配置见 `android/signing.properties.example`；真实密钥和 `android/signing.properties` 不得提交到 Git。

首次发布前运行 `scripts/setup-android-signing.ps1` 生成稳定密钥，再运行 `npm.cmd run android:release`。签名 APK 会按 `package.json` 的版本号复制到 `artifacts/quick-vocab-<版本>-release.apk`（当前为 `quick-vocab-1.0.5-release.apk`）。请把以下两个被 Git 忽略的文件一起备份到加密存储中，且不要随 APK 发送：

- `android/keystore/quick-vocab-release.jks`
- `android/signing.properties`

丢失密钥或密码后，后续 APK 无法覆盖安装现有应用；只能卸载后重装，并会清除手机本地学习数据。更新时必须继续使用相同包名和这套密钥，安装前仍建议先导出 JSON 备份。

## 自然朗读与离线语音包

- 默认使用美式 Aria Neural 女声，另提供 Guy 美式男声、Sonia 英式女声和系统语音备用项。
- Android APK 为两本内置词库同时预装晓晓中文神经语音，五档语速通过本地播放速度调整；导入词由 Android 系统语音兜底。两本重复的英文单词共用音频：英文 1106 条、中文 1253 条。
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

## 内置词库与语音再生成

项目保留六列词库 `resources/seed/exam-words.csv` 与 `resources/seed/guide-words.csv`。新词本另有 `resources/seed/guide-questions.csv`，记录 1—300 题的原图页码、中文题干、四个选项及答案；仅按大小写和空格差异去重，保留不同词形。原书第 123 题的 `hand-on` 保留原拼写并在词义中标明常见拼写 `hands-on`。生成器会校验 1200 个选项、896 个词形、音标、词性与汉译。APK 专用音频保存在 `resources/android-audio`，普通网页构建不会包含这些 MP3：

```powershell
npm.cmd run build:data
npm.cmd run build:speech
npm.cmd run verify:speech
```

## 数据与隐私

所有词本、进度、头像和设置都存储在当前浏览器或 Android 应用的 IndexedDB 中。Android 预装语音在构建 APK 时生成，手机运行时不会发送单词；网页版使用神经朗读时，仅当前英语单词会发送到 Microsoft 在线朗读服务。清理数据或卸载应用前，请在“设置 → 备份与恢复”中导出 JSON。

## 许可

项目使用 MIT License。初始结构参考 HSK Cards；内置词本的来源与第三方软件许可详见 `THIRD_PARTY_NOTICES.md`。
