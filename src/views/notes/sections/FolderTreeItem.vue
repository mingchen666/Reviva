<script setup>
import MsTreeItem from '@/components/MsTreeItem/MsTreeItem.vue'
import { computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  isDark: { type: Boolean, default: true },
  activeFolderId: { type: String, default: '' },
  activeNoteId: { type: String, default: '' },
  notesInFolder: { type: Array, default: () => [] },
  level: { type: Number, default: 0 },
})

const emit = defineEmits(['select-folder', 'toggle-folder', 'select-note', 'folder-contextmenu', 'note-contextmenu'])

const isActive = computed(() => props.activeFolderId === props.node.id)
const hasContent = computed(() => (props.node.children && props.node.children.length > 0) || props.notesInFolder.length > 0)

function folderCtx(e) { emit('folder-contextmenu', e, props.node.id, props.node.name) }
function noteCtx(e, noteId, noteTitle) { emit('note-contextmenu', e, noteId, noteTitle) }
</script>

<template>
  <div>
    <!-- Folder row -->
    <MsTreeItem
      :label="node.name"
      :icon="node.expanded ? 'ri-folder-open-line' : 'ri-folder-3-line'"
      :icon-color="isDark ? 'text-amber-400' : 'text-amber-500'"
      :badge="notesInFolder.length || ''"
      :active="isActive"
      :level="level"
      :is-dark="isDark"
      :has-arrow="hasContent"
      :expanded="node.expanded"
      :is-folder="true"
      @click="emit('select-folder', node.id)"
      @arrow-click="emit('toggle-folder', node.id)"
      @contextmenu="folderCtx($event)"
    />

    <!-- Expanded: interleave sub-folders and notes at same level -->
    <div v-if="node.expanded && hasContent">
      <!-- Sub-folders first -->
      <FolderTreeItem
        v-for="child in node.children" :key="child.id"
        :node="child" :is-dark="isDark"
        :active-folder-id="activeFolderId"
        :active-note-id="activeNoteId"
        :notes-in-folder="child._notes || []"
        :level="level + 1"
        @select-folder="(id) => emit('select-folder', id)"
        @toggle-folder="(id) => emit('toggle-folder', id)"
        @select-note="(id) => emit('select-note', id)"
        @folder-contextmenu="(e, id, name) => emit('folder-contextmenu', e, id, name)"
        @note-contextmenu="(e, id, title) => emit('note-contextmenu', e, id, title)"
      />
      <!-- Notes at the same level under this folder -->
      <MsTreeItem
        v-for="note in notesInFolder" :key="note.id"
        :label="note.title"
        :icon="'ri-markdown-line'"
        :icon-color="isDark ? 'text-emerald-400' : 'text-emerald-500'"
        :active="activeNoteId === note.id"
        :level="level + 1"
        :is-dark="isDark"
        :is-folder="false"
        @click="emit('select-note', note.id)"
        @contextmenu="noteCtx($event, note.id, note.title)"
      />
    </div>
  </div>
</template>