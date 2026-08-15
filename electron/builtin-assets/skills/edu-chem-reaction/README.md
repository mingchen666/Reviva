# 化学反应微观演示

这是随 MindSpace 发布的内置 Skill。它将教材范围内的化学反应制作成单文件 HTML，页面含 Three.js 分子动画、KaTeX 方程、断键成键高亮、原子守恒计数和可选能量/电子转移叠加层。

## 使用范围

- 已注册范例：甲烷燃烧、氢气燃烧、电解水、钠与氯气反应、酯化、葡萄糖有氧氧化。
- 可基于 `references/problem-schema.md` 编写 reaction spec，但物种、原子映射和键变化必须能被内置 kernel 校验。
- 图片中的方程需要先由 `vision_analyze` 识别并让用户确认；模糊或缺少条件时不猜测。

这不是通用反应预测器或化学式解析器。内置分子库不支持的物种、无法验证的反应式或机理，必须明确说明限制，不生成看似正确的动画。

## MindSpace 工具与路径

Skill 使用 `file_read`、`file_write`、`vision_analyze` 和 `exec_command`。使用它的 Agent 还需要对应的文件和命令执行权限。

最终 HTML 必须写入当前 Agent 的真实输出目录：

```text
/agents/<当前Agent英文名>/outputs/<系统提供的真实日期>/reaction-<name>.html
```

临时 spec 和检查文件写入当前 Agent 的 `/tmp/<当前Agent英文名>/<系统提供的真实日期>/`。`/skills/edu-chem-reaction/` 是只读内置资产目录，不能写入结果。成果中心由 MindSpace 在 Agent 结束后扫描输出目录注册，Skill 不直接操作数据库。

## 命令

在 `exec_command(command=...)` 中使用环境检测确认可用的 Python：

```text
python /skills/edu-chem-reaction/scripts/generate.py list
python /skills/edu-chem-reaction/scripts/check_dependencies.py
python /skills/edu-chem-reaction/scripts/generate.py combustion_ch4 <output.html>
python /skills/edu-chem-reaction/scripts/generate.py spec <reaction-spec.json> <output.html>
python /skills/edu-chem-reaction/scripts/check_output.py <output.html>
python /skills/edu-chem-reaction/scripts/check_output.py <output.html> --node-check <temporary-module.mjs>
```

生成脚本要求显式输出路径，自动创建目标父目录，并拒绝写入 Skill 目录。不要启动 localhost 或后台预览服务。

## 依赖和降级

- Python 和 `sympy` 是生成硬依赖。先运行 `check_dependencies.py`；如果缺失，向用户展示一次性 `python -m pip install ...` 命令，获得明确确认后再执行并重新检测。检测器不会自行安装。
- Node 是可选增强检查。传入当前 Agent `/tmp` 目录内的 `.mjs` 临时路径时，校验器会提取内联页面脚本并运行 `node --check`；缺失时仍可执行 Python 和 HTML 结构检查。
- 页面为单文件 HTML，但 Three.js、KaTeX 和 Tailwind 通过 CDN 加载。生成成功不代表离线环境可完整运行；首次打开需要访问相应 CDN。

## 更新

应用启动时会扫描内置 Skill。MindSpace 对 platform 来源副本会在版本变化或规格无效时刷新；不要把用户自定义 Skill 当作可覆盖目标。
