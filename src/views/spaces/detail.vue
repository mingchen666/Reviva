<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useCloudSpacesStore } from '@/stores/cloudSpaces'
import { useUserStore } from '@/stores/user'
import { useMessage } from '@/components/MsMessage/useMessage'
import { docStatusClass, docStatusDotClass, docStatusMeta, fmtBytes } from './sections/kbFormat'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const spacesStore = useCloudSpacesStore()
const userStore = useUserStore()
const msg = useMessage()

const isDark = computed(() => appStore.isDark)
const spaceId = computed(() => route.params.id)
const space = computed(() => spacesStore.getKb(spaceId.value))
const docs = computed(() => spacesStore.getDocs(spaceId.value))
const loading = computed(() => spacesStore.docsByKb[spaceId.value]?.loading)
const isSystemSpace = computed(() => space.value?.isSystem === true)

async function ensureLoaded() {
  if (!userStore.isLoggedIn) return
  try {
    if (!space.value) await spacesStore.loadKbList()
    if (!space.value) await spacesStore.loadSystemKbList()
    await spacesStore.loadDocs(spaceId.value)
  } catch (e) {
    msg.error(e?.detail || '加载失败')
  }
}

async function refresh() {
  try {
    await Promise.all([
      isSystemSpace.value ? spacesStore.refreshSystemKbList() : spacesStore.refreshKbList(),
      spacesStore.refreshDocs(spaceId.value),
    ])
    msg.success('已刷新')
  } catch (e) {
    msg.error(e?.detail || '刷新失败')
  }
}

async function deleteDoc(docId) {
  if (isSystemSpace.value) {
    msg.warning('系统知识库文档不可删除')
    return
  }
  try {
    await spacesStore.deleteDoc(spaceId.value, docId)
    msg.success('文档已删除')
  } catch (e) {
    msg.error(e?.detail || '删除失败')
  }
}

onMounted(ensureLoaded)
watch(spaceId, ensureLoaded)
</script>

<template>
  <!-- Unauthenticated — login prompt -->
  <div v-if="!userStore.isLoggedIn" class="h-full flex items-center justify-center" :class="isDark ? 'bg-d2' : 'bg-l2'">
    <div class="text-center max-w-[320px]">
      <div
        class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <i class="ri-lock-line text-[28px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
      </div>
      <h2 class="text-[16px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">请先登录</h2>
      <p class="text-[12px] mb-5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">登录后可查看知识库详情</p>
      <div class="flex gap-3 justify-center">
        <button
          @click="router.push('/login')"
          class="px-5 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
          <i class="ri-login-box-line text-[12px] mr-1" />
          登录
        </button>
      </div>
    </div>
  </div>

  <div v-else-if="space" class="max-w-6xl mx-auto px-6 lg:px-8 py-5">
    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="isDark ? 'hover:bg-d3 text-wt-aux' : 'hover:bg-l3 text-lt-aux'"
          @click="router.push('/spaces')">
          <i class="ri-arrow-left-line text-[16px]" />
        </button>
        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center"
          :style="`background: ${space.color || '#6C8AFF'}15`">
          <i
            :class="space.icon || 'ri-folder-3-line'"
            class="text-[20px]"
            :style="`color: ${space.color || '#6C8AFF'}`" />
        </div>
        <div>
          <h1 class="text-[18px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ space.name }}</h1>
          <span class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            {{ space.docCount }} 篇文档 · {{ space.description || '暂无描述' }}
          </span>
          <span
            v-if="isSystemSpace"
            class="inline-flex mt-1 px-2 py-0.5 rounded-md text-[10px] border"
            :class="
              isDark
                ? 'text-brand-300 bg-brand-400/8 border-brand-400/20'
                : 'text-brand-600 bg-brand-50 border-brand-100'
            ">
            系统内置
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1"
          :class="
            isDark
              ? 'bg-d3 border border-bdr text-wt-sub hover:text-wt-main'
              : 'bg-l2 border border-bdrF text-lt-sub hover:text-lt-main'
          "
          @click="refresh">
          <i class="ri-refresh-line text-[11px]" :class="loading ? 'animate-spin' : ''" />
          刷新
        </button>
        <button
          class="px-3 py-1.5 rounded-lg text-[12px] font-medium"
          :class="
            isDark
              ? 'bg-brand-400/10 border border-brand-400/20 text-brand-400'
              : 'bg-brand-50 border border-brand-100 text-brand-600'
          "
          @click="router.push('/workchat')">
          <i class="ri-chat-smile-2-line text-[11px] mr-1" />
          学习台
        </button>
      </div>
    </div>

    <!-- Document List -->
    <div
      class="rounded-xl overflow-hidden"
      :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
      <!-- Table Header -->
      <div
        class="grid grid-cols-[1fr_100px_100px_120px_80px] gap-4 px-4 py-2.5 text-[11px] font-semibold"
        :class="isDark ? 'bg-d3/50 text-wt-aux' : 'bg-l3 text-lt-aux'">
        <span>文件名</span>
        <span>类型</span>
        <span>大小</span>
        <span>状态</span>
        <span>操作</span>
      </div>
      <!-- Rows -->
      <div :class="isDark ? 'divide-d4' : 'divide-bdrF'" class="divide-y">
        <div
          v-for="doc in docs"
          :key="doc.id"
          class="grid grid-cols-[1fr_100px_100px_120px_80px] gap-4 px-4 py-3 items-center"
          :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l3/50'">
          <div class="flex items-center gap-2.5 min-w-0">
            <i class="ri-file-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
            <span class="text-[12px] truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ doc.name }}</span>
          </div>
          <span class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            {{ doc.type?.toUpperCase() || '—' }}
          </span>
          <span class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ fmtBytes(doc.size) }}</span>
          <span
            class="ctx-pill border"
            :class="docStatusClass(doc.status, isDark)">
            <span class="w-1.5 h-1.5 rounded-full" :class="docStatusDotClass(doc.status)" />
            {{ docStatusMeta(doc.status).label }}
          </span>
          <div class="flex items-center gap-1">
            <button
              v-if="!isSystemSpace"
              class="text-[10px]"
              :class="isDark ? 'text-wt-dim hover:text-red-400' : 'text-lt-aux hover:text-red-400'"
              @click="deleteDoc(doc.id)">
              删除
            </button>
          </div>
        </div>
        <div
          v-if="docs.length === 0"
          class="px-4 py-8 text-center text-[12px]"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          暂无文档，回到列表页点击"导入"添加资料
        </div>
      </div>
    </div>
  </div>
  <div v-else class="max-w-6xl mx-auto px-6 py-5 text-center">
    <p class="text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">知识库不存在或未加载</p>
    <button class="mt-3 text-brand-400 text-[12px]" @click="router.push('/spaces')">返回知识库列表</button>
  </div>
</template>
