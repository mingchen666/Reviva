import { jsonrepair } from 'jsonrepair'

function uniqueCandidates(values) {
  const seen = new Set()
  return values
    .map(value => String(value || '').trim())
    .filter(value => {
      if (!value || seen.has(value)) return false
      seen.add(value)
      return true
    })
}

function fencedJson(text) {
  const match = String(text || '').trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match?.[1] || ''
}

function objectSlice(text) {
  const value = String(text || '')
  const first = value.indexOf('{')
  const last = value.lastIndexOf('}')
  return first >= 0 && last > first ? value.slice(first, last + 1) : ''
}

export function parseStructuredJson(text) {
  const candidates = uniqueCandidates([text, fencedJson(text), objectSlice(text)])
  let lastError = null

  for (const candidate of candidates) {
    try {
      return { ok: true, data: JSON.parse(candidate), repaired: false }
    } catch (error) {
      lastError = error
    }

    try {
      const repaired = jsonrepair(candidate)
      return { ok: true, data: JSON.parse(repaired), repaired: true }
    } catch (error) {
      lastError = error
    }
  }

  return {
    ok: false,
    error: lastError?.message || '模型未返回可解析的 JSON 对象',
  }
}

export function schemaErrorMessage(error) {
  const issue = error?.issues?.[0]
  if (!issue) return error?.message || 'JSON 结构不符合要求'
  const path = issue.path?.length ? issue.path.join('.') : '根对象'
  return `${path}：${issue.message}`
}
