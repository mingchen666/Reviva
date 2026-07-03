---
description: Reviva 内置 deep-research skill 的更新说明
---

<command-instruction>
这是 Reviva 内置 deep-research skill，不支持由 Agent 在用户端自动执行 GitHub 更新。

## 当前规则

- 不执行 `git pull`、`git clone` 或任何自动覆盖内置 skill 的命令。
- 不自动安装 Python、Scrapling、SearXNG、浏览器或其它外部依赖。
- 不修改 `/skills/deep-research/` 目录下的源文件。
- 若用户询问如何更新，说明：内置 skill 随 Reviva 应用版本更新；开发者需要在 `electron/builtin-assets/skills/deep-research/` 中更新并随应用发布。

## 输出

用简短中文说明：

```text
当前 deep-research 是 Reviva 内置技能，不能在运行时自动拉取 GitHub 更新。请通过应用版本更新或开发者内置资产更新来升级。
```
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>

---
deep-research by hoolulu · adapted for Reviva
