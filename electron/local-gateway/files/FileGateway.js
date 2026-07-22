import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import dns from 'node:dns/promises'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

const root = path.join(os.tmpdir(), 'mindspace-gateway-uploads')
const trashRoot = path.join(root, '.trash')
const idFor = value => `file_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)}`

export function resolveStagedFile(fileId) {
  const item = scan().find(entry => entry.fileId === fileId)
  return item ? { ...item, absolutePath: path.join(root, ...item.relativePath.split('/')) } : null
}

function scan(directory = root, prefix = '') {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (!prefix && entry.name === '.trash') return []
    const relativePath = [prefix, entry.name].filter(Boolean).join('/')
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return scan(absolutePath, relativePath)
    const stat = fs.statSync(absolutePath)
    return [{ fileId: idFor(relativePath), filename: entry.name, relativePath, size: stat.size, createdAt: stat.birthtime.toISOString(), updatedAt: stat.mtime.toISOString() }]
  })
}

function safeDirectory(relativePath) {
  const normalized = String(relativePath || '').trim().replace(/\\/g, '/')
  const segments = normalized ? normalized.split('/').filter(Boolean) : []
  if (path.isAbsolute(normalized) || segments.some(item => item === '.' || item === '..' || item.includes(':'))) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'invalid relativePath', { status: 400 })
  const directory = path.resolve(root, ...segments)
  if (directory !== path.resolve(root) && !directory.startsWith(`${path.resolve(root)}${path.sep}`)) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'relativePath escapes upload root', { status: 400 })
  return { directory, segments }
}

function saveFile(filename, relativeDirectory, content) {
  if (!filename || /[\\/]/.test(filename) || filename.includes('..')) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'invalid filename', { status: 400 })
  if (!content.length || content.length > 20 * 1024 * 1024) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'file size must be 1-20MB', { status: 400 })
  const { directory, segments } = safeDirectory(relativeDirectory)
  fs.mkdirSync(directory, { recursive: true })
  const ext = path.extname(filename); const base = path.basename(filename, ext)
  let storedName = filename; let sequence = 2
  while (fs.existsSync(path.join(directory, storedName))) storedName = `${base} (${sequence++})${ext}`
  fs.writeFileSync(path.join(directory, storedName), content, { flag: 'wx' })
  const relativePath = [...segments, storedName].join('/')
  return { fileId: idFor(relativePath), filename: storedName, relativePath, size: content.length }
}

function decodeBase64(value) {
  const encoded = String(value || '').trim().replace(/\s+/g, '')
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'contentBase64 is invalid', { status: 400 })
  const content = Buffer.from(encoded, 'base64')
  if (!content.length) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'contentBase64 is empty', { status: 400 })
  return content
}

function privateAddress(address) {
  if (net.isIP(address) === 4) return /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)
  return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')
}

async function validateRemoteUrl(value) {
  let url
  try { url = new URL(String(value || '')) } catch { throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'invalid url', { status: 400 }) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'only public http/https URLs are allowed', { status: 400 })
  const addresses = await dns.lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'private or loopback URLs are not allowed', { status: 400 })
  return url
}

export async function stageFileFromUrl(input = {}) {
  let url = await validateRemoteUrl(input.url)
  let remote
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    remote = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    if (![301, 302, 303, 307, 308].includes(remote.status)) break
    const location = remote.headers.get('location')
    if (!location || redirects === 3) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'too many or invalid redirects', { status: 400 })
    url = await validateRemoteUrl(new URL(location, url).toString())
  }
  if (!remote.ok) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, `remote server returned ${remote.status}`, { status: 400 })
  const declaredSize = Number(remote.headers.get('content-length') || 0)
  if (declaredSize > 20 * 1024 * 1024) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'remote file exceeds 20MB', { status: 400 })
  const chunks = []
  let received = 0
  for await (const chunk of remote.body) {
    received += chunk.length
    if (received > 20 * 1024 * 1024) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'remote file exceeds 20MB', { status: 400 })
    chunks.push(chunk)
  }
  const content = Buffer.concat(chunks)
  const filename = String(input.filename || decodeURIComponent(path.basename(url.pathname)) || 'download.bin').trim()
  return { ...saveFile(filename, input.relativePath, content), sourceUrl: url.toString() }
}

export function registerFileGateway({ server, registry, sendJson }) {
  registry.registerResource({ id: 'staged-files', description: 'List Gateway staged files' })
  registry.registerAction({ id: 'files.upload', description: 'Upload a staged file', riskLevel: 'medium' })
  registry.registerAction({ id: 'files.trash', description: 'Move a staged file to trash', riskLevel: 'medium' })
  server.register('POST', '/api/v1/files', ({ response, body }) => {
    const filename = String(body?.filename || '').trim()
    const content = decodeBase64(body?.contentBase64)
    sendJson(response, 201, { data: saveFile(filename, body?.relativePath, content) })
  })
  registry.registerAction({ id: 'files.upload-url', description: 'Download a public URL into staged files', riskLevel: 'medium' })
  server.register('POST', '/api/v1/files/from-url', async ({ response, body }) => {
    sendJson(response, 201, { data: await stageFileFromUrl(body) })
  })
  server.register('GET', '/api/v1/files', ({ response }) => sendJson(response, 200, { data: scan() }))
  server.register('GET', '/api/v1/files/:id', ({ response, params }) => {
    const data = resolveStagedFile(params.id)
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'staged file not found', { status: 404 })
    const { absolutePath, ...publicData } = data
    sendJson(response, 200, { data: publicData })
  })
  server.register('DELETE', '/api/v1/files/:id', ({ response, params }) => {
    const data = resolveStagedFile(params.id)
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'staged file not found', { status: 404 })
    fs.mkdirSync(trashRoot, { recursive: true })
    fs.renameSync(data.absolutePath, path.join(trashRoot, `${Date.now()}-${data.filename}`))
    sendJson(response, 200, { data: { fileId: data.fileId, trashed: true } })
  })
}
