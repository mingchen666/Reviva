import assert from 'node:assert/strict'
import test from 'node:test'
import { selectOcrProvider } from './PdfOcrService.js'

const provider = (id, type, enabled = 1) => ({
  id,
  type,
  enabled,
  base_url: `https://${id}.example/jobs`,
  api_key_ref: `${id}-key`,
})

test('selectOcrProvider honors an explicit enabled provider', () => {
  const providers = [provider('mineru-main', 'mineru'), provider('paddle-current', 'paddleocr')]
  assert.equal(selectOcrProvider(providers, 'paddle-current')?.id, 'paddle-current')
})

test('selectOcrProvider auto mode follows stored enabled order without MinerU priority', () => {
  const providers = [provider('paddle-current', 'paddleocr'), provider('mineru-old', 'mineru')]
  assert.equal(selectOcrProvider(providers, 'auto')?.id, 'paddle-current')
})

test('selectOcrProvider ignores disabled or incomplete providers', () => {
  const providers = [
    provider('disabled-paddle', 'paddleocr', 0),
    { ...provider('incomplete-mineru', 'mineru'), api_key_ref: '' },
    provider('usable-paddle', 'paddleocr'),
  ]
  assert.equal(selectOcrProvider(providers, 'auto')?.id, 'usable-paddle')
})

test('selectOcrProvider accepts a local PaddleX endpoint without a key', () => {
  const providers = [{
    id: 'local-paddlex',
    type: 'paddleocr',
    enabled: 1,
    base_url: 'http://127.0.0.1:8080/layout-parsing',
    api_key_ref: '',
  }]
  assert.equal(selectOcrProvider(providers, 'auto')?.id, 'local-paddlex')
})

test('selectOcrProvider returns no provider for a missing explicit id', () => {
  const providers = [provider('paddle-current', 'paddleocr')]
  assert.equal(selectOcrProvider(providers, 'deleted-provider'), null)
})
