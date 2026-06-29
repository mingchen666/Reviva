<template>
<svg 
  :class="['svg-icon', className]" 
  :style="{
    width: `${size}px`,
    height: `${size}px`,
    fill: color,
    ...customStyle
  }"
  aria-hidden="true"
>
    <use :xlink:href="`${symbolId}`" />
  </svg>
</template>

<script setup>
import { defineProps } from 'vue';

// 核心参数：只保留最常用的控制项
const props = defineProps({
  // 图标文件名（必传）
  iconClass: {
    type: String,
    required: true
  },
  // 额外类名（用于特殊样式）
  className: {
    type: String,
    default: ''
  },
  // 尺寸（默认16px）
  size: {
    type: [Number, String],
    default: 16
  },
  // 填充色（默认继承父元素文本色）
  color: {
    type: String,
    default: 'currentColor' // 关键：默认继承父元素颜色
  },
  // 线条色（默认同填充色）
  strokeColor: {
    type: String,
    default: ''
  },
  // 自定义样式（灵活扩展）
  customStyle: {
    type: Object,
    default: () => ({})
  }
});
const symbolId = computed(() => `#icon-${props.iconClass}`)
</script>

<style scoped>
.svg-icon {
  display: inline-block;
  vertical-align: middle;
  overflow: hidden;
}
</style>
    