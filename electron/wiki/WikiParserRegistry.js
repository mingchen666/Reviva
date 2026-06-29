const PARSER_CAPABILITIES = [
  {
    type: 'markdown',
    label: 'Markdown',
    extensions: ['md', 'markdown'],
    status: 'ready',
    output: 'sources/extracts/*.md',
  },
  {
    type: 'text',
    label: 'Plain Text',
    extensions: ['txt', 'text'],
    status: 'ready',
    output: 'sources/extracts/*.md',
  },
  {
    type: 'pdf',
    label: 'PDF',
    extensions: ['pdf'],
    status: 'ready',
    output: 'sources/extracts/*.md',
  },
  {
    type: 'word',
    label: 'Word',
    extensions: ['docx'],
    status: 'ready',
    output: 'sources/extracts/*.md',
  },
  {
    type: 'spreadsheet',
    label: 'Spreadsheet',
    extensions: ['xlsx'],
    status: 'ready',
    output: 'sources/extracts/*.md',
  },
  {
    type: 'presentation',
    label: 'Presentation',
    extensions: ['pptx'],
    status: 'ready',
    output: 'sources/extracts/*.md',
  },
  {
    type: 'legacy_word',
    label: 'Legacy Word',
    extensions: ['doc'],
    status: 'planned',
    output: 'requires conversion before parsing',
  },
  {
    type: 'html',
    label: 'HTML',
    extensions: ['html', 'htm'],
    status: 'planned',
    output: 'sources/extracts/*.md',
  },
]

const EXTENSION_TO_TYPE = new Map(
  PARSER_CAPABILITIES.flatMap(item => item.extensions.map(ext => [ext, item.type])),
)

export function detectParserType(ext) {
  return EXTENSION_TO_TYPE.get(String(ext || '').toLowerCase()) || String(ext || 'file').toLowerCase()
}

export function listParserCapabilities() {
  return PARSER_CAPABILITIES.map(item => ({ ...item, extensions: [...item.extensions] }))
}

export function getParserCapability(type) {
  return PARSER_CAPABILITIES.find(item => item.type === type) || null
}
