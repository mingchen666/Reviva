<div align="center">

# Reviva

**AI 学习工作台，围绕你的资料完成问答、笔记、复习和创作输出。**

桌面端 · 本地优先 · AI Agent · 学习工具集

<p>
  中文
  ·
  <a href="./README_EN.md">English</a>
</p>


<p>
  <a href="https://www.reviva.cn/">
    <img src="https://img.shields.io/badge/%E5%AE%98%E7%BD%91-Reviva-4A6CFF?logo=googlechrome&logoColor=white" alt="官网" />
  </a>
  <a href="https://github.com/mingchen666/Reviva/releases">
    <img src="https://img.shields.io/github/v/release/mingchen666/Reviva?include_prereleases&label=release&color=4A6CFF" alt="Release" />
  </a>
  <a href="https://github.com/mingchen666/Reviva/stargazers">
    <img src="https://img.shields.io/github/stars/mingchen666/Reviva?style=flat&color=F59E0B" alt="GitHub Stars" />
  </a>
  <a href="#联系与交流">
    <img src="https://img.shields.io/badge/%E4%BA%A4%E6%B5%81%E7%BE%A4-QQ-16A34A?style=flat" alt="交流群" />
  </a>
</p>

<p>

  <a href="#开源协议与商业授权">
    <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2B%20Commercial-111827" alt="License AGPL-3.0 + Commercial" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-2E2E3A" alt="Platform Windows and macOS" />
  <img src="https://img.shields.io/github/downloads/mingchen666/Reviva/total?logo=github&label=Downloads&color=4A6CFF" alt="Downloads" />
  <img src="https://img.shields.io/badge/SQLite-Local--First-003B57?logo=sqlite&logoColor=white" alt="Local First" />
</p>

<p>
  <a href="#下载与安装">下载安装</a>
  ·
  <a href="#核心能力一览">核心能力</a>
  ·
  <a href="#界面演示">界面预览</a>
  ·
  <a href="#开源协议与商业授权">开源协议</a>
  ·
  <a href="#联系与交流">QQ交流群</a>
  ·
  <a href="#支持作者">支持作者</a>
</p>
</div>

