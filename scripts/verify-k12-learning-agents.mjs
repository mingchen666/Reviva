import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const agentsRoot = path.join(root, 'electron', 'builtin-assets', 'agents')
const skillsRoot = path.join(root, 'electron', 'builtin-assets', 'skills')

const subjects = [
  {
    agentId: 'k12-math-learning-assistant',
    skillId: 'k12-math-learning',
    referenceFile: 'teaching-and-error-rubric.md',
    visualReferenceFile: 'visual-routing.md',
    expectedSkills: ['math-explainer', 'geometry-assistant', 'exam2knowledge', 'exam-prep', 'mock-exam'],
    visualEvalMarkers: ['math-explainer', 'learning-visualization-skill'],
    requiresBatchExamAnalysis: true,
    requiresMedia: false,
    requiresExec: true,
  },
  {
    agentId: 'k12-english-learning-assistant',
    skillId: 'k12-english-learning',
    referenceFile: 'feedback-rubric.md',
    visualReferenceFile: 'visual-routing.md',
    expectedSkills: ['practice-quiz', 'error-analysis', 'flashcard-generator', 'learning-visualization-skill', 'exam-prep', 'mock-exam'],
    visualEvalMarkers: ['learning-visualization-skill'],
    requiresBatchExamAnalysis: false,
    requiresMedia: true,
    requiresExec: false,
  },
  {
    agentId: 'k12-physics-learning-assistant',
    skillId: 'k12-physics-learning',
    referenceFile: 'modeling-and-safety.md',
    visualReferenceFile: 'visual-routing.md',
    expectedSkills: ['concept-visualization-generator', 'math-explainer', 'exam2knowledge', 'exam-prep', 'mock-exam'],
    visualEvalMarkers: ['concept-visualization-generator', 'learning-visualization-skill'],
    requiresBatchExamAnalysis: true,
    requiresMedia: false,
    requiresExec: true,
  },
  {
    agentId: 'k12-chemistry-learning-assistant',
    skillId: 'k12-chemistry-learning',
    referenceFile: 'reaction-and-safety.md',
    visualReferenceFile: 'visual-routing.md',
    expectedSkills: ['concept-visualization-generator', 'edu-chem-reaction', 'exam2knowledge', 'exam-prep', 'mock-exam'],
    visualEvalMarkers: ['edu-chem-reaction'],
    requiresBatchExamAnalysis: true,
    requiresMedia: false,
    requiresExec: true,
  },
]

const toolPermissions = {
  file_list: 'fileRead',
  file_read: 'fileRead',
  file_write: 'fileWrite',
  exec_command: 'execCommand',
  kb_search: 'kbSearch',
  'manim:*': 'execCommand',
  'ffmpeg:*': 'execCommand',
}

const agentToolAliases = {
  'manim:*': 'exec_command',
  'ffmpeg:*': 'exec_command',
}

