import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SETTINGS_TRANSFER_FORMAT,
  SETTINGS_TRANSFER_VERSION,
  createSettingsTransfer,
  parseSettingsTransfer,
  serializeTransferredSetting,
} from './SettingsTransferService.js'

test('creates a versioned settings transfer and excludes workspace root', () => {
  const result = createSettingsTransfer({
    themeMode: 'dark',
    providers: [{ id: 'openai', apiKey: 'kept-by-product-decision' }],
    defaultSttModelRef: 'local_asr::whisper-1',
    workdir_root: 'D:\\old-workspace',
  }, { appVersion: '1.2.3' })

  assert.equal(result.format, SETTINGS_TRANSFER_FORMAT)
  assert.equal(result.formatVersion, SETTINGS_TRANSFER_VERSION)
  assert.equal(result.appVersion, '1.2.3')
  assert.equal(result.data.settings.themeMode, 'dark')
  assert.equal(result.data.settings.providers[0].apiKey, 'kept-by-product-decision')
  assert.equal(Object.hasOwn(result.data.settings, 'defaultSttModelRef'), false)
  assert.equal(Object.hasOwn(result.data.settings, 'workdir_root'), false)
})

test('parses the current transfer format', () => {
  const parsed = parseSettingsTransfer({
    format: SETTINGS_TRANSFER_FORMAT,
    formatVersion: SETTINGS_TRANSFER_VERSION,
    data: { settings: { themeMode: 'light', workdir_root: 'D:\\ignored' } },
  })

  assert.deepEqual(parsed, { settings: { themeMode: 'light' }, legacy: false })
})

test('parses legacy exports but only returns settings', () => {
  const parsed = parseSettingsTransfer({
    settings: { fontSize: 'large' },
    agents: [{ id: 'ignored' }],
    skills: [{ id: 'ignored' }],
    tools: [{ id: 'ignored' }],
  })

  assert.deepEqual(parsed, { settings: { fontSize: 'large' }, legacy: true })
})

test('rejects unsupported and malformed transfers', () => {
  assert.throws(() => parseSettingsTransfer([]), /格式无效/)
  assert.throws(() => parseSettingsTransfer({ format: 'other', formatVersion: 1, data: { settings: {} } }), /不是 Reviva/)
  assert.throws(() => parseSettingsTransfer({ format: SETTINGS_TRANSFER_FORMAT, formatVersion: 99, data: { settings: {} } }), /不支持/)
  assert.throws(() => parseSettingsTransfer({ format: SETTINGS_TRANSFER_FORMAT, formatVersion: 1, data: {} }), /缺少 settings/)
})

test('rejects malformed critical settings before they reach the database', () => {
  assert.throws(() => parseSettingsTransfer({
    settings: { providers: {} },
  }), /providers 必须是数组/)
  assert.throws(() => parseSettingsTransfer({
    settings: { providers: [{ id: 'openai', models: [{ name: 'missing id' }] }] },
  }), /包含无效模型/)
  assert.throws(() => parseSettingsTransfer({
    settings: { shortcutBindings: { global_invoke: 'Ctrl+Space' } },
  }), /快捷键 global_invoke 格式无效/)
  assert.throws(() => parseSettingsTransfer({
    settings: { autoStart: 'yes' },
  }), /autoStart 必须是布尔值/)
})

test('preserves null and existing setting serialization semantics', () => {
  assert.equal(serializeTransferredSetting(null), 'null')
  assert.equal(serializeTransferredSetting('dark'), 'dark')
  assert.equal(serializeTransferredSetting(false), 'false')
  assert.equal(serializeTransferredSetting({ enabled: true }), '{"enabled":true}')
})