> 📣 **微信交流群已迁移至 QQ 群，欢迎扫码加入！** [查看群二维码 ↓](#联系与交流)

Reviva 是一个面向学习、研究和知识工作的本地桌面 Agent。它把对话、文档、知识库、笔记、复习工具和创作输出放在同一个工作台里。

它不是“聊天窗口 + 一堆工具”的拼接，而是一个 **以 Agent 为核心的本地学习工作台**：Agent 负责理解资料、调用工具、使用技能、遵守权限，输出结果产物。

Reviva = 本地资料库 + Wiki 知识库 + AI Agent + 知识库检索 + 笔记文档管理 + Skills 能力系统 + 创作工具。

它适合希望把 AI 真正接入学习和知识管理流程的人——不是每次都从一个空白聊天框重新开始。

> 🌐 **Reviva 官网已上线** —— 完整介绍、功能演示与最新动态，欢迎前往 [官网](https://www.reviva.cn/) 查看


## 下载与安装

推荐直接下载最新安装包，国内网络环境可以使用夸克网盘。

| 渠道 | 下载地址 | 说明 |
| --- | --- | --- |
| 夸克网盘 | [打开下载](https://pan.quark.cn/s/9cbc820db4ef#/list/share) | 国内网络备用渠道 |
| GitHub | [下载最新版本](https://github.com/mingchen666/Reviva/releases) | 官方发布渠道，适合查看版本说明 |


当前提供 Windows 和 macOS 桌面端安装包。下载前请根据系统和处理器架构选择对应版本；重要资料建议在升级前先备份。

## 界面演示

<table>
  <tr>
    <td align="center"><b>学习工作台</b><br />与 Agent 对话、引用资料、调用学习工具</td>
    <td align="center"><b>智能体</b><br />创建角色、绑定模型、Skills、工具和知识库</td>
  </tr>
  <tr>
    <td><img src="docs/images/workbench.png" alt="学习工作台" /></td>
    <td><img src="docs/images/agents.png" alt="智能体管理" /></td>
  </tr>
  <tr>
    <td align="center"><b>笔记</b><br />记笔记、对话导出笔记，沉淀学习内容</td>
    <td align="center"><b>Wiki 知识库</b><br />让资料持续沉淀为可检索、可追溯的知识</td>
  </tr>
  <tr>
    <td><img src="docs/images/note.png" alt="笔记" /></td>
    <td><img src="docs/images/wiki.png" alt="Wiki 知识库" /></td>
  </tr>
  <tr>
    <td align="center"><b>知识库</b><br />管理本地与外部知识库</td>
    <td align="center"><b>设置中心</b><br />配置模型、记忆、权限、环境、主题和用量</td>
  </tr>
  <tr>
    <td><img src="docs/images/kb.png" alt="知识库" /></td>
    <td><img src="docs/images/settings.png" alt="设置中心" /></td>
  </tr>
</table>


## 为什么是 Reviva

普通 AI 工具往往从一个空白聊天框开始，而真实的学习过程会不断积累资料、笔记、问题和复习结果。Reviva 将这些内容放在同一个本地工作区中：

- 📚 资料可以被导入、解析、检索和持续维护
- 💬 对话可以分组、分支，并保留上下文与引用来源
- 🧠 可在同一个会话中切换agent，共享上下文。
- ✨ 一份资料可以继续生成测验、闪卡、导图、图表、PPT、播客或研究报告
- 🔁 输出可以保存到笔记、Wiki 和本地目录，形成学习闭环。

## 适合谁使用

- 🎓 **学生与备考者**：整理课程资料、讲义和错题，生成测验、闪卡、导图与复习内容。
- 💼 **知识工作者**：围绕项目资料、会议记录和 Office 文档完成分析、编辑、汇报与知识沉淀。
- 🧠 **个人知识管理用户**：用不同 Agent 管理长期资料、笔记、记忆和 Wiki，构建可持续更新的第二大脑。

<details>
<summary><b>⚡ 核心能力一览</b></summary>

## 核心能力一览

| 核心能力 | 你可以做什么 |
| --- | --- |
| 🤖 **多 Agent 协作** | 在对话中随时切换 Agent；不同 Agent 可以共享上下文，并使用全局 Agent 记忆保存长期偏好 |
| 📚 **围绕资料对话** | 直接选择本地文档、整个文件夹或 Wiki 知识库作为上下文，通过 `@` 快捷输入和 `/` 斜杠命令快速调用内容与技能 |
| 🎬 **音视频学习** | 解析音频和视频，完成语音转录、关键帧提取和内容索引；在对话中选中媒体后即可围绕具体内容提问 |
| 🧩 **可视化学习与创作** | 13 个创作工具把资料变成测验、闪卡、知识卡片、Q&A、术语表、速查表、思维导图、知识图谱、图表、学习指南、PPT 和深度研究报告，并可视化查看结果 |
| 🎤 **语音输入与多模态模型** | 对话工作台支持语音输入免打字；对话、语音（ASR）、图像生成编辑和 OCR 四类模型可分别配置 |
| 🔌 **接入你已有的知识库** | 内置 KBP 协议，Dify、FastGPT、MCP 或自定义 HTTP 知识库都能接进来，对话时自动检索；API Key 存在本地 |
| 📈 **成长画像（Beta）** | 跨对话维护学习目标、概念掌握状态、误区和复习需求，让 Agent 接着上次辅导继续；记录可暂停、可撤销、可导出 |
| 🗂️ **知识持续沉淀** | 上传文档资料，将资料自动维护为 Wiki 知识库，并让对话结果继续回流到笔记、文档和后续学习中 |
| 🔐 **自定义模型与数据控制** | 接入自有 API Key、OpenAI-compatible、Anthropic、OpenAI Responses 服务或本地 Ollama 模型；自定义 Agent、Token 消耗统计、权限沙箱与三种数据备份 |

### Agent 驱动的工作方式

1. **选择Agent**：在同一个学习工作台里切换内置 Agent 或自定义 Agent，例如课程助教、复习教练和文档助手等。
2. **共享上下文**：Agent 可以访问当前选择的文档、文件夹、知识库、笔记和工具；切换角色时不必重复选择资料。
3. **调用能力**：Agent 根据任务调用 Skills、文件工具、Office 文档操作、知识库检索和MCP等。
4. **控制执行**：命令执行、文件写入、外部请求和 MCP 工具都受权限、请求限制和安全沙箱控制。
5. **输出沉淀**：对话、文档查询、可视化结果和学习产物保存本地，可随时查看。


</details>

<details>
<summary><b>🔄 学习闭环</b></summary>

## 学习闭环

1. **导入资料**：上传 Office、PDF、Markdown、图片、音视频等本地资料，也可以通过 URL 导入内容。
2. **选择 Agent 与上下文**：切换适合当前任务的 Agent，并选择文档、文件夹或知识库；多个 Agent 可以共享同一套资料、笔记和工具上下文。
3. **理解与追问**：让 Agent 进行问答、总结、比较、解释、改写和深度研究；必要时创建对话分支，保留不同思路。
4. **生成学习产物**：把资料变成测验、闪卡、思维导图、知识图谱、图表、PPT、播客等可直接使用的成果。
5. **沉淀与复用**：将重要结果保存为笔记、文档或 Wiki 页面，之后继续检索、复习和追问。

### 一个完整例子

以一段课程录屏和配套课件为例：

1. 导入视频和课件，完成语音转录、关键帧提取与文档解析。
2. 选择课程助教 Agent，让它结合视频内容和课件解释重点概念。
3. 切换复习教练 Agent，共享已有上下文并生成测验、闪卡和思维导图。
4. 把错题解析和章节总结保存到笔记，由 Agent 继续维护课程 Wiki。
5. 下一次复习时直接检索知识库、查看历史对话，并围绕薄弱知识点继续学习。


</details>

<details>
<summary><b>🛠️ Agent 工作台完整功能</b></summary>

## Agent 工作台完整功能

### 💬 对话与上下文

- 对话分组、历史管理、消息导出和对话分支
- 在对话中选择本地文档、文件夹、知识库或当前工作区作为上下文
- 在学习工作台中随时切换 Agent，并保留可复用的资料上下文
- 支持 `@` 快捷输入和 `/` 斜杠命令调用技能
- 支持流式响应、任务状态、对话任务通知和后台任务进度
- 支持摘要目录导航和对话缩略图导航两种跳转方式，长对话不必一直滚
- 支持语音输入，输入框可自定义显示附件、知识库、语音、Token 计数和耗时
- 支持思考过程展示、Agent 步骤与工具调用可视化
- 支持从 Agent 输出中直接查询文档、打开查询来源，并预览 HTML、图表和其他可视化产物

### 🎓 可视化学习与内容创作

Reviva 不只输出文本答案。学习工作台可以把当前对话、选中文档、知识库或手动主题加工成可练习、可浏览、可展示的学习产物：

| 工具 | 适合做什么 |
| --- | --- |
| 测验 | 生成单选、多选、判断、填空和简答题，定位薄弱知识点 |
| 闪卡 | 将概念、公式、词汇和错题拆成可重复复习的记忆卡片 |
| 知识卡片 | 围绕考点生成四种交互卡，支持遮挡自测、手势滑动、间隔重复轮次和进度统计 |
| Q&A | 生成 FAQ 与思考问答，适合常见疑问和易错点整理 |
| 术语表 | 整理专业术语与定义，形成可检索的课程术语页 |
| 速查表 | 浓缩公式、解题步骤和易错点，复习时一页看完 |
| 思维导图 | 把章节、课程或项目整理为层级结构 |
| 知识图谱 | 展示概念、人物、事件和知识点之间的关系 |
| 图表 | 生成流程图、对比图、矩阵图及其他可视化结果 |
| 学习指南 | 生成结构化学习材料与综合摘要 |
| PPT | 从资料、知识库或研究结果生成演示文稿 |
| 深度研究 | 拆解问题、收集证据并生成结构化研究报告 |
| 播客 | 将长文档和课程资料改写为适合收听的播客脚本与音频 |

13 个工具里 12 个可以本地生成，播客走云端服务。本地生成适合快速学习和整理；PPT、深度研究和部分云端创作能力可能需要云端模型或按量计费服务。创作工具在设置页可控制显示、隐藏与排序。

### 📄 文档、Office 与 OCR

- 文档模块支持 Office、PDF、Markdown等常见格式
- 支持上传文件、批量导入、文件夹管理和 URL 导入
- Agent 可以读取、总结、校对、编辑和创建 Office 文档
- 上传资料时可以选择本地解析或配置的文档解析服务
- 支持配置 OCR 模型，用于 PDF 和图片文字识别
- URL 导入支持网页抓取和正文提取
- 支持文档预览、输出结果查看、软删除和回收站恢复

### 🎬 音视频解析与对话

- 支持导入常见音频和视频文件，并在文档中心统一管理
- 支持音视频解析和语音转录，将长内容变成可搜索、可引用的文本
- 支持从视频中提取关键帧，辅助理解课件、演示、访谈和课程录屏
- 支持查看媒体解析详情、转录内容、时间信息和关键帧结果
- 在对话页面选择已解析的音视频，即可让 Agent 围绕媒体内容进行总结、问答和学习辅导

### 🤖 Agent 与扩展

- 内置 18 个学习向 Agent：通用学习助手、概念解释器、费曼学习教练、苏格拉底导师、期末复习助手、考试模拟器、错题分析器、测验生成器、闪卡生成器、K12 数学/英语/物理/化学学习助手、计算机专业课与计算机网络学习助手、考公备考助手、教学教研助手、演示制作助手
- 内置 61 个 Skill，覆盖学习方法、学科内容、可视化动画、创作办公和教学教研；支持用户创建、AI 生成和导入自定义 Skill
- 支持用户创建和管理自定义 Agent，并提供 Agent 健康检查
- 多个 Agent 可以共享知识库、文档、笔记和工具上下文
- 每个 Agent 可以独立配置提示词、模型、Skills、工具、知识库和输出风格
- 支持文件读取、写入、联网搜索、知识库查询等内置工具
- 支持自定义工具和 HTTP/SSE MCP 工具服务
- 支持 Agent 运行权限、命令执行权限、请求限制和安全沙箱配置
- 支持添加全局 Agent 记忆，让个人偏好、长期背景和常用规则在不同 Agent 与对话中复用

### 🗂️ 知识沉淀

- 支持创建多个 Wiki 知识库，按课程、论文、项目或主题组织资料
- 上传并选择文档后，可由 Agent 自动整理和维护 Wiki 页面
- 支持来源追溯、知识库检索和基于资料的问答
- 支持 Markdown 笔记、文件夹、搜索、预览、代码块折叠和 AI 辅助编辑
- 支持 Wiki 页面检查（Lint）与语义审计，来源可回指到原始资料

### 🔌 外部知识库（KBP，Beta）

Reviva 内置 **KBP（Knowledge Base Protocol）**，让 Agent 在对话时直接检索你的私有知识库。

- **Dify / FastGPT**：填入 API Key 即可一键获取知识库列表
- **MCP 服务器**：自动发现已有的检索工具，零配置
- **自定义知识库**：粘贴 HTTP 请求/响应示例，由 AI 解析生成适配配置
- 侧边栏可按会话选择启用检索，API Key 存储在本地

> 该功能目前处于 Beta 阶段，核心场景已可用。

### ⚙️ 系统与数据

- 支持浅色 / 深色主题、7 套内置主题随意切换、自定义 CSS 主题（Beta）、主题色和 Agent 语气风格设置
- 支持配置对话、语音（ASR）、图像生成编辑和 OCR 四类模型，覆盖自有 API Key、OpenAI-compatible、Anthropic、OpenAI Responses 协议和本地模型
- 支持成长画像（Beta）：跨对话维护学习目标、概念掌握状态、误区与复习需求，记录可暂停、可撤销、可导出
- 支持 Token 消耗查询、模型调用和任务状态统计可视化
- 支持全局快捷键、任务通知和自动更新检查
- 支持新手教程页面，引导完成工作目录、模型配置和第一轮资料对话
- 支持检测 Pandoc、Manim、FFmpeg、OfficeCLI 等运行环境，按需安装即可
- 支持三种数据备份：完整数据备份、精简备份、数据库备份
- 支持统一回收站，可恢复或永久删除文档、笔记、对话等内容
- 支持多工作区登记、切换与迁移，支持清除系统缓存和临时文件
- 支持本地网关服务，对外提供 OpenAI Chat Completions、Responses API 等方式调用 Agent


</details>

<details>
<summary><b>📦 产品模块</b></summary>

## 产品模块

| 模块 | 说明 |
| --- | --- |
| 仪表盘 | 查看最近活动、快捷入口和任务状态 |
| 学习工作台 | 与 Agent 对话，引用资料，切换 Agent，触发学习工具和创作任务 |
| 智能体 | 创建、编辑和管理内置或自定义 Agent |
| Skills | 管理可绑定到 Agent 的内置和自定义能力模块 |
| 工具 | 管理内置工具、自定义工具和 MCP 服务 |
| 知识库 / Wiki | 管理知识库，沉淀课程、论文、项目和复习资料 |
| 外部知识库 | 接入 Dify、FastGPT、MCP 或自定义 HTTP 知识库，对话时自动检索（Beta） |
| 文档 | 管理本地资料、文件夹、Office 文档和媒体文件 |
| 笔记 | 创建和管理 Markdown 笔记与目录 |
| 任务 | 跟踪生成任务、媒体解析任务和学习任务 |
| 输出中心 | 管理 Agent 生成的文档、查询结果和可视化成果 |
| 回收站 | 统一恢复或永久删除文档、笔记、对话等内容 |
| 设置 | 配置模型、语音、OCR、外观、权限、数据、环境和用量统计 |


</details>

<details>
<summary><b>📋 典型使用场景</b></summary>

## 典型使用场景

### 期末复习

1. 按课程建立 Wiki 知识库，例如"数据结构期末复习""概率论复习资料"。
2. 导入课件、老师划重点、历年题、错题、课堂笔记和教材章节。
3. 让 Agent 根据资料整理章节大纲、重点概念、公式清单和高频考点。
4. 针对薄弱章节生成测验题、闪卡和错题回顾。

### 课程学习

1. 导入课件、教材、习题和课堂笔记。
2. 创建课程 Wiki 知识库并选择学习教练 Agent。
3. 围绕章节提问，让 Agent 引用资料解释难点。
4. 生成测验和闪卡，完成自测后回到对话继续追问。

### 音视频学习

1. 导入课程录屏、访谈或讲座视频。
2. 进行转录并提取关键帧，定位重要时间点。
3. 在对话中针对某一段内容提问，要求 Agent 总结或解释。
4. 将内容整理为笔记、闪卡、测验或播客脚本。

### 个人第二大脑

1. 持续把阅读、工作和学习资料放入本地工作区。
2. 用不同 Agent 处理写作、编程、翻译、复习和研究任务。
3. 将高价值结论沉淀到笔记和 Wiki 知识库。
4. 下一次遇到相似问题时，直接检索并复用已有理解。


</details>

## 快速开始

1. 从上方渠道下载并安装 Reviva。
2. 首次启动时选择本地工作目录和授权根目录。
3. 在设置中配置一个 LLM 服务商、API Key 或本地模型。
4. 导入一份文档，或直接创建一个知识库。
5. 打开学习工作台，选择 Agent 和资料后开始提问。


## 本地优先

- 对话、文档、笔记、知识库、Agent 配置和任务记录主要保存在本地工作目录及 SQLite 数据库中。
- 文件工具通过授权根目录和虚拟文件系统访问，降低误读写系统敏感路径的风险。
- 你可以自行迁移、备份和删除本地数据，不必绑定某个云平台。
- AI 请求是否发送到云端，取决于你配置的模型、OCR、语音和检索服务。
- 使用云端模型、搜索工具或远程 MCP 服务前，请确认对应服务商的数据政策和费用规则。

## 项目状态

Reviva 当前正式版本为 `1.4.2`，功能和界面仍在持续更新。项目主要面向 Windows 和 macOS 桌面端，建议在长期使用前做好重要数据备份。

遇到问题欢迎提交 [GitHub Issues](https://github.com/mingchen666/Reviva/issues)。

## 未来计划

- [ ] 支持ima作为外部知识源
- [ ] 支持夸克网盘skill
- [ ] 更丰富的内置 Agent 和 Skills
- [ ] 更多......

<details>
<summary><b>✅ 已完成</b></summary>

- [x] 支持检查自动更新
- [x] 支持Url导入爬取
- [x] 音视频文件解析处理
- [x] wiki支持链接和音视频解析
- [x] 支持response api格式
- [x] 自定义skill
- [x] 对话页面导航功能
- [x] 更完善的导入导出与备份能力
- [x] Agent 自主学习成长闭环（长期积累用户偏好、学习画像、薄弱点，所有成长结果可审计、可撤销、可评测）目前beta
- [x] 接入外部知识库（KBP 协议，支持 Dify / FastGPT / MCP / 自定义 HTTP）目前beta
- [x] 新增知识卡片、学习指南、Q&A、术语表、速查表五个创作工具
- [x] 语音输入、图像生成编辑模型配置与 7 套内置主题
- [x] 新手教程页面与本地开放服务接入文档
- [x] 自定义主题和字体大小设置

</details>


## 开源协议与商业授权

本项目采用 **AGPL-3.0 + 商业许可** 双授权模式。

### 个人用户

- 个人学习、研究和自用永久免费，无需付费或申请授权。
- 你可以在 AGPL-3.0 协议下自由使用、修改和自部署 Reviva。
- 修改后的版本，需按 AGPL-3.0 要求开放源码。

### 商业与多人使用

以下场景需要提前联系作者获取商业授权：

- 企业、机构或团队内部多人使用
- 商业化产品或收费服务中集成 Reviva
- 二次开发后用于客户项目、培训交付或商业解决方案
- 作为闭源产品、SaaS 服务或私有化部署的一部分
- 二次分发、白标包装或嵌入其他商业软件
- 移除、隐藏或修改 Reviva 的版权和授权声明

## 免责声明

AI 生成内容可能存在错误、遗漏或不适合直接使用的情况。请在学习、研究、商业、法律、医疗等重要场景中自行核验。Reviva 不对模型输出的准确性、完整性或适用性作保证。


---

## 联系与交流

- 问题反馈：[GitHub Issues](https://github.com/mingchen666/Reviva/issues)
- 项目主页：[GitHub](https://github.com/mingchen666/Reviva)
- 合作与交流：可通过下方微信联系作者
- 用户交流群：微信群已迁移至 QQ 群，欢迎扫码加入！

<table>
  <tr>
    <td align="center"><b>联系作者</b></td>
    <td align="center"><b>QQ 交流群</b></td>
  </tr>
  <tr>
    <td align="center"><img src="./docs/images/my.jpg" alt="微信" /></td>
    <td align="center"><img src="./docs/images/qq-group.jpg" alt="QQ交流群" /></td>
  </tr>
</table>

## 支持作者

Reviva 从设计、开发到打磨，投入了大量心血与无数个日夜。如果它对你的学习或工作有帮助：

- ⭐ **给个 Star** —— 让更多人看到 Reviva，也是作者持续更新的动力
- 💬 **推荐给朋友** —— 如果你觉得好用，欢迎分享给身边的同学和同事
- ☕ **请作者喝杯咖啡** —— 你的支持是持续开发的动力

<img src="./docs/images/sponsor.png" alt="赞赏" width="400" />

## 作者的其他项目

<table>
  <tr>
    <td width="55%" align="center">
      <h3>🔥 KnowStep</h3>
      <p><b>专业的音视频学习工作台</b></p>
      <p>支持抖音、B站等平台手机扫码上传音视频，AI 自动总结、转录、提取关键帧，打造你的音视频学习闭环。</p>
      <p>
        <a href="https://www.knowstep.cn/">
          <img src="https://img.shields.io/badge/官网-KnowStep-4A6CFF?style=for-the-badge&logo=googlechrome&logoColor=white" alt="KnowStep 官网" />
        </a>
      </p>
    </td>
    <td width="45%" align="center">
      <h3>DocTranslator</h3>
      <p>AI 驱动的文档翻译平台</p>
      <p>
        <a href="https://github.com/mingchen666/DocTranslator">
          <img src="https://img.shields.io/badge/GitHub-DocTranslator-111827?style=for-the-badge&logo=github&logoColor=white" alt="DocTranslator" />
        </a>
      </p>
    </td>
  </tr>
</table>

## 致谢

- [Vue.js](https://vuejs.org/) · [Electron](https://www.electronjs.org/) · [Vite](https://vitejs.dev/)
- [DeepAgents](https://github.com/langchain-ai/deepagentsjs)
- [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)
- [Linux Do](https://linux.do/)

感谢所有开源贡献者和社区用户。

<p align="center"><a href="#reviva">⬆ 返回顶部</a></p>
