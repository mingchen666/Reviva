<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import MsModal from '@/components/MsModal/MsModal.vue';
import { deriveMessageExportTitle } from '../chat/markdownExport';

const props = defineProps({
  show: Boolean,
  message: { type: Object, default: null },
  conversation: { type: Object, default: null },
  folders: { type: Array, default: () => [] },
  previousUserMessage: { type: Object, default: null },
  previousUserLoading: Boolean,
  previousUserError: { type: String, default: '' },
  saving: Boolean,
  saveError: { type: String, default: '' },
  isDark: Boolean
});

const emit = defineEmits(['update:show', 'save', 'clear-error']);

const titleInputRef = ref(null);
const title = ref('');
const selectedFolderId = ref('');
const folderSearch = ref('');
const includeUserPrompt = ref(false);

const visible = computed({
  get: () => props.show,
  set: (value) => {
    if (!props.saving) emit('update:show', value);
  }
});

function sortFolders(items) {
  return [...items].sort((a, b) => {
    const order =
      Number(a?.sort_order ?? a?.sortOrder ?? 0) - Number(b?.sort_order ?? b?.sortOrder ?? 0);
    return order || String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN');
  });
}

const folderOptions = computed(() => {
  const folders = Array.isArray(props.folders) ? props.folders : [];
  const children = new Map();
  folders.forEach((folder) => {
    const parentId = folder?.parent_id || folder?.parentId || '';
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(folder);
  });
  children.forEach((items, key) => children.set(key, sortFolders(items)));

  const result = [];
  const visited = new Set();
  function walk(parentId, parentNames, depth) {
    for (const folder of children.get(parentId) || []) {
      if (!folder?.id || visited.has(folder.id)) continue;
      visited.add(folder.id);
      const names = [...parentNames, folder.name || '未命名文件夹'];
      result.push({ ...folder, depth, pathLabel: names.join(' / ') });
      walk(folder.id, names, depth + 1);
    }
  }
  walk('', [], 0);
  for (const folder of sortFolders(folders.filter((item) => item?.id && !visited.has(item.id)))) {
    const names = [folder.name || '未命名文件夹'];
    result.push({ ...folder, depth: 0, pathLabel: names[0] });
    walk(folder.id, names, 1);
  }
  return result;
});

const filteredFolders = computed(() => {
  const query = folderSearch.value.trim().toLocaleLowerCase();
  if (!query) return folderOptions.value;
  return folderOptions.value.filter((folder) =>
    folder.pathLabel.toLocaleLowerCase().includes(query)
  );
});

const canIncludeUserPrompt = computed(
  () => !props.previousUserLoading && !props.previousUserError && !!props.previousUserMessage
);
const canSave = computed(() => !!title.value.trim() && !!props.message && !props.saving);

const promptStatus = computed(() => {
  if (props.previousUserLoading) return '正在查找对应用户提问…';
  if (props.previousUserError) return props.previousUserError;
  if (!props.previousUserMessage) return '未找到对应用户提问';
  return '将提问和 AI 回复一起写入笔记';
});

function selectFolder(folderId) {
  selectedFolderId.value = folderId || '';
  emit('clear-error');
}

function close() {
  if (!props.saving) visible.value = false;
}

function submit() {
  if (!canSave.value) return;
  emit('save', {
    title: title.value.trim(),
    folderId: selectedFolderId.value,
    includeUserPrompt: includeUserPrompt.value && canIncludeUserPrompt.value
  });
}

watch(
  () => [props.show, props.message?.id],
  ([show]) => {
    if (!show) return;
    title.value = deriveMessageExportTitle(props.message, props.conversation);
    selectedFolderId.value = '';
    folderSearch.value = '';
    includeUserPrompt.value = false;
    nextTick(() => {
      titleInputRef.value?.focus();
      titleInputRef.value?.select();
    });
  },
  { immediate: true }
);

watch(canIncludeUserPrompt, (canInclude) => {
  if (!canInclude) includeUserPrompt.value = false;
});

watch(
  () => props.folders.map((folder) => folder.id).join('|'),
  () => {
    if (
      selectedFolderId.value &&
      !props.folders.some((folder) => folder.id === selectedFolderId.value)
    ) {
      selectedFolderId.value = '';
      emit('clear-error');
    }
  }
);
</script>

