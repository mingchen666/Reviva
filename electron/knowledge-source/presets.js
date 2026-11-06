/**
 * Preset knowledge source templates.
 *
 * Inlined as a JS module so they get bundled by Vite — reading JSON files
 * from disk via import.meta.url breaks in the bundled electron main process.
 */

export const PRESETS = [
  {
    preset: 'dify',
    name: 'Dify',
    type: 'http',
    base_url: 'https://api.dify.ai/v1',
    auth: { type: 'bearer', token: '{{USER_TOKEN}}' },
    capabilities: { interfaces: ['search'], content_types: ['text'] },
   endpoints: {
      list: {
        method: 'GET',
        path: '/datasets',
        response: {
          items_path: 'data',
          field_mapping: { id: 'id', name: 'name' },
        },
      },
      search: {
        method: 'POST',
        path: '/datasets/{DATASET_ID}/retrieve',
        body: {
          query: '{query}',
          retrieval_model: {
            search_method: 'semantic_search',
            reranking_enable: false,
            top_k: '{top_k}',
            score_threshold_enabled: false,
          },
        },
        response: {
          items_path: 'records',
          field_mapping: { content: 'segment.content', title: 'segment.document_id', source: 'segment.id', score: 'score' },
          total_path: '',
        },
      },
    },
  },
  {
    preset: 'fastgpt',
    name: 'FastGPT',
    type: 'http',
    base_url: 'https://api.fastgpt.in/api',
    auth: { type: 'bearer', token: '{{USER_TOKEN}}' },
    capabilities: { interfaces: ['search'], content_types: ['text'] },
   endpoints: {
      list: {
        method: 'POST',
        path: '/core/dataset/list',
        body: { parentId: null, type: 'dataset' },
        response: {
          items_path: 'data',
          field_mapping: { id: '_id', name: 'name' },
        },
      },
      search: {
        method: 'POST',
        path: '/core/dataset/searchTest',
        body: {
          datasetId: '{DATASET_ID}',
          text: '{query}',
          similarity: 0.4,
          searchMode: 'embedding',
          usingReRank: false,
        },
        response: {
          items_path: 'data',
          field_mapping: { content: 'q', title: 'sourceName', source: 'id', score: 'score' },
          total_path: '',
        },
      },
    },
  },
  {
    preset: 'ima',
    name: 'IMA',
    type: 'http',
    base_url: 'https://ima.qq.com',
    auth: { type: 'none' },
    default_headers: {
      'ima-openapi-clientid': '{{CLIENT_ID}}',
      'ima-openapi-apikey': '{{API_KEY}}',
    },
    capabilities: { interfaces: ['search'], content_types: ['text'] },
    endpoints: {
      list: {
        method: 'POST',
        path: '/openapi/wiki/v1/search_knowledge_base',
        body: { query: '', cursor: '', limit: 20 },
        response: {
          items_path: 'data.info_list',
          field_mapping: { id: 'kb_id', name: 'kb_name' },
        },
      },
      search: {
        method: 'POST',
        path: '/openapi/wiki/v1/search_knowledge',
        body: {
          query: '{query}',
          cursor: '',
          knowledge_base_id: '{KB_ID}',
        },
        response: {
          items_path: 'data.info_list',
          field_mapping: { content: 'highlight_content', title: 'title', source: 'media_id' },
          total_path: '',
        },
      },
    },
  },
]
