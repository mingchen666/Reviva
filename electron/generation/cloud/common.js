export function artifactType(artifact) {
  return String(artifact?.artifact_type || '').toUpperCase()
}

export function attachedDocuments(localFiles) {
  return (localFiles || []).map((file, index) => ({
    client_file_id: file.id || `file-${index + 1}`,
    filename: file.name,
    description: file.description || null,
  }))
}

export function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function titleFromTopic(topic) {
  const text = String(topic || '').trim().replace(/\s+/g, ' ')
  return text ? text.slice(0, 80) : null
}
