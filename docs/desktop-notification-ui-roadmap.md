# 桌面 UI 通知未来实现说明

## 当前状态

当前通知策略暂时只保留声音通知，不再实现桌面右下角消息卡片。

现有声音通知链路应保持简单：

- Agent 任务完成或失败后，由主进程触发声音，避免窗口最小化、切换到其他软件后 renderer 事件不稳定。
- Renderer 侧只做兜底播放，且只在主窗口活跃但用户不在当前对话页时使用。
- 用户设置仍然控制任务完成、任务失败、通知声音、勿扰模式。

未来如果重新加入桌面 UI 通知，应作为独立模块实现，不要和声音通知逻辑混在一起。

## 目标

未来桌面 UI 通知需要解决这些问题：

- 用户切到其他软件、窗口最小化、后台运行时，任务完成或失败能看到提示。
- 通知卡片不是系统原生 Notification 的不可控样式，而是 Reviva 自定义 UI。
- UI 可维护，后续可以增加通知类型、操作按钮、通知中心、跳转行为。
- 通知不会依赖主应用 Vue 路由是否已经构建进 `dist`。
- 通知失败不影响 Agent 任务完成流程。

## 不做的事

第一版不建议做这些：

- 不做复杂通知中心历史记录。
- 不做跨设备推送。
- 不做系统通知权限申请流程。
- 不做每个任务类型的完整通知模板库。
- 不把通知卡片塞进 `MsMessage`，因为 `MsMessage` 是应用内 toast，不是桌面级通知。

## 推荐架构

建议拆成四层。

### 1. NotificationService 主进程服务

新增文件建议：

```text
electron/NotificationService.js
```

职责：

- 读取通知相关设置。
- 判断是否需要通知。
- 管理桌面通知窗口队列。
- 管理通知去重。
- 管理点击通知后的行为。
- 提供声音播放入口。

主进程初始化时注入依赖：

```js
notificationService = new NotificationService({
  getWindow: () => win,
  dbService,
})
```

AgentService 不应该直接创建窗口，只调用：

```js
notificationService.notifyTask({
  kind: 'done',
  runId,
  conversationId,
})
```

### 2. DesktopNotificationWindow 桌面小窗

桌面 UI 通知应该使用独立 `BrowserWindow`，不要复用主应用路由。

推荐实现：

- `frame: false`
- `transparent: true`
- `skipTaskbar: true`
- `show: false`
- `resizable: false`
- `alwaysOnTop`
- `showInactive()`

定位优先使用当前用户所在屏幕：

```js
screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
```

不要优先使用主窗口坐标，因为主窗口最小化时坐标可能不可靠。

### 3. 独立通知模板

推荐新增：

```text
electron/desktop-notification-template.html
```

或：

```text
electron/DesktopNotificationTemplate.js
```

原因：

- 不依赖 `dist/assets`。
- 不依赖 Vue router。
- 不需要主应用 store 初始化。
- 打包后路径更可控。

如果未来希望用 Vue 写组件，也建议单独建一个 renderer entry，例如：

```text
src/desktop-notification/main.js
src/desktop-notification/DesktopNotificationCard.vue
```

并在 Vite 里配置独立入口，而不是挂到主应用路由。

### 4. Renderer 侧只负责用户设置和试听

设置页只负责：

- 打开/关闭通知类型。
- 设置声音类型。
- 试听声音。
- 未来可以测试 UI 通知。

设置页不应该直接管理通知窗口生命周期。

## 建议 API

主进程内部 API：

```js
notificationService.notifyTask({
  kind: 'done' | 'failed',
  runId,
  conversationId,
  title,
  body,
})
```

Renderer IPC：

```js
window.electronAPI.notifications.preview({
  kind: 'done',
})
```

桌面通知窗口 IPC：

```js
desktop-notification:getPayload
desktop-notification:activate
desktop-notification:close
```

注意：这些 IPC 应该只暴露给通知窗口 preload 或做好 sender 校验，避免普通页面误调用。

## 设置项建议

现有设置可以继续复用：

- `notifyTaskDone`
- `notifyTaskFailed`
- `notifySound`
- `notifySoundType`
- `notifyDND`

未来如需 UI 通知，可以新增：

