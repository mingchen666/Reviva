export function register(registry, _services) {
  // overview
  registry.register({
    domain: 'learning', id: 'overview', name: '学习画像概况', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      if (!ctx.learningMemoryService?.getOverview) {
        return { data: { error: 'LearningMemoryService 未初始化' }, changedKeys: [] }
      }
      const data = ctx.learningMemoryService.getOverview()
      return { data, changedKeys: [] }
    },
  })
}
