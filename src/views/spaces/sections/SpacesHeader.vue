<script setup>
defineProps({
  isDark: { type: Boolean, default: false },
  activeScope: { type: String, default: 'mine' },
  searchQuery: { type: String, default: '' },
  scopes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  canCreate: { type: Boolean, default: true },
})

const emit = defineEmits(['update:activeScope', 'update:searchQuery', 'refresh', 'create'])
</script>

<template>
  <header
    class="h-14 shrink-0 px-6 border-b flex items-center justify-between"
    :class="isDark ? 'bg-d2 border-d4' : 'bg-l2 border-bdrF'">
    <div class="flex items-center gap-8 h-full">
      <div class="flex items-baseline gap-2">
        <h1 class="text-[14px] font-semibold tracking-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
          知识库
        </h1>
        <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">资料管理工作台</span>
      </div>

      <nav class="flex items-center gap-6 h-full">
        <button
          v-for="scope in scopes"
          :key="scope.value"
          class="relative h-full px-1 flex items-center gap-1.5 text-[12.5px] font-medium border-b-2 transition-colors"
          :class="
            activeScope === scope.value
              ? scope.value === 'system'
                ? isDark
                  ? 'text-emerald-300 border-emerald-400'
                  : 'text-emerald-700 border-emerald-500'
                : isDark
                  ? 'text-brand-300 border-brand-400'
                  : 'text-blue-700 border-blue-600'
              : isDark
                ? 'text-wt-dim border-transparent hover:text-wt-sub'
                : 'text-lt-aux border-transparent hover:text-lt-sub'
          "
          @click="emit('update:activeScope', scope.value)">
          <i :class="[scope.icon, 'text-[13px]']" />
          <span>{{ scope.label }}</span>
          <span
            class="min-w-5 h-4 px-1 rounded-full text-[10px] leading-4 text-center tabular-nums"
            :class="
              activeScope === scope.value
                ? scope.value === 'system'
                  ? isDark
                    ? 'bg-emerald-400/12 text-emerald-200'
                    : 'bg-emerald-50 text-emerald-700'
                  : isDark
                    ? 'bg-brand-400/12 text-brand-200'
                    : 'bg-blue-50 text-blue-700'
                : isDark
                  ? 'bg-white/4 text-wt-dim'
                  : 'bg-l3 text-lt-aux'
            ">
            {{ scope.count }}
          </span>
        </button>
      </nav>
    </div>

    <div class="flex items-center gap-3">
      <div class="relative flex-1 max-w-[420px] ml-auto">
        <i
          class="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <input
          :value="searchQuery"
          type="text"
          placeholder="搜索知识库名称或描述"
          class="w-56 h-8 rounded-md pl-8 pr-8 text-[12px] outline-none transition-colors"
          :class="
            isDark
              ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/45'
              : 'bg-l1 border border-bdrF text-lt-sub placeholder-lt-aux focus:bg-white focus:border-brand-400'
          "
          @input="emit('update:searchQuery', $event.target.value)" />
        <button
          v-if="searchQuery"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          @click="emit('update:searchQuery', '')">
          <i class="ri-close-line text-[13px]" />
        </button>
      </div>

      <button
        class="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
        title="刷新"
        @click="emit('refresh')">
        <i class="ri-refresh-line text-[15px]" :class="loading ? 'animate-spin' : ''" />
      </button>

      <button
        v-if="canCreate"
        class="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all active:scale-[0.98]"
        :class="
          isDark
            ? 'bg-white text-d0 hover:bg-zinc-200'
            : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
        "
        @click="emit('create')">
        <i class="ri-add-line text-[14px]" />
        新建知识库
      </button>
    </div>
  </header>
</template>
