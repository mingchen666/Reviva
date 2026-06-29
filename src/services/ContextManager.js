// src/services/ContextManager.js — Context window builder: history, system prompt, agent config, skills

const ANSWER_STYLE_DIRECTIVES = {
  concise: '请用简洁风格回答：要点清单，结论先行，不废话。',
  detailed: '请用详细风格回答：逐层展开，步骤完整，有示例。',
  academic: '请用学术风格回答：术语规范，引用标注，逻辑严密。',
  socratic: '请用苏格拉底式风格回答：追问引导，不直接给答案，帮助用户自己推导结论。',
  exam: '请用应试精练风格回答：考点聚焦，答题模板，得分导向。',
  structured: '请用知识结构化风格回答：树状拆解，逻辑串联，体系构建。',
  casual: '请用通俗风格回答：日常比喻，口语化，零门槛。',
  patient: '请用循循善诱风格回答：温和耐心，小步推进，正反馈鼓励。',
}

export class ContextManager {

  buildContext({ messages, maxMessages = 50 }) {
    const completed = messages.filter(m => m.status === 'completed' || !m.status)
    const sliced = completed.slice(-maxMessages)
    return sliced.map(m => ({ role: m.role, content: m.content }))
  }

  buildSystemPrompt({ agent, ctxItems, skills, includeReactHint = true, answerStyle }) {
    let prompt = ''

    // 1. Agent prompt as base
    if (agent?.prompt) {
      prompt += agent.prompt
    }

    // 2. ReAct hint for react architecture
    if (includeReactHint && agent?.arch === 'react') {
      prompt += '\n\n请按照 Think→Act→Observe 模式回答问题。先思考，再行动，然后观察结果。'
    }

    // 3. Answer style directive (skip 'default' — no directive)
    if (answerStyle && answerStyle !== 'default' && ANSWER_STYLE_DIRECTIVES[answerStyle]) {
      prompt += '\n\n' + ANSWER_STYLE_DIRECTIVES[answerStyle]
    }

    // 4. Skills are handled by DeepAgents SkillsMiddleware (progressive disclosure via ## Skills System).
    //    No need to inject here — the framework auto-injects skill paths, descriptions, and read_file guidance.

    // 5. Context items injection
    if (ctxItems?.length) {
      const ctxContent = ctxItems
        .filter(i => i.content)
        .map(i => `### ${i.name}\n${i.content}`)
        .join('\n\n')
      if (ctxContent) {
        prompt += '\n\n## 参考资料\n' + ctxContent
      }
    }

    return prompt
  }
}