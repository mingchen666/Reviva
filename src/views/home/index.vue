<!-- src/views/Home.vue -->
<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const goSettings = () => {
  router.push('/settings')
}
</script>

<template>
  <!-- UnoCSS: h-screen (全屏高度), flex (弹性布局), items-center (垂直居中) -->
  <div class="h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-green-100 to-blue-100">
    
    <!-- Naive UI 卡片 -->
    <n-card class="max-w-md w-full shadow-xl transition-all duration-300 hover:scale-105">
      <template #header>
        <div class="flex items-center gap-2">
          <n-icon size="24" color="#18a058">
            <!-- 这里可以用你的 Logo 图标 -->
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>
          </n-icon>
          <span class="text-xl font-bold text-gray-800">欢迎使用</span>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-gray-600">
          这是一个基于 Electron + Vue3 + Naive UI 的桌面应用示例。
          点击下方按钮体验路由跳转。
        </p>
        
        <n-divider />

        <div class="flex justify-end">
          <n-button type="primary" size="large" @click="goSettings">
            前往设置页面
          </n-button>
        </div>
      </div>
    </n-card>
  </div>
</template>

<style scoped>
/* 可以在这里加一些 SCSS 动画 */
.shadow-xl {
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
</style>
