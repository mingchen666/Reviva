# 刷题报告模板

## 整组报告

```markdown
## 本组结果
- 模式：逐题/批量/限时/错题重做
- 题量：
- 正确数/正确率：
- 用户报告用时：
- 题源构成：

## 分题结果
| 题号 | 模块/子题型 | 来源 | 用户答案 | 正确答案 | 结果 | 用时 | 主错因 |

## 主要发现
- 稳定掌握：
- 需要修复：
- 速度问题：
- 低把握但做对：

## 下一组建议
- 题型：
- 数量：
- 难度：
- 目标：
```

## 错题记录

```markdown
### 题目ID/题号
- 来源：
- 题型：
- 原答案：
- 正确答案：
- 主错因：
- 正确方法：
- 重做日期：
- 重做状态：
```

## XLSX 推荐列

```text
session_id, question_id, date, source_type, source_title, source_url,
exam, region, year, paper_type, module, subtype, user_answer,
correct_answer, correct, confidence, time_seconds, primary_error,
secondary_error, retry_status, retry_date, notes
```

没有记录的用时、来源或把握度留空，不生成虚假数据。
