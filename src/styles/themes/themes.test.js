import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const themeDir = path.dirname(fileURLToPath(import.meta.url))
const themes = [
  ['clarity', '_clarity.scss'],
  ['serene', '_serene.scss'],
  ['contrast', '_contrast.scss'],
  ['neon-protocol', '_neon-protocol.scss'],
  ['vermilion-archive', '_vermilion-archive.scss'],
  ['amber-terminal', '_amber-terminal.scss'],
]

function hexLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(value => {
    const channel = Number.parseInt(value, 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(first, second) {
  const lighter = Math.max(hexLuminance(first), hexLuminance(second))
  const darker = Math.min(hexLuminance(first), hexLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

function modeVariables(source, id, mode) {
  const block = source.match(new RegExp(`\\.theme-${id}\\.theme-${mode}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] || ''
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(match => [match[1], match[2]]))
}

test('every non-default built-in theme defines light and dark variants', () => {
  for (const [id, filename] of themes) {
    const source = fs.readFileSync(path.join(themeDir, filename), 'utf-8')
    assert.match(source, new RegExp(`\\.theme-${id}\\.theme-light\\s*\\{`), `${id} light variables`)
    assert.match(source, new RegExp(`\\.theme-${id}\\.theme-dark\\s*\\{`), `${id} dark variables`)
  }
})

test('built-in themes keep a visible minimum radius', () => {
  for (const [id, filename] of themes) {
    const source = fs.readFileSync(path.join(themeDir, filename), 'utf-8')
    assert.doesNotMatch(source, /--ui-radius-(?:small|control|medium|card|dialog):\s*0(?:px)?\s*;/, `${id} must not remove rounded corners`)
  }
})

test('theme text layers keep readable contrast against the page', () => {
  for (const [id, filename] of themes) {
    const source = fs.readFileSync(path.join(themeDir, filename), 'utf-8')
    for (const mode of ['light', 'dark']) {
      const variables = modeVariables(source, id, mode)
      assert.ok(contrastRatio(variables['ui-text-main'], variables['ui-bg-0']) >= 7, `${id} ${mode} main text contrast`)
      assert.ok(contrastRatio(variables['ui-text-sub'], variables['ui-bg-0']) >= 4.5, `${id} ${mode} secondary text contrast`)
    }
  }
})

test('the complete theme stylesheet parses and includes all built-in themes', () => {
  const result = sass.compile(path.join(themeDir, 'index.scss'), { style: 'compressed' })
  for (const [id] of themes) {
    assert.match(result.css, new RegExp(`\\.theme-${id}(?:\\.|\\{|\\[)`), `${id} compiled CSS`)
  }
})
