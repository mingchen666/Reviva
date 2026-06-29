<script setup>
import { computed } from 'vue'
import MsModal from '@/components/MsModal/MsModal.vue'

const props = defineProps({
  isDark: Boolean,
  confirmAction: Object,
})

const emit = defineEmits(['execute', 'cancel'])

const modalConfig = computed(() => {
  if (!props.confirmAction) return null
  const action = props.confirmAction
  const type = action.type

  if (type === 'restore') return {
    icon: 'ri-arrow-go-back-line',
    iconBg: props.isDark ? 'bg-brand-400/8' : 'bg-brand-50',
    iconColor: 'text-brand-400',
    title: '恢复文件',
    body: '确定要将此文件恢复到原始位置吗？',
    confirmLabel: '确认恢复',
    confirmClass: props.isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600',
  }

  if (type === 'restoreBatch') return {
    icon: 'ri-arrow-go-back-line',
    iconBg: props.isDark ? 'bg-brand-400/8' : 'bg-brand-50',
    iconColor: 'text-brand-400',
    title: '批量恢复',
    body: `确定要恢复选中的 ${action.target?.length || 0} 个文件吗？`,
    confirmLabel: '确认恢复',
    confirmClass: props.isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600',
  }

  if (type === 'delete') return {
    icon: 'ri-delete-bin-line',
    iconBg: props.isDark ? 'bg-red-400/8' : 'bg-red-50',
    iconColor: 'text-red-400',
    title: '永久删除',
    body: '永久删除此文件？此操作不可撤销，文件将无法恢复。',
    confirmLabel: '确认删除',
    confirmClass: 'bg-red-500 text-white hover:bg-red-600',
  }

  if (type === 'deleteBatch') return {
    icon: 'ri-delete-bin-line',
    iconBg: props.isDark ? 'bg-red-400/8' : 'bg-red-50',
    iconColor: 'text-red-400',
    title: '批量永久删除',
    body: `永久删除选中的 ${action.target?.length || 0} 个文件？此操作不可撤销。`,
    confirmLabel: '确认删除',
    confirmClass: 'bg-red-500 text-white hover:bg-red-600',
  }

  if (type === 'empty') return {
    icon: 'ri-delete-bin-line',
    iconBg: props.isDark ? 'bg-red-400/8' : 'bg-red-50',
    iconColor: 'text-red-400',
    title: '清空回收站',
    body: '清空回收站？所有文件将被永久删除，此操作不可撤销。',
    confirmLabel: '清空回收站',
    confirmClass: 'bg-red-500 text-white hover:bg-red-600',
  }

  return null
})

const showModal = computed({
  get: () => props.confirmAction !== null,
  set: (val) => { if (!val) emit('cancel') },
})
</script>

<template>
  <!-- Only mount MsModal when it's actually needed — avoids Teleport cleanup issues on route change -->
  <MsModal v-if="confirmAction !== null" v-model:show="showModal" :width="360" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="modalConfig?.iconBg">
          <i :class="[modalConfig?.icon, modalConfig?.iconColor]" class="text-[16px]" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ modalConfig?.title }}</span>
      </div>
    </template>

    <div>
      <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ modalConfig?.body }}</p>
    </div>

    <template #footer="{ close }">
      <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
      <button @click="emit('execute'); close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="modalConfig?.confirmClass">{{ modalConfig?.confirmLabel }}</button>
    </template>
  </MsModal>
</template>