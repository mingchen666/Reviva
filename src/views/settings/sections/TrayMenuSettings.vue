<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

const appStore = useAppStore()
const ss = useSettingsStore()
const isDark = computed(() => appStore.isDark)
const draft = ref({ type: 'route', label: '', target: '/workchat' })

function save(items) { ss.saveTrayMenu(items) }
function move(index, delta) {
  const next = index + delta
  if (next < 0 || next >= ss.trayMenuItems.length) return
  const items = [...ss.trayMenuItems]
  ;[items[index], items[next]] = [items[next], items[index]]
  save(items)
}
function toggle(index) {
  const current = ss.trayMenuItems[index]
  if (current.action === 'quit') return
  save(ss.trayMenuItems.map((item, i) => i === index ? { ...item, enabled: item.enabled === false } : item))
}
function remove(index) {
  if (ss.trayMenuItems[index]?.action !== 'quit') save(ss.trayMenuItems.filter((_, i) => i !== index))
}
function addItem() {
  const id = `custom-${Date.now()}`
  const type = draft.value.type
  const item = type === 'separator'
    ? { id, type, enabled: true }
    : type === 'url'
      ? { id, type, label: draft.value.label.trim() || '打开链接', url: draft.value.target.trim(), enabled: true }
      : { id, type, label: draft.value.label.trim() || '打开页面', path: draft.value.target.trim() || '/', enabled: true }
  save([...ss.trayMenuItems, item])
  draft.value.label = ''
}
</script>

<template>
  <section class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
    <div class="flex items-center gap-2 px-4 pt-4 pb-2.5">
      <span class="w-[3px] h-3.5 rounded-full bg-emerald-400" />
      <i class="ri-menu-2-line text-[14px] text-emerald-400" />
      <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">托盘菜单</span>
      <span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">修改后立即生效</span>
    </div>
    <div class="px-4 pb-4 space-y-2">
      <div v-for="(item, index) in ss.trayMenuItems" :key="item.id" class="flex items-center gap-2 rounded-lg px-3 py-2" :class="isDark ? 'bg-d3/60' : 'bg-l3/60'">
        <i class="ri-draggable text-[13px] opacity-50" />
        <div class="flex-1 min-w-0">
          <div class="text-[12px] truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.type === 'separator' ? '──────── 分隔线' : item.label }}</div>
          <div v-if="item.path || item.url" class="text-[10px] truncate opacity-50">{{ item.path || item.url }}</div>
        </div>
        <button class="icon-btn" title="上移" @click="move(index, -1)"><i class="ri-arrow-up-s-line" /></button>
        <button class="icon-btn" title="下移" @click="move(index, 1)"><i class="ri-arrow-down-s-line" /></button>
        <button v-if="item.action !== 'quit'" class="text-[10px] px-2 h-6 rounded" :class="item.enabled !== false ? 'text-emerald-400' : 'opacity-40'" @click="toggle(index)">{{ item.enabled !== false ? '显示' : '隐藏' }}</button>
        <button v-if="item.action !== 'quit'" class="icon-btn text-red-400" title="删除" @click="remove(index)"><i class="ri-delete-bin-line" /></button>
        <span v-else class="text-[10px] px-2 opacity-40">固定</span>
      </div>
      <div class="grid grid-cols-[100px_1fr_1.4fr_auto] gap-2 pt-2">
        <select v-model="draft.type" class="field"><option value="route">应用页面</option><option value="url">外部网址</option><option value="separator">分隔线</option></select>
        <input v-if="draft.type !== 'separator'" v-model="draft.label" class="field" placeholder="菜单名称" />
        <input v-if="draft.type !== 'separator'" v-model="draft.target" class="field" :placeholder="draft.type === 'url' ? 'https://example.com' : '/workchat'" />
        <div v-else class="col-span-2" />
        <button class="h-8 px-3 rounded-lg bg-brand-500 text-white text-[11px]" @click="addItem">添加</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.icon-btn{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px}.icon-btn:hover{background:rgba(127,127,127,.15)}
.field{height:32px;border-radius:8px;padding:0 9px;font-size:11px;background:rgba(127,127,127,.1);border:1px solid rgba(127,127,127,.18);min-width:0}
</style>