function toAgentToolId(toolId) {
  return agentToolAliases[toolId] || toolId
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function assertExists(filePath) {
  assert.ok(fs.existsSync(filePath), 'Missing required file: ' + path.relative(root, filePath))
}

function assertSkill(subject, agentConfig) {
  const skillDir = path.join(skillsRoot, subject.skillId)
  const skillConfigPath = path.join(skillDir, 'config.json')
  const skillPromptPath = path.join(skillDir, 'SKILL.md')
  const evalPath = path.join(skillDir, 'evals', 'evals.json')
  const referencePath = path.join(skillDir, 'references', subject.referenceFile)
  const visualReferencePath = path.join(skillDir, 'references', subject.visualReferenceFile)
  const mediaReferencePath = path.join(skillDir, 'references', 'listening-and-speaking.md')

  assertExists(skillConfigPath)
  assertExists(skillPromptPath)
  assertExists(evalPath)
  assertExists(referencePath)
  assertExists(visualReferencePath)
  if (subject.requiresMedia) assertExists(mediaReferencePath)

  const skillConfig = readJson(skillConfigPath)
  const skillPrompt = fs.readFileSync(skillPromptPath, 'utf8')
  const evals = readJson(evalPath)
  const frontmatter = skillPrompt.match(/^---\r?\n([\s\S]*?)\r?\n---/)

  assert.equal(skillConfig.id, subject.skillId, subject.skillId + ' config id must match its folder')
  assert.ok(skillConfig.allowedTools?.includes('mcp:exa'), subject.skillId + ' must permit Exa for contextual research')
  assert.ok(frontmatter, subject.skillId + ' must have YAML frontmatter')
  assert.match(frontmatter[1], new RegExp('(^|\\n)name: ' + subject.skillId + '(\\n|$)'))
  assert.equal(evals.skill_name, subject.skillId, subject.skillId + ' eval owner must match its folder')
  assert.match(skillPrompt, /默认联网来源是 Exa/)
  assert.match(skillPrompt, /初高中、题型与模拟/)
  assert.match(skillPrompt, /references\/visual-routing\.md/)
  assert.match(skillPrompt, /## 模糊请求入口/)
  if (subject.requiresMedia) {
    assert.ok(skillConfig.allowedTools?.includes('media_read'), subject.skillId + ' must permit media_read')
    assert.match(frontmatter[1], /\n  - media_read(?:\n|$)/)
    assert.match(skillPrompt, /references\/listening-and-speaking\.md/)
    assert.match(skillPrompt, /不能评估发音/)
  }
  assert.ok(Array.isArray(evals.evals), subject.skillId + ' evals must be an array')
  assert.ok(evals.evals.length >= 2 && evals.evals.length <= 3, subject.skillId + ' must have two or three eval scenarios')
  for (const scenario of evals.evals) {
    assert.ok(Number.isInteger(scenario.id), subject.skillId + ' eval id must be an integer')
    assert.equal(typeof scenario.prompt, 'string', subject.skillId + ' eval prompt must be text')
    assert.equal(typeof scenario.expected_output, 'string', subject.skillId + ' expected output must be text')
    assert.ok(Array.isArray(scenario.files), subject.skillId + ' eval files must be an array')
  }
  assert.ok(
    evals.evals.some((scenario) => subject.visualEvalMarkers.some((marker) => scenario.expected_output.includes(marker))),
    subject.skillId + ' needs an eval for its visualization route',
  )
  if (subject.requiresBatchExamAnalysis) {
    assert.ok(
      evals.evals.some((scenario) => scenario.expected_output.includes('exam2knowledge')),
      subject.skillId + ' needs an eval for batch exam analysis',
    )
  }
  if (subject.requiresMedia) {
    assert.ok(
      evals.evals.some((scenario) => scenario.expected_output.includes('media_read')),
      subject.skillId + ' needs an eval for authorized media learning',
    )
  }

  const agentToolIds = new Set(agentConfig.tools || [])
  for (const toolId of skillConfig.allowedTools || []) {
    assert.ok(agentToolIds.has(toAgentToolId(toolId)), subject.skillId + ' tool is not available to its Agent: ' + toolId)
    const permission = toolPermissions[toolId]
    if (permission) {
      assert.equal(agentConfig.permissions?.[permission], true, subject.agentId + ' needs permission ' + permission + ' for ' + toolId)
    }
  }
}

function assertBoundSkillPermissions(subject, agentConfig) {
  const agentToolIds = new Set(agentConfig.tools || [])
  for (const skillId of agentConfig.skills || []) {
    const skillConfigPath = path.join(skillsRoot, skillId, 'config.json')
    assertExists(skillConfigPath)
    const skillConfig = readJson(skillConfigPath)
    assert.equal(skillConfig.id, skillId, subject.agentId + ' bound Skill id must match its folder: ' + skillId)

    for (const toolId of skillConfig.allowedTools || []) {
      assert.ok(
        agentToolIds.has(toAgentToolId(toolId)),
        subject.agentId + ' lacks tool ' + toolId + ' required by bound Skill ' + skillId,
      )
      const permission = toolPermissions[toolId]
      if (permission) {
        assert.equal(
          agentConfig.permissions?.[permission],
          true,
          subject.agentId + ' needs permission ' + permission + ' for bound Skill ' + skillId,
        )
      }
    }
  }
}

function assertAgent(subject) {
  const agentDir = path.join(agentsRoot, subject.agentId)
  const configPath = path.join(agentDir, 'config.json')
  const promptPath = path.join(agentDir, 'PROMPT.md')

  assertExists(configPath)
  assertExists(promptPath)

  const config = readJson(configPath)
  const prompt = fs.readFileSync(promptPath, 'utf8')
  assert.equal(config.id, subject.agentId, subject.agentId + ' config id must match its folder')
  assert.ok(String(config.english_name || '').trim(), subject.agentId + ' needs english_name')
  assert.match(String(config.icon || ''), /^ri-[a-z0-9-]+$/, subject.agentId + ' icon must be a Remix icon')
  assert.ok(Array.isArray(config.skills) && config.skills.includes(subject.skillId), subject.agentId + ' must bind its subject Skill')
  for (const skillId of subject.expectedSkills) {
    assert.ok(config.skills.includes(skillId), subject.agentId + ' must bind ' + skillId)
  }
  assert.equal(config.permissions?.learningProfile, false, subject.agentId + ' must disable learning-profile writes')
  assert.equal(config.permissions?.webSearch, true, subject.agentId + ' must allow on-demand web search')
  assert.ok(config.tools?.includes('mcp:exa'), subject.agentId + ' must bind Exa as its default web source')
  assert.equal(config.permissions?.fileRead, true, subject.agentId + ' needs file read permission')
  assert.equal(config.permissions?.fileWrite, true, subject.agentId + ' needs file write permission for bound Skills')
  assert.equal(config.permissions?.execCommand, subject.requiresExec, subject.agentId + ' exec permission does not match its Skill needs')
  assert.match(prompt, /## 适用问题/)
  assert.match(prompt, /## Skill 路由/)
  assert.match(prompt, /## 记忆与资料/)
  assert.match(prompt, /## 工具与安全边界/)
  assert.match(prompt, /## 联网资料/)
  assert.match(prompt, /默认联网来源是 Exa/)
  assert.match(prompt, /初高中适配、题型与模拟/)
  assert.match(prompt, /用户指定范围/)
  assert.match(prompt, /设置 > 记忆管理/)
  assert.match(prompt, /无关/)
  assert.match(prompt, /不要默认/)
  assert.match(prompt, /## 模糊请求的轻量入口/)
  if (subject.requiresMedia) {
    assert.ok(config.tools?.includes('media_read'), subject.agentId + ' must bind media_read')
    assert.match(prompt, /media_read/)
    assert.match(prompt, /不得把它包装为真实发音/)
  }
  return config
}

for (const subject of subjects) {
  const config = assertAgent(subject)
  assertSkill(subject, config)
  assertBoundSkillPermissions(subject, config)
}

const englishConfig = readJson(path.join(agentsRoot, 'k12-english-learning-assistant', 'config.json'))
assert.ok(!englishConfig.skills.includes('cet-skill'), 'English Agent must not bind cet-skill')
assert.ok(!englishConfig.skills.includes('exam2knowledge'), 'English Agent must not bind STEM-only exam2knowledge')

for (const stemAgentId of [
  'k12-math-learning-assistant',
  'k12-physics-learning-assistant',
  'k12-chemistry-learning-assistant',
]) {
  const stemConfig = readJson(path.join(agentsRoot, stemAgentId, 'config.json'))
  assert.ok(stemConfig.skills.includes('exam2knowledge'), stemAgentId + ' must bind exam2knowledge for batch exam analysis')
}

for (const subject of subjects) {
  const config = readJson(path.join(agentsRoot, subject.agentId, 'config.json'))
  for (const forbiddenSkill of ['study-companion-en', 'quiz-generator', 'exam-simulator']) {
    assert.ok(!config.skills.includes(forbiddenSkill), subject.agentId + ' must not bind overlapping Skill ' + forbiddenSkill)
  }
}

const agentService = fs.readFileSync(path.join(root, 'electron', 'AgentService.js'), 'utf8')
assert.match(agentService, /_learningProfileAllowed\(request = \{\}\)/)
assert.match(agentService, /request\.permissions\?\.learningProfile !== false/)

console.log('K12 Agent and Skill contracts verified for math, English, physics, and chemistry.')
