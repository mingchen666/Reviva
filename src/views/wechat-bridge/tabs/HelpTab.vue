<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const steps = [
  { n: 1, t: '扫码连接', d: '在「微信连接」页扫码登录' },
  { n: 2, t: '选择 Agent', d: '在「AI 助手」页选择处理 Agent' },
  { n: 3, t: '发送消息', d: '在微信中给 Bot 发消息对话' },
  { n: 4, t: '导入文件', d: '发送文件 / 链接，图片直接识别' },
]
const cmds = [
  { c: '/help', d: '显示所有可用指令，也可发「菜单」「功能」「帮助」触发' },
  { c: '/new', d: '保存当前对话，开始新对话' },
  { c: '/clear', d: '清空当前对话上下文（不保存）' },
  { c: '/agent', d: '列出可用 Agent' },
  { c: '/agent <名称>', d: '切换到匹配的 Agent，如 /agent 考公' },
  { c: '/status', d: '查看当前 Agent、模型、连接状态' },
  { c: '/files', d: '列出已导入到微信bot文件目录的文件' },
  { c: '/doc <文件名>', d: '引用指定文件，标记为当前对话重点参考' },
]
const types = [{ i: 'ri-font-line', c: 'blue', t: '文本' }, { i: 'ri-image-line', c: 'amber', t: '图片' }, { i: 'ri-file-3-line', c: 'amber', t: '文件' }, { i: 'ri-mic-line', c: 'amber', t: '语音' }, { i: 'ri-link', c: 'brand', t: '链接' }]
const faqs = ref([{ q: '会话多久过期？过期后怎么办？', a: '会话有效期约 24 小时，过期后需等待约 1 小时暂停窗口才能重新扫码。扫码后凭证自动持久化，重启 Reviva 无需重新扫码。', open: true }, { q: '关闭 Reviva 后 Bot 还能用吗？', a: '不能。Bot 运行在 Reviva 主进程内，关闭后自动停止。重新打开后若有有效凭证则自动恢复连接。', open: false }, { q: '连续发多条消息会怎样？', a: '15 秒内连续发送的消息会自动合并为一条发给 Agent（防抖聚合），避免多次调用浪费 Token。', open: false }, { q: 'Agent 处理时微信会显示什么？', a: '处理期间微信显示「正在输入...」状态（typing 保活），每 8-15 秒刷新，上限 5 分钟。', open: false }, { q: '图片会被保存吗？', a: '不会。图片直接作多模态输入给 Agent，不存到微信bot文件目录。只有文件和链接才会导入。', open: false }, { q: '支持群聊吗？', a: '目前不支持。Bot 是 1:1 绑定到你的微信号，只能私聊。群聊功能将在未来版本中验证和加入。', open: false }])
function toggleFaq(f) { f.open = !f.open }
</script>
<template>
  <div class="max-w-5xl mx-auto px-5 space-y-4">
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3"><i class="ri-rocket-line text-[16.5px] text-brand-400" /><span class="text-[14.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">快速开始</span></div>
      <div class="grid grid-cols-2 gap-2.5">
        <div v-for="s in steps" :key="s.n" class="flex items-center gap-2.5 px-3 py-2.5 rounded-md" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l3 border border-bdrF'">
          <div class="w-5 h-5 rounded-full bg-brand-500 text-white text-[11.5px] font-semibold flex items-center justify-center shrink-0">{{ s.n }}</div>
          <div class="min-w-0">
            <div class="text-[13.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ s.t }}</div>
            <div class="text-[12.5px] truncate" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ s.d }}</div>
          </div>
        </div>
      </div>
      <div class="mt-4 pt-4 border-t" :class="isDark ? 'border-d4' : 'border-bdrF'">
        <div class="text-[12.5px] font-semibold mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Bot 首条自动回复</div>
        <div class="rounded-md p-3.5" :class="isDark ? 'bg-d3' : 'bg-l3'">
          <div class="text-[13.5px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">我是你的 Reviva 学习助手，直接提问就行，也可以发文件 / 链接给我导入。发 /help 看更多指令。</div>
        </div>
        <div class="text-[13px] mt-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">扫码登录后用户发第一条消息时，Bot 会自动回复这段引导语。</div>
      </div>
    </div>
    <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 px-5 pt-4 pb-2.5"><i class="ri-terminal-line text-[16.5px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'" /><span class="text-[14.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">指令速查</span></div>
      <div class="px-5 pb-4">
        <table class="w-full" style="border-collapse:collapse">
          <thead>
            <tr :class="isDark ? 'bg-d0' : 'bg-l4'">
              <th class="text-[12.5px] font-semibold text-left w-[140px] px-3 py-2.5 border border-solid border-bdrF" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">指令</th>
              <th class="text-[12.5px] font-semibold text-left px-3 py-2.5 border border-solid border-bdrF" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cmd in cmds" :key="cmd.c">
              <td class="px-3 py-2.5 border border-solid border-bdrF"><code class="font-mono text-[14px] text-brand-400 font-semibold">{{ cmd.c }}</code></td>
              <td class="text-[13px] leading-relaxed px-3 py-2.5 border border-solid border-bdrF" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ cmd.d }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3"><i class="ri-mail-line text-[16.5px] text-blue-400" /><span class="text-[14.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">支持的消息类型</span></div>
      <div class="flex gap-2 flex-wrap">
        <span v-for="t in types" :key="t.t" class="flex items-center gap-1.5 text-[13px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"><i :class="[t.i, 'text-[15.5px]', isDark ? 'text-blue-400' : 'text-blue-500']" /><span class="text-[13px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ t.t }}</span></span>
      </div>
    </div>
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3"><i class="ri-question-line text-[16.5px] text-amber-400" /><span class="text-[14.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">常见问题</span></div>
      <div class="space-y-2">
        <div v-for="(f, i) in faqs" :key="i" class="rounded-md border transition-colors" :class="isDark ? 'border-d4 hover:border-bdr' : 'border-bdrF hover:border-brand-400'">
          <div class="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer" @click="toggleFaq(f)">
            <i class="ri-arrow-right-s-line text-[15.5px] shrink-0 transition-transform duration-200" :class="[(isDark ? 'text-wt-aux' : 'text-lt-aux'), f.open ? 'rotate-90' : '' ]" />
            <span class="flex-1 text-[14px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ f.q }}</span>
          </div>
          <div v-show="f.open" class="pl-9 pr-3 pb-3 text-[13px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ f.a }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
