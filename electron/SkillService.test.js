import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'
import { SkillService } from './SkillService.js'

async function fixture() {
  const base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mindspace-skill-test-'))
  const workspace = path.join(base, 'workspace')
  const builtins = path.join(base, 'builtins')
  await fs.promises.mkdir(workspace, { recursive: true })
  await fs.promises.mkdir(builtins, { recursive: true })
  const service = new SkillService({ getRootPath: () => workspace }, { builtinSkillsDir: builtins })
  return { base, workspace, builtins, service, cleanup: () => fs.promises.rm(base, { recursive: true, force: true }) }
}

test('installs a custom skill with complete config defaults', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)

  const result = await ctx.service.installSkill('writing-helper', {
    name: '写作助手',
    description: '改进文章结构',
    promptContent: '# 工作流程\n\n先分析结构。',
  })

  assert.equal(result.success, true)
  assert.equal(result.spec.valid, true)
  const dir = path.join(ctx.workspace, 'skills', 'writing-helper')
  const markdown = await fs.promises.readFile(path.join(dir, 'SKILL.md'), 'utf-8')
  const config = JSON.parse(await fs.promises.readFile(path.join(dir, 'config.json'), 'utf-8'))
  assert.match(markdown, /^---\nname: writing-helper\ndescription: "改进文章结构"/)
  assert.deepEqual(config.allowedTools, [])
  assert.deepEqual(config.outputTypes, [])
  assert.equal(config.version, '')
  assert.equal(config.trustStatus, '')
  assert.equal(config.source, 'custom')
})

test('editing SKILL.md preserves imported supporting files', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  await ctx.service.installSkill('toolkit', { name: '工具箱', description: '执行固定流程', promptContent: '# 原始流程' })
  const script = path.join(ctx.workspace, 'skills', 'toolkit', 'scripts', 'run.js')
  await fs.promises.mkdir(path.dirname(script), { recursive: true })
  await fs.promises.writeFile(script, 'console.log("keep")', 'utf-8')

  const result = await ctx.service.updateSkill('toolkit', { name: '工具箱', description: '更新后的流程', promptContent: '# 新流程' })

  assert.equal(result.spec.valid, true)
  assert.equal(await fs.promises.readFile(script, 'utf-8'), 'console.log("keep")')
  assert.match(await fs.promises.readFile(path.join(ctx.workspace, 'skills', 'toolkit', 'SKILL.md'), 'utf-8'), /# 新流程/)
})

test('imports a folder and normalizes id, frontmatter, and config', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  const source = path.join(ctx.base, 'source-skill')
  await fs.promises.mkdir(path.join(source, 'references'), { recursive: true })
  await fs.promises.writeFile(path.join(source, 'SKILL.md'), '---\nname: old-name\ndescription: Existing description\n---\n\n# Instructions', 'utf-8')
  await fs.promises.writeFile(path.join(source, 'references', 'guide.md'), '# Guide', 'utf-8')

  const preview = await ctx.service.inspectSkillSource(source)
  assert.equal(preview.id, 'old-name')
  const imported = await ctx.service.importSkillSource(source, { id: 'new-name', name: '新名称', description: '新描述' })

  assert.equal(imported.spec.valid, true)
  const dir = path.join(ctx.workspace, 'skills', 'new-name')
  assert.equal(await fs.promises.readFile(path.join(dir, 'references', 'guide.md'), 'utf-8'), '# Guide')
  assert.match(await fs.promises.readFile(path.join(dir, 'SKILL.md'), 'utf-8'), /^---\nname: new-name\ndescription: "新描述"/)
  assert.equal(JSON.parse(await fs.promises.readFile(path.join(dir, 'config.json'), 'utf-8')).name, '新名称')
})

test('uses the original folder name when SKILL.md has no frontmatter', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  const source = path.join(ctx.base, 'folder-fallback')
  await fs.promises.mkdir(source, { recursive: true })
  await fs.promises.writeFile(path.join(source, 'SKILL.md'), '# Plain instructions', 'utf-8')

  const preview = await ctx.service.inspectSkillSource(source)

  assert.equal(preview.id, 'folder-fallback')
  assert.deepEqual(preview.issues, ['SKILL.md 缺少 YAML frontmatter'])
})

test('rejects writes and installs using builtin ids', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  await fs.promises.mkdir(path.join(ctx.builtins, 'reserved-skill'), { recursive: true })

  await assert.rejects(
    ctx.service.installSkill('reserved-skill', { name: '覆盖', promptContent: '# no' }),
    /不能覆盖内置 Skill/,
  )
  await assert.rejects(ctx.service.uninstallSkill('reserved-skill'), /不能删除内置 Skill/)
})

test('imports ZIP packages and rejects traversal paths', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  const validZip = new JSZip()
  validZip.file('portable/SKILL.md', '---\nname: portable\ndescription: Portable skill\n---\n\n# Run')
  validZip.file('portable/assets/info.txt', 'asset')
  const validPath = path.join(ctx.base, 'valid.zip')
  await fs.promises.writeFile(validPath, await validZip.generateAsync({ type: 'nodebuffer' }))

  const preview = await ctx.service.inspectSkillSource(validPath)
  assert.equal(preview.id, 'portable')
  assert.equal(preview.files.some(file => file.path === 'assets/info.txt'), true)

  const invalidZip = new JSZip()
  invalidZip.file('../SKILL.md', '# outside')
  const invalidPath = path.join(ctx.base, 'invalid.zip')
  await fs.promises.writeFile(invalidPath, await invalidZip.generateAsync({ type: 'nodebuffer' }))
  await assert.rejects(ctx.service.inspectSkillSource(invalidPath), /非法路径|绝对路径/)
})

test('rolls back invalid direct SKILL.md edits', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  await ctx.service.installSkill('stable-skill', { name: '稳定', description: '有效描述', promptContent: '# Valid' })
  const before = await fs.promises.readFile(path.join(ctx.workspace, 'skills', 'stable-skill', 'SKILL.md'), 'utf-8')

  const result = await ctx.service.writeSkillFile('stable-skill', 'SKILL.md', '# invalid')

  assert.equal(result.success, false)
  assert.equal(await fs.promises.readFile(path.join(ctx.workspace, 'skills', 'stable-skill', 'SKILL.md'), 'utf-8'), before)
})

test('blocks config.json edits regardless of filename casing', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  await ctx.service.installSkill('protected-config', {
    name: '配置保护', description: '保护生成配置', promptContent: '# Valid',
  })
  const before = await fs.promises.readFile(path.join(ctx.workspace, 'skills', 'protected-config', 'config.json'), 'utf-8')

  const result = await ctx.service.writeSkillFile('protected-config', 'CONFIG.JSON', '{}')

  assert.equal(result.success, false)
  assert.match(result.error, /不允许直接编辑 config\.json/)
  assert.equal(await fs.promises.readFile(path.join(ctx.workspace, 'skills', 'protected-config', 'config.json'), 'utf-8'), before)
})

test('rejects an overlong description without installing files', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)

  await assert.rejects(
    ctx.service.installSkill('invalid-description', {
      name: '无效描述',
      description: 'x'.repeat(1025),
      promptContent: '# Instructions',
    }),
    /description 超过 1024 字符/,
  )

  assert.equal(ctx.service.isInstalled('invalid-description'), false)
})

test('leaves an existing skill unchanged when an update is invalid', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  await ctx.service.installSkill('stable-update', {
    name: '稳定更新',
    description: '有效描述',
    promptContent: '# Original',
  })
  const skillPath = path.join(ctx.workspace, 'skills', 'stable-update', 'SKILL.md')
  const configPath = path.join(ctx.workspace, 'skills', 'stable-update', 'config.json')
  const beforeSkill = await fs.promises.readFile(skillPath, 'utf-8')
  const beforeConfig = await fs.promises.readFile(configPath, 'utf-8')

  const invalidMarkdown = `---\nname: stable-update\ndescription: "${'x'.repeat(1025)}"\n---\n\n# Invalid`
  await assert.rejects(
    ctx.service.updateSkill('stable-update', { name: '稳定更新', promptContent: invalidMarkdown }),
    /description 超过 1024 字符/,
  )

  assert.equal(await fs.promises.readFile(skillPath, 'utf-8'), beforeSkill)
  assert.equal(await fs.promises.readFile(configPath, 'utf-8'), beforeConfig)
})

test('restores snapshots for existing and newly created skills', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  await ctx.service.installSkill('snapshot-existing', {
    name: '快照', description: '原始版本', promptContent: '# Original',
  })
  const existingPath = path.join(ctx.workspace, 'skills', 'snapshot-existing', 'SKILL.md')
  const original = await fs.promises.readFile(existingPath, 'utf-8')
  const existingSnapshot = await ctx.service.createSkillSnapshot('snapshot-existing')
  await ctx.service.updateSkill('snapshot-existing', {
    name: '快照', description: '修改版本', promptContent: '# Changed',
  })
  await ctx.service.restoreSkillSnapshot('snapshot-existing', existingSnapshot)
  await ctx.service.discardSkillSnapshot(existingSnapshot)
  assert.equal(await fs.promises.readFile(existingPath, 'utf-8'), original)

  const newSnapshot = await ctx.service.createSkillSnapshot('snapshot-new')
  await ctx.service.installSkill('snapshot-new', {
    name: '新建快照', description: '临时内容', promptContent: '# Temporary',
  })
  await ctx.service.restoreSkillSnapshot('snapshot-new', newSnapshot)
  await ctx.service.discardSkillSnapshot(newSnapshot)
  assert.equal(ctx.service.isInstalled('snapshot-new'), false)
})

test('renames a custom skill and preserves supporting files', async (t) => {
  const ctx = await fixture()
  t.after(ctx.cleanup)
  await ctx.service.installSkill('old-skill', {
    name: '旧 Skill', description: '需要迁移', promptContent: '# Workflow',
  })
  const supportPath = path.join(ctx.workspace, 'skills', 'old-skill', 'references', 'guide.md')
  await fs.promises.mkdir(path.dirname(supportPath), { recursive: true })
  await fs.promises.writeFile(supportPath, '# Keep me', 'utf-8')

  await ctx.service.renameCustomSkill('old-skill', 'old-skill-custom')

  const renamedDir = path.join(ctx.workspace, 'skills', 'old-skill-custom')
  assert.equal(ctx.service.isInstalled('old-skill'), false)
  assert.equal(ctx.service.isInstalled('old-skill-custom'), true)
  assert.equal(JSON.parse(await fs.promises.readFile(path.join(renamedDir, 'config.json'), 'utf-8')).id, 'old-skill-custom')
  assert.match(await fs.promises.readFile(path.join(renamedDir, 'SKILL.md'), 'utf-8'), /^---\nname: old-skill-custom\n/)
  assert.equal(await fs.promises.readFile(path.join(renamedDir, 'references', 'guide.md'), 'utf-8'), '# Keep me')
})
