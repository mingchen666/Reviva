---
name: management-commands
description: >
  teacher-skill 管理命令表、进化模式说明、教学档案结构。
  用户输入管理命令时加载本文件执行对应操作。
version: 2.1.0
---

# 管理命令表

用户可在学习过程中使用以下命令管理学习会话：

| 命令 | 说明 | 示例 |
|------|------|------|
| `/teacher status` | 查看当前学习进度（已完成单元、当前单元、完成百分比） | `/teacher status` |
| `/teacher reset` | 重置学习会话，清除所有进度记录，从 Phase 0 重新开始 | `/teacher reset` |
| `/teacher level` | 手动调整能力等级（强/中/弱），覆盖自动诊断结果 | `/teacher level 中` |
| `/teacher skip` | 跳过当前学习单元，直接进入下一个单元 | `/teacher skip` |
| `/teacher review` | 回顾已学内容，列出已掌握的知识点和关键概念 | `/teacher review` |
| `/teacher quit` | 结束当前学习会话，保存进度以便下次继续 | `/teacher quit` |
| `/teacher style` | 查看当前教学风格档案（如果已加载） | `/teacher style` |
| `/teacher style off` | 关闭风格模仿，恢复默认教学风格 | `/teacher style off` |
| `/teacher style more` | 增强风格模仿强度，更贴近目标教师 | `/teacher style more` |
| `/update-teacher {slug}` | 追加新材料进化教学档案 | `/update-teacher wang-laoshi` |
| `/list-teachers` | 列出所有已创建的教学档案 | `/list-teachers` |
| `/teacher rollback {v}` | 回滚到指定版本 | `/teacher rollback v3` |
| `/teacher progress` | 查看学习状态详情（含各单元理解检查结果）v2.1 | `/teacher progress` |
| **`/teacher correct`** | **进入错误纠正模式——当 AI 讲错了/偏了时使用（v2.7）** | **`/teacher correct`** |

## 使用说明

- 这些命令在任何学习阶段都可以使用
- `/teacher reset` 会弹出确认提示，防止误操作
- `/teacher level` 切换后，后续教学将按新等级的策略进行
- `/teacher quit` 会自动保存当前进度，下次启动时可选择继续或重新开始
- `/teacher style` 系列命令仅在启用了风格模仿时有效
- `/teacher progress` 调用 `scripts/learning_state.py --load` 加载学习状态并展示

---

# 生成的教学档案结构

```
/agents/{当前Agent}/outputs/{真实日期}/teachers/{slug}/
├── SKILL.md              # 完整教学 Skill（教学策略 + 教学风格合并）
├── teaching-strategy.md   # 教学策略（内容组织、教学方法、评估方式）
├── teaching-style.md      # 教学风格（Layer 0-5 + Correction 分层结构）
├── meta.json             # 元数据（素材来源、分析时间、置信度等）
└── versions/             # 版本存档
```
