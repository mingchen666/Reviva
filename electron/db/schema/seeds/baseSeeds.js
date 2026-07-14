import { BaseRepository } from '../../repositories/BaseRepository.js'

export class SeedManager extends BaseRepository {
  _seedBuiltinData() {
    // Seed default conversation group
    const grpCount = this.db.prepare('SELECT COUNT(*) as c FROM conv_groups WHERE id = \'default\'').get()
    if (grpCount.c === 0) {
      this.db.prepare('INSERT INTO conv_groups (id, name, sort_order) VALUES (?, ?, ?)').run('default', '默认分组', 0)
    }

    const count = this.db.prepare('SELECT COUNT(*) as c FROM agents WHERE builtin = 1').get()
    if (count.c > 0) return

    const insert = this.db.prepare(`
      INSERT INTO agents (id, name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, planning_model, plan_steps, temperature)
      VALUES (@id, @name, @description, @icon, @color, @architecture, @builtin, @permissions, @tools, @skills, @sub_agents, @prompt, @max_iterations, @planning_model, @plan_steps, @temperature)
    `)

    const agents = [
      { id: 'agent_1', name: '错题分析助手', description: '基于错题集进行错误原因分析，提供针对性改进建议', icon: 'ri-search-eye-line', color: '#A78BFA', architecture: 'react', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":false,"fileRename":false,"webSearch":true,"kbSearch":true}',
        tools: '["web_search_tavily","file_read","kb_search"]', skills: '["quizzes","summary"]', sub_agents: '["Reader"]',
        prompt: '你是一个专业的错题分析助手。当用户提供错题时，你需要：\n1. 识别错误类型（概念性/计算性/审题性）\n2. 分析错误根因\n3. 提供同类题目的解题思路\n4. 推荐复习方向',
        max_iterations: 10, planning_model: '', plan_steps: 5, temperature: 0.7 },
      { id: 'agent_2', name: '复习规划师', description: '制定个性化复习计划，跟踪复习进度并动态调整', icon: 'ri-calendar-check-line', color: '#4ADE80', architecture: 'plan_exec', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":true,"fileRename":false,"webSearch":false,"kbSearch":true}',
        tools: '["file_read","file_write","kb_search"]', skills: '["outline","cram_sheet","summary"]', sub_agents: '["Reader","Summarizer","Review Planner"]',
        prompt: '你是一个复习规划专家。根据用户的学习资料和考试时间，制定详细的复习计划。',
        max_iterations: 5, planning_model: 'claude-4-7-opus', plan_steps: 5, temperature: 0.5 },
      { id: 'agent_3', name: '概念解释器', description: '用苏格拉底式追问帮助用户深入理解概念', icon: 'ri-chat-smile-2-line', color: '#6C8AFF', architecture: 'react', builtin: 1,
        permissions: '{"fileRead":false,"fileWrite":false,"fileRename":false,"webSearch":true,"kbSearch":true}',
        tools: '["web_search_tavily","kb_search"]', skills: '["summary","mindmap"]', sub_agents: '[]',
        prompt: '你是一个苏格拉底式教学助手。通过连续追问引导用户自己思考和理解。',
        max_iterations: 10, planning_model: '', plan_steps: 5, temperature: 0.8 },
      { id: 'agent_4', name: '摘要助手', description: '快速生成文档摘要，支持多种格式输出', icon: 'ri-file-text-line', color: '#6C8AFF', architecture: 'react', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":false,"fileRename":false,"webSearch":false,"kbSearch":true}',
        tools: '["file_read","kb_search"]', skills: '["summary"]', sub_agents: '["Reader","Summarizer"]',
        prompt: '你是一个文档摘要专家。阅读文档后，生成结构清晰的摘要。',
        max_iterations: 10, planning_model: '', plan_steps: 5, temperature: 0.3 },
      { id: 'agent_5', name: '测验生成器', description: '基于学习资料自动生成测验题与答案', icon: 'ri-question-line', color: '#FACC15', architecture: 'react', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":true,"fileRename":false,"webSearch":false,"kbSearch":true}',
        tools: '["file_read","file_write","kb_search"]', skills: '["quizzes","flashcards"]', sub_agents: '["Quiz","Reader"]',
        prompt: '你是一个测验出题专家。根据学习资料生成不同难度和类型的测验题目。',
        max_iterations: 10, planning_model: '', plan_steps: 5, temperature: 0.7 },
      { id: 'agent_6', name: '知识整理师', description: '对空间资料进行结构化知识编译与整理', icon: 'ri-node-tree', color: '#F87171', architecture: 'plan_exec', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":true,"fileRename":true,"webSearch":false,"kbSearch":true}',
        tools: '["file_read","file_write","file_rename","file_list","kb_search"]', skills: '["outline","mindmap","summary"]', sub_agents: '["Reader","Summarizer"]',
        prompt: '你是一个知识整理专家。结合知识库检索和本地资料读取，对空间资料进行结构化整理。',
        max_iterations: 5, planning_model: '', plan_steps: 5, temperature: 0.4 },
    ]

    this.db.transaction(() => { for (const a of agents) insert.run(a) })()
  }
}

