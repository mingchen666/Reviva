<script setup>
const props = defineProps({
  editSkill: Object,
  isDark: Boolean,
})

const emit = defineEmits(['cancel', 'save'])

// Generate ID suggestion from display name
function slugify(val) {
  return (val || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').trim()
}

const colorOptions = ['#6C8AFF', '#A78BFA', '#4ADE80', '#FACC15', '#F87171', '#3B82F6', '#EC4899', '#8B5CF6']
const categoryOptions = ['学习', '编程', '写作', '研究', '效率']
const promptVars = ['{{input}}', '{{document_name}}', '{{space_name}}', '{{topic}}']
const emojiOptions = ['🧠', '📝', '💻', '🔍', '📊', '🎨', '⚡', '🔧', '📚', '🎯', '🚀', '💡', '🗂️', '🤖', '🔒', '🌐']
const iconOptions = ['ri-flashlight-line', 'ri-file-text-line', 'ri-list-check-2', 'ri-stack-line', 'ri-question-line', 'ri-node-tree', 'ri-brain-line', 'ri-code-s-slash-line']
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('cancel')" />
      <div class="relative rounded-2xl overflow-hidden w-full max-w-[560px] max-h-[85vh] flex flex-col"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">

        <!-- Header -->
        <div class="px-5 py-3 flex justify-between items-center shrink-0"
          :class="isDark ? 'border-b border-d4 bg-d4/30' : 'border-b border-bdrL bg-l4/30'">
          <div class="flex items-center gap-2">
            <i class="ri-flashlight-line text-brand-400 text-[14px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ editSkill.name ? '编辑 · ' + editSkill.name : '新建 Skill' }}</span>
          </div>
          <button @click="emit('cancel')" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"><i class="ri-close-line text-[14px]" /></button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          <div class="px-5 py-4 space-y-4">

            <!-- Basic Info -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-profile-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基础信息</span></div>
              <div class="space-y-3">
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Skill ID (英文目录名) <span class="text-red-400">*</span></label>
                  <input
                    :value="editSkill.englishName || editSkill.id"
                    @input="editSkill.englishName = slugify($event.target.value); editSkill.id = editSkill.englishName"
                    placeholder="my-skill-name"
                    class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors font-mono"
                    :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'"
                    :disabled="!editSkill._isNew"
                  />
                  <p class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">仅限英文小写、数字、连字符，作为 skills/ 下的目录名</p>
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">显示名称 <span class="text-red-400">*</span></label>
                  <input v-model="editSkill.name" type="text" placeholder="输入 Skill 显示名称" class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'">
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">描述</label>
                  <textarea v-model="editSkill.desc" rows="2" placeholder="简短描述 Skill 功能..." class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'"></textarea>
                </div>
                <div class="flex gap-6">
                  <div>
                    <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">图标</label>
                    <!-- Emoji row -->
                    <div class="flex gap-1 flex-wrap mb-1.5">
                      <button v-for="em in emojiOptions" :key="em" @click="editSkill.icon = em" class="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] transition-all" :class="editSkill.icon === em ? (isDark ? 'bg-brand-400/12 border border-brand-400/30' : 'bg-brand-50 border border-brand-100') : (isDark ? 'border border-d4 hover:border-brand-400/30' : 'border border-bdrF hover:border-brand-200')">
                        {{ em }}
                      </button>
                    </div>
                    <!-- Remix icon row -->
                    <div class="flex gap-1 flex-wrap">
                      <button v-for="ic in iconOptions" :key="ic" @click="editSkill.icon = ic" class="w-8 h-8 rounded-lg flex items-center justify-center transition-all" :class="editSkill.icon === ic ? (isDark ? 'bg-brand-400/12 border border-brand-400/30' : 'bg-brand-50 border border-brand-100') : (isDark ? 'border border-d4 hover:border-brand-400/30' : 'border border-bdrF hover:border-brand-200')">
                        <i :class="ic + ' text-[14px] ' + (editSkill.icon === ic ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-aux' : 'text-lt-aux'))" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">颜色</label>
                    <div class="flex gap-1.5 flex-wrap">
                      <button v-for="c in colorOptions" :key="c" @click="editSkill.color = c" class="w-6 h-6 rounded-full transition-all" :class="editSkill.color === c ? 'ring-2 ring-offset-2 scale-110' : ''" :style="'background-color:' + c + ';' + (editSkill.color === c ? (isDark ? '--tw-ring-offset-color:#252530;--tw-ring-color:rgba(255,255,255,0.4)' : '--tw-ring-offset-color:#f5f4f3;--tw-ring-color:rgba(255,255,255,0.8)') : '')" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Prompt Template / SKILL.md -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-double-quotes-l text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">SKILL.md / 提示词模板 <span class="text-red-400">*</span></span></div>
              <textarea v-model="editSkill.promptContent" rows="8" placeholder="定义 Skill 的 SKILL.md 格式内容（frontmatter + instructions），支持 {{variable}} 插值..." class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-y transition-colors leading-relaxed font-mono" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'"></textarea>
              <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">插入变量：</span>
                <button v-for="v in promptVars" :key="v" @click="editSkill.promptContent = (editSkill.promptContent || '') + v" class="ctx-pill cursor-pointer font-mono text-[10px]" :class="isDark ? 'text-brand-400 bg-brand-400/6 border border-brand-400/15 hover:bg-brand-400/12' : 'text-brand-500 bg-brand-50 border border-brand-100 hover:bg-brand-100'">{{ v }}</button>
              </div>
            </div>

            <!-- Category -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-folder-line text-agent-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">分类</span></div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="cat in categoryOptions" :key="cat" @click="editSkill.category = cat" class="ctx-pill cursor-pointer transition-colors"
                  :class="editSkill.category === cat ? (isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/30' : 'bg-brand-50 text-brand-500 border border-brand-200') : (isDark ? 'text-wt-aux bg-d0 border border-d4 hover:border-brand-400/20' : 'text-lt-aux bg-l2 border border-bdrF hover:border-brand-200')">
                  {{ cat }}
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 flex justify-end gap-2 shrink-0"
          :class="isDark ? 'border-t border-d4 bg-d4/30' : 'border-t border-bdrL bg-l4/30'">
          <button @click="emit('cancel')" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
          <button @click="emit('save')" class="px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"><i class="ri-check-line text-[12px]" /> 保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>