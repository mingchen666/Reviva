import { missingParam, invalidParam } from '../errorResponse.js'

const VALID_TYPES = ['command', 'context', 'format']

export function register(registry, _services) {
  // list
  registry.register({
    domain: 'quick_inputs', id: 'list', name: '快捷输入列表', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const data = ctx.dbService.listQuickInputs()
      return { data, changedKeys: [] }
    },
  })

  // create
  registry.register({
    domain: 'quick_inputs', id: 'create', name: '创建快捷输入', write: true,
    params: 'title, type, content, description?, enabled?',
    example: { title: '总结全文', type: 'command', content: '请总结以上对话内容' },
    execute: async (params, ctx) => {
      if (!params?.title) throw missingParam('title', '非空字符串')
      if (!params?.type) throw missingParam('type', VALID_TYPES.join('|'))
      if (!VALID_TYPES.includes(params.type)) {
        throw invalidParam('type', VALID_TYPES, `type 无效`)
      }
      if (!params?.content) throw missingParam('content', '非空字符串')
      const data = ctx.dbService.createQuickInput({
        title: params.title,
        type: params.type,
        content: params.content,
        description: params.description || '',
        enabled: params.enabled !== false,
      })
      return { data, changedKeys: [] }
    },
  })
}
