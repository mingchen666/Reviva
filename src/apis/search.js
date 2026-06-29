import { http } from './http'

export const searchApi = {
  // payload: { query, kb_ids?, doc_ids?, top_k?, search_mode?, search_modes?, rerank?, save_to_history? }
  query(payload) {
    return http.post('/search/query', payload)
  },
}
