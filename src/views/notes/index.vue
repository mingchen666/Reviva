<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNotesStore } from '@/stores/notes'
import { useAppStore } from '@/stores/app'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import NoteSidebar from './sections/NoteSidebar.vue'
import NoteEditor from './sections/NoteEditor.vue'

const notesStore = useNotesStore()
const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const sidebarRef = ref(null)
const showAiConfig = ref(false)

onMounted(() => { notesStore.loadFromDb() })

function createNote() {
  if (sidebarRef.value) {
    sidebarRef.value.createNote()
  } else {
    notesStore.addNote({ folder_id: notesStore.currentFolderId || '', title: '新笔记', content: '' })
  }
}
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <LeftPanel :width="260" :resizable="false">
      <NoteSidebar ref="sidebarRef" :show-ai-config="showAiConfig" @open-ai-config="showAiConfig = true" />
    </LeftPanel>

    <MainContent padding="p-0">
      <NoteEditor @create-note="createNote" v-model:show-ai-config="showAiConfig" />
    </MainContent>
  </div>
</template>