import fs from 'node:fs'
import path from 'node:path'
import { resolveDocsDirectory } from './DocsPath.js'

const HIDDEN_DIRECTORY_PREFIX = '.'

function visibleDirectories(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith(HIDDEN_DIRECTORY_PREFIX))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function buildTree(directory, relativePath) {
  const children = visibleDirectories(directory).map(entry => {
    const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name
    return buildTree(path.join(directory, entry.name), childRelativePath)
  })
  return {
    name: relativePath ? path.basename(directory) : 'Docs',
    relativePath,
    children,
  }
}

export function listDocsFolderTree({ workDirService, relativePath = '' } = {}) {
  const target = resolveDocsDirectory(workDirService, relativePath)
  return buildTree(target.directory, target.relativePath)
}

export function registerDocsFolderGateway({ server, registry, workDirService, sendJson }) {
  registry.registerResource({ id: 'docs-folders', description: 'Read the Docs workspace directory tree' })
  server.register('GET', '/api/v1/docs/folders/tree', ({ response, url }) => {
    sendJson(response, 200, { data: listDocsFolderTree({ workDirService, relativePath: url.searchParams.get('path') || '' }) })
  })
}
