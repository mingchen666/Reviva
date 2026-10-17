// wiki/wikiUtils.js — extracted from WikiService.js
// Pure utility functions with no instance-state dependency.

import fs from 'node:fs'
import path from 'node:path'

const MODEL_REF_SEPARATOR = '::'

function nowIso() {
  return new Date().toISOString()
}

function mediaTimestamp(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return ''
  const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function safeSegment(value, fallback = '') {
  const raw = String(value || '').trim().toLowerCase()
  const ascii = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return ascii || fallback
}

function safeTitle(value) {
  return String(value || '').trim().slice(0, 120)
}

function parseModelRef(ref) {
  const value = String(ref || '')
  const idx = value.indexOf(MODEL_REF_SEPARATOR)
  if (idx <= 0) return { providerId: '', modelId: value, scoped: false }
  return {
    providerId: value.slice(0, idx),
    modelId: value.slice(idx + MODEL_REF_SEPARATOR.length),
    scoped: true,
  }
}

function hasModelRunConfig(req = {}) {
  return !!(req.providerId && req.apiKey && req.model)
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function readJsonSync(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJson(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function isPathInside(parent, child) {
  const parentPath = path.resolve(parent).toLowerCase()
  const childPath = path.resolve(child).toLowerCase()
  return childPath === parentPath || childPath.startsWith(parentPath + path.sep)
}

export { nowIso, mediaTimestamp, safeSegment, safeTitle, parseModelRef, hasModelRunConfig, readJson, readJsonSync, writeJson, isPathInside, MODEL_REF_SEPARATOR }