<template>
  <MsModal
    v-model:show="visible"
    :width="560"
    max-height="82vh"
    :show-footer="false"
    :closable="!saving"
    :close-on-overlay="!saving"
  >
    <template #header>
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            :class="
              isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-500'
            "
          >
            <i class="ri-sticky-note-add-line text-[16px]" />
          </div>
          <div class="min-w-0">
            <h3 class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              保存到笔记
            </h3>
            <p class="text-[10.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              创建一篇新的 Markdown 笔记
            </p>
          </div>
        </div>
      </div>
    </template>

    <form class="flex flex-col min-h-0" @submit.prevent="submit">
      <label class="text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
        >笔记标题</label
      >
      <input
        ref="titleInputRef"
        v-model="title"
        type="text"
        maxlength="80"
        :disabled="saving"
        class="w-full h-9 px-3 rounded-lg border-0 outline-none text-[13px] transition-colors focus:ring-2 focus:ring-brand-400/15"
        :class="
          isDark
            ? 'bg-d0 border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/60'
            : 'bg-l2 border-bdrF text-lt-main placeholder-lt-aux focus:border-brand-400'
        "
        placeholder="输入笔记标题"
        @input="$emit('clear-error')"
      />

      <div class="flex items-center gap-2 mt-4 mb-1.5">
        <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
          >保存目录</label
        >
        <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
          >支持根目录和嵌套文件夹</span
        >
      </div>

      <div
        class="rounded-xl border overflow-hidden"
        :class="isDark ? 'border-d4 bg-d0/55' : 'border-bdrF bg-l2/65'"
      >
        <div class="px-2.5 py-2 border-b" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <div
            class="h-8 rounded-lg flex items-center gap-2 px-2.5 border transition-colors focus-within:ring-2"
            :class="
              isDark
                ? 'bg-d2 border-d4 text-wt-dim focus-within:border-brand-400/60 focus-within:ring-brand-400/10'
                : 'bg-white border-bdrF text-lt-aux focus-within:border-brand-400 focus-within:ring-brand-400/10'
            "
          >
            <i class="ri-search-line text-[13px]" />
            <input
              v-model="folderSearch"
              type="text"
              :disabled="saving"
              class="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12px]"
              placeholder="搜索文件夹"
            />
          </div>
        </div>

        <div class="max-h-[260px] overflow-y-auto thin-scroll p-1.5">
          <button
            type="button"
            :disabled="saving"
            @click="selectFolder('')"
            class="w-full min-h-9 px-2.5 rounded-lg flex items-center gap-2 text-left text-[12px] transition-colors"
            :class="
              selectedFolderId === ''
                ? isDark
                  ? 'bg-brand-400/14 text-brand-300'
                  : 'bg-brand-50 text-brand-600'
                : isDark
                  ? 'text-wt-sub hover:bg-white/5'
                  : 'text-lt-sub hover:bg-l3'
            "
          >
            <i class="ri-home-4-line text-[13px]" />
            <span class="font-medium">笔记根目录</span>
            <i v-if="selectedFolderId === ''" class="ri-check-line text-[13px] ml-auto" />
          </button>

          <button
            v-for="folder in filteredFolders"
            :key="folder.id"
            type="button"
            :disabled="saving"
            @click="selectFolder(folder.id)"
            class="w-full min-h-9 pr-2.5 rounded-lg flex items-center gap-2 text-left text-[12px] transition-colors"
            :class="
              selectedFolderId === folder.id
                ? isDark
                  ? 'bg-brand-400/14 text-brand-300'
                  : 'bg-brand-50 text-brand-600'
                : isDark
                  ? 'text-wt-sub hover:bg-white/5'
                  : 'text-lt-sub hover:bg-l3'
            "
            :style="{ paddingLeft: 10 + Math.min(folder.depth, 8) * 16 + 'px' }"
            :title="folder.pathLabel"
          >
            <i class="ri-folder-3-line text-[13px] text-amber-400 shrink-0" />
            <span class="truncate">{{ folderSearch ? folder.pathLabel : folder.name }}</span>
            <i
              v-if="selectedFolderId === folder.id"
              class="ri-check-line text-[13px] ml-auto shrink-0"
            />
          </button>

          <div
            v-if="folderSearch && !filteredFolders.length"
            class="py-6 text-center text-[11px]"
            :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
          >
            没有匹配的文件夹
          </div>
        </div>
      </div>

      <label
        class="mt-4 rounded-xl border px-3 py-2.5 flex items-start gap-2.5 transition-colors"
        :class="[
          canIncludeUserPrompt
            ? isDark
              ? 'border-d4 hover:border-brand-400/35 cursor-pointer'
              : 'border-bdrF hover:border-brand-300 cursor-pointer'
            : isDark
              ? 'border-d4 opacity-60'
              : 'border-bdrF opacity-60',
          isDark ? 'bg-d0/45' : 'bg-l2/55'
        ]"
      >
        <input
          v-model="includeUserPrompt"
          type="checkbox"
          :disabled="!canIncludeUserPrompt || saving"
          class="mt-0.5 w-3.5 h-3.5 isUserPrompt"
          @change="$emit('clear-error')"
        />
        <span class="min-w-0">
          <span
            class="block text-[12px] font-medium"
            :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
            >同时包含对应用户提问</span
          >
          <span
            class="block text-[10.5px] mt-0.5"
            :class="previousUserError ? 'text-red-400' : isDark ? 'text-wt-dim' : 'text-lt-aux'"
            >{{ promptStatus }}</span
          >
        </span>
      </label>

      <p v-if="saveError" class="mt-3 text-[11px] flex items-center gap-1.5 text-red-400">
        <i class="ri-error-warning-line text-[12px]" />{{ saveError }}
      </p>

      <div
        class="mt-4 pt-3 border-t flex items-center justify-end gap-2"
        :class="isDark ? 'border-d4' : 'border-bdrL'"
      >
        <button
          type="button"
          :disabled="saving"
          @click="close"
          class="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50"
          :class="isDark ? 'text-wt-sub hover:bg-white/6' : 'text-lt-sub hover:bg-l3'"
        >
          取消
        </button>
        <button
          type="submit"
          :disabled="!canSave"
          class="h-8 px-3.5 rounded-lg text-[12px] font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-colors disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <i
            :class="saving ? 'ri-loader-4-line animate-spin' : 'ri-sticky-note-add-line'"
            class="text-[13px]"
          />
          {{ saving ? '保存中…' : '保存到笔记' }}
        </button>
      </div>
    </form>
  </MsModal>
</template>

<style lang="scss" scoped>
.isUserPrompt[type="checkbox"]:checked {
   accent-color: var(--brand, #4A6CFF);
}
</style>