- `notifyDesktopCard`: 是否启用桌面卡片。
- `notifyDesktopCardDuration`: 卡片停留时间。
- `notifyDesktopCardClickAction`: 点击行为，例如聚焦主窗口、打开对应对话。

不要让 `notifySound` 同时代表 UI 卡片开关。声音和卡片应该独立。

## 任务通知触发点

推荐由主进程触发，主要原因：

- Agent 执行本身在主进程。
- 主进程不受页面可见性、路由、组件卸载影响。
- 最小化、切到其他软件时也更稳定。

推荐接入点：

- `electron/AgentService.js` 的 `agent:runDone`
- `electron/AgentService.js` 的 `agent:runError`
- 人工审批 resume 后的 `runDone` 和 `runError`
- 迭代上限 `recursion_limit` 按失败或警告处理

Renderer 侧可以保留兜底，但必须有去重机制。

## 去重策略

通知去重 key 建议：

```js
const dedupeKey = `agent:${runId}:${kind}`
```

短时间内同 key 只展示一次，建议窗口：

```text
3000ms - 5000ms
```

这样可以避免主进程和 renderer 兜底同时触发时重复弹卡片或重复响铃。

## 点击行为

第一版点击通知建议只做：

- 关闭通知。
- 聚焦主窗口。
- 如果有 `conversationId`，跳转到对应对话。

不要第一版就做复杂操作，例如“重新运行”“打开文件”“忽略此类通知”。这些动作需要权限、状态校验和错误处理。

## UI 设计建议

通知卡片应保持紧凑，不要做成营销卡片。

建议尺寸：

```text
宽度: 360px - 400px
高度: 96px - 128px
圆角: 8px
```

内容结构：

- 来源：Reviva
- 状态：完成、失败、提醒
- 标题：任务已完成 / 任务执行失败
- 内容：对话标题或简短错误原因
- 关闭按钮
- 可选进度条，表示自动关闭倒计时

失败通知颜色可以用红色，成功通知可以用绿色，但主体背景应保持克制。

## 多屏和定位

默认弹到当前用户所在屏幕的右下角：

```js
screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
```

不要默认使用主窗口所在屏幕，因为主窗口可能：

- 已最小化。
- 被隐藏到托盘。
- 在另一块屏幕。
- 坐标被系统还原成异常值。

多个通知堆叠时，建议最多显示 3 到 4 条。超过数量先关闭最旧的。

## 声音与 UI 的关系

声音通知和 UI 通知应独立：

- 声音可以成功，但 UI 卡片失败。
- UI 卡片可以成功，但声音关闭。
- 勿扰模式应同时关闭两者。

如果 UI 卡片失败，不应该影响声音播放。

## 失败兜底

桌面卡片创建失败时：

- 记录 warn 日志。
- 不阻塞任务流程。
- 可以选择回退系统原生 `Notification`，但这不是必须。
- 声音仍然应继续尝试播放。

## 测试清单

未来实现后至少验证：

- 主窗口当前在对话页，当前对话完成：不提示或按产品策略提示。
- 主窗口在其他页面，对话完成：提示。
- 主窗口最小化，对话完成：提示。
- 主窗口隐藏到托盘，对话完成：提示。
- 用户切到其他软件，对话完成：提示。
- 多屏环境下，通知出现在当前鼠标所在屏幕。
- 连续多个任务完成时不会无限堆叠。
- 点击通知能聚焦主窗口。
- 失败任务显示失败样式。
- 勿扰模式关闭所有通知。
- 关闭声音时不播放声音。
- 关闭 UI 卡片时只播放声音。

## 迁移步骤建议

1. 保持当前声音通知逻辑稳定。
2. 新增 `NotificationService`，先只接管声音通知。
3. 增加桌面卡片窗口，但默认关闭。
4. 设置页新增 `notifyDesktopCard` 开关。
5. 加测试通知按钮。
6. 接入 AgentService 的任务完成和失败事件。
7. 做多屏、最小化、托盘、后台场景验证。
8. 最后再考虑通知中心和历史记录。

## 注意事项

- 不要把桌面通知做成应用内 toast。
- 不要依赖主应用 Vue 路由加载通知页。
- 不要让通知窗口初始化 Pinia、router、自动更新、快捷键等主应用逻辑。
- 不要在 renderer 里作为唯一触发点。
- 不要让通知失败影响 Agent 执行结果。
