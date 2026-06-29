<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  image: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

const zoom = ref(1)
const rotation = ref(0)

const imageStyle = computed(() => ({
  transform: `rotate(${rotation.value}deg) scale(${zoom.value})`,
}))

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

watch(() => props.image?.src, () => {
  zoom.value = 1
  rotation.value = 0
})

function close() {
  emit('close')
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function zoomIn() {
  zoom.value = clampZoom(zoom.value + ZOOM_STEP)
}

function zoomOut() {
  zoom.value = clampZoom(zoom.value - ZOOM_STEP)
}

function resetView() {
  zoom.value = 1
  rotation.value = 0
}

function rotateLeft() {
  rotation.value -= 90
}

function rotateRight() {
  rotation.value += 90
}

function fileNameFromSrc(src) {
  const fallback = props.image?.title || props.image?.alt || 'image'
  try {
    const url = new URL(src)
    const path = decodeURIComponent(url.pathname || '')
    const name = path.split(/[\\/]/).filter(Boolean).pop()
    return name || `${fallback}.png`
  } catch {
    const name = String(src || '').split(/[\\/]/).filter(Boolean).pop()
    return name || `${fallback}.png`
  }
}

function downloadImage() {
  const src = props.image?.src
  if (!src) return
  const link = document.createElement('a')
  link.href = src
  link.download = fileNameFromSrc(src)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function onKeydown(event) {
  if (event.key === 'Escape') return close()
  if (!props.image) return
  if (event.key === '+' || event.key === '=') return zoomIn()
  if (event.key === '-' || event.key === '_') return zoomOut()
  if (event.key === '0') return resetView()
  if (event.key.toLowerCase() === 'r') return rotateRight()
  if (event.key.toLowerCase() === 'l') return rotateLeft()
  if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    downloadImage()
  }
}

function onWheel(event) {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  if (event.deltaY < 0) zoomIn()
  else zoomOut()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="props.image" class="markdown-image-preview" @click="close">
      <button class="markdown-image-preview__close" type="button" title="Close" @click.stop="close">
        <i class="ri-close-line" />
      </button>
      <div class="markdown-image-preview__stage" @click.stop @wheel="onWheel">
        <img
          class="markdown-image-preview__image"
          :src="props.image.src"
          :alt="props.image.alt"
          :title="props.image.title"
          :style="imageStyle"
          draggable="false">
      </div>
      <div class="markdown-image-preview__toolbar" @click.stop>
        <button type="button" title="缩小" :disabled="zoom <= MIN_ZOOM" @click="zoomOut">
          <i class="ri-zoom-out-line" />
        </button>
        <span class="markdown-image-preview__zoom">{{ zoomLabel }}</span>
        <button type="button" title="放大" :disabled="zoom >= MAX_ZOOM" @click="zoomIn">
          <i class="ri-zoom-in-line" />
        </button>
        <span class="markdown-image-preview__divider" />
        <button type="button" title="向左旋转" @click="rotateLeft">
          <i class="ri-anticlockwise-line" />
        </button>
        <button type="button" title="向右旋转" @click="rotateRight">
          <i class="ri-clockwise-line" />
        </button>
        <button type="button" title="重置视图" @click="resetView">
          <i class="ri-restart-line" />
        </button>
        <span class="markdown-image-preview__divider" />
        <button type="button" title="保存图片" @click="downloadImage">
          <i class="ri-download-line" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.markdown-image-preview {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 48px 84px;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(6px);
}

.markdown-image-preview__stage {
  width: min(96vw, 1440px);
  height: min(82vh, 920px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.markdown-image-preview__image {
  max-width: min(96vw, 1440px);
  max-height: 82vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.42);
  transition: transform 0.16s ease;
  transform-origin: center center;
  user-select: none;
}

.markdown-image-preview__close {
  position: fixed;
  top: 18px;
  right: 18px;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  color: #fff;
  background: rgba(15, 15, 20, 0.66);
  cursor: pointer;
}

.markdown-image-preview__close:hover {
  background: rgba(255, 255, 255, 0.16);
}

.markdown-image-preview__toolbar {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  background: rgba(15, 15, 20, 0.78);
  color: #fff;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(10px);
}

.markdown-image-preview__toolbar button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  background: transparent;
  cursor: pointer;
}

.markdown-image-preview__toolbar button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.markdown-image-preview__toolbar button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.markdown-image-preview__toolbar i {
  font-size: 17px;
}

.markdown-image-preview__zoom {
  width: 48px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.82);
}

.markdown-image-preview__divider {
  width: 1px;
  height: 22px;
  margin: 0 2px;
  background: rgba(255, 255, 255, 0.16);
}
</style>
