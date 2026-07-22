import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseService } from '../../DatabaseService.js'

function createDb() {
  const service = new DatabaseService()
  service.init(':memory:')
  return service
}

test('quick inputs support local CRUD, validation, enable state, and ordering', () => {
  const db = createDb()
  try {
    const first = db.createQuickInput({ title: '论文润色', type: 'command', content: '请优化这段文字', description: '学术表达' })
    const second = db.createQuickInput({ title: '要点列表', type: 'format', content: '1. 核心观点\n2. 论据' })

    assert.equal(first.enabled, true)
    assert.equal(db.listQuickInputs().length, 2)
    assert.throws(() => db.createQuickInput({ title: '论文润色', type: 'context', content: '重复' }), /UNIQUE|unique/i)

    const updated = db.updateQuickInput(first.id, { enabled: false, description: '更新描述' })
    assert.equal(updated.enabled, false)
    assert.equal(updated.description, '更新描述')

    const ordered = db.reorderQuickInputs([second.id, first.id])
    assert.deepEqual(ordered.map(item => item.id), [second.id, first.id])

    db.deleteQuickInput(first.id)
    assert.equal(db.getQuickInput(first.id), null)
    assert.equal(db.db.prepare('SELECT version FROM schema_migrations WHERE version = 8').get()?.version, 8)
  } finally {
    db.close()
  }
})

test('quick input validation rejects empty and unsupported values', () => {
  const db = createDb()
  try {
    assert.throws(() => db.createQuickInput({ title: '', content: 'x' }), error => error.code === 'QUICK_INPUT_TITLE_REQUIRED')
    assert.throws(() => db.createQuickInput({ title: 'x', type: 'other', content: 'x' }), error => error.code === 'QUICK_INPUT_TYPE_INVALID')
    assert.throws(() => db.createQuickInput({ title: 'x', type: 'command', content: '   ' }), error => error.code === 'QUICK_INPUT_CONTENT_REQUIRED')
  } finally {
    db.close()
  }
})
