// Creation-center Agent englishName blacklist.
// These 12 agents are invoked through the Generation Center UI, not through
// OpenAI-compatible chat routes. They must be excluded from /v1/models and
// rejected on /v1/chat/completions and /v1/responses.
export const CREATION_CENTER_AGENT_NAMES = new Set([
  'quiz-generator',
  'ppt-generator',
  'mindmap-generator',
  'graph-generator',
  'flashcard-generator',
  'chart-generator',
  'deep-researcher',
  'lab-report-assistant',
  'studycard-generator',
  'study-guide-generator',
])

// Web-search / web-retrieval tool ids that an Agent may have configured.
// Used by /v1/responses to validate the built-in web_search tool request.
export const WEB_SEARCH_TOOLS = new Set([
  'web_search',
  'web_search_tavily',
  'web_search_searxng',
  'web_search_bing',
  'browser_search',
  'mcp:exa',
  'mcp:jina-mcp-server',
])
