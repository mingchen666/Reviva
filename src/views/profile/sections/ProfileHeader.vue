<script setup>
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useUserProfileStore } from '@/stores/userProfile'
import { useMessage } from '@/components/MsMessage/useMessage'
import MsModal from '@/components/MsModal/MsModal.vue'

const appStore = useAppStore()
const profileStore = useUserProfileStore()
const isDark = computed(() => appStore.isDark)
const p = computed(() => profileStore.profile)
const message = useMessage()

const showEdit = ref(false)
const form = ref({ nickname: '', email: '', bio: '' })
const errors = ref({ nickname: '', email: '' })

const NICKNAME_MAX = 20
const BIO_MAX = 80

function openEdit() {
  form.value = {
    nickname: p.value.nickname || '',
    email: p.value.email || '',
    bio: p.value.bio || '',
  }
  errors.value = { nickname: '', email: '' }
  showEdit.value = true
}

function validate() {
  errors.value = { nickname: '', email: '' }
  const nick = form.value.nickname.trim()
  if (!nick) errors.value.nickname = '用户名不能为空'
  else if (nick.length > NICKNAME_MAX) errors.value.nickname = `用户名不能超过 ${NICKNAME_MAX} 个字符`
  else if (!/^[\u4e00-\u9fa5A-Za-z0-9_\-·\s]+$/.test(nick)) errors.value.nickname = '仅支持中英文、数字、下划线、横线'

  const email = form.value.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.value.email = '邮箱格式不正确'

  return !errors.value.nickname && !errors.value.email
}

function save() {
  if (!validate()) return
  profileStore.updateProfile({
    nickname: form.value.nickname,
    email: form.value.email,
    bio: form.value.bio,
  })
  showEdit.value = false
  message.success('资料已更新')
}

watch(() => form.value.nickname, () => { if (errors.value.nickname) errors.value.nickname = '' })
watch(() => form.value.email, () => { if (errors.value.email) errors.value.email = '' })
</script>

<template>
  <div class="rounded-xl overflow-hidden relative"
    :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
    <!-- Decorative gradient blob (top-right) -->
    <div class="absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl opacity-25 pointer-events-none"
      :style="{ background: 'radial-gradient(circle, var(--brand), transparent 70%)' }" />
    <div class="absolute -left-12 -bottom-16 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
      :style="{ background: 'radial-gradient(circle, #A78BFA, transparent 70%)' }" />

    <div class="relative p-6 flex items-center gap-5">
      <!-- Avatar -->
      <div class="relative shrink-0">
        <div class="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-[30px] font-bold text-white shadow-xl ring-2"
          :style="{ background: 'linear-gradient(135deg, var(--brand) 0%, #A78BFA 60%, #F0ABFC 100%)' }"
          :class="isDark ? 'ring-d0/60' : 'ring-l1'">
          {{ p.nickname?.[0] || 'M' }}
        </div>
        <!-- Online dot -->
        <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 bg-emerald-400"
          :class="isDark ? 'ring-d3' : 'ring-l3'" />
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0">
        <h2 class="text-[20px] font-bold leading-tight mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ p.nickname }}</h2>
        <p class="text-[12px] mb-3 line-clamp-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ p.bio || '尚未填写简介' }}</p>

        <div class="flex items-center gap-3 flex-wrap text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <span class="flex items-center gap-1"><i class="ri-mail-line text-[12px]" />{{ p.email }}</span>
          <span class="opacity-40">·</span>
          <span class="flex items-center gap-1"><i class="ri-fingerprint-line text-[12px]" />UID {{ p.uid }}</span>
          <span class="opacity-40">·</span>
          <span class="flex items-center gap-1"><i class="ri-calendar-line text-[12px]" />加入于 {{ p.registeredAt }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-2 shrink-0">
        <button @click="openEdit"
          class="h-8 px-3.5 rounded-md text-[11.5px] font-medium flex items-center gap-1.5 transition-all"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20 border border-brand-400/25' : 'bg-brand-50 text-brand-500 hover:bg-brand-100 border border-brand-100'">
          <i class="ri-edit-line text-[12px]" /> 编辑资料
        </button>
        <button class="h-8 px-3.5 rounded-md text-[11.5px] font-medium flex items-center gap-1.5 transition-colors"
          :class="isDark ? 'bg-d0/80 text-wt-aux hover:bg-d4 hover:text-wt-sub border border-bdr' : 'bg-l2/80 text-lt-aux hover:bg-l4 hover:text-lt-sub border border-bdrF'">
          <i class="ri-shield-user-line text-[12px]" /> 账号安全
        </button>
      </div>
    </div>

    <!-- Edit Profile Modal -->
    <MsModal v-model:show="showEdit" :width="480">
      <template #header>
        <div class="flex items-center gap-2">
          <i class="ri-user-settings-line text-brand-400 text-[14px]" />
          <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">编辑个人资料</span>
        </div>
      </template>

      <div class="space-y-4">
        <!-- Avatar preview -->
        <div class="flex items-center gap-3 p-3 rounded-lg" :class="isDark ? 'bg-d0/60 border border-d4' : 'bg-l2/60 border border-bdrF'">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center text-[20px] font-bold text-white shadow"
            :style="{ background: 'linear-gradient(135deg, var(--brand) 0%, #A78BFA 60%, #F0ABFC 100%)' }">
            {{ form.nickname?.[0] || 'M' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">头像</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前使用昵称首字自动生成 · 暂不支持上传</div>
          </div>
        </div>

        <!-- Nickname -->
        <div>
          <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            用户名 <span class="text-red-400">*</span>
          </label>
          <input v-model="form.nickname" type="text" :maxlength="NICKNAME_MAX" placeholder="给自己起个名字"
            class="w-full h-9 px-3 rounded-md text-[12px] outline-none transition-colors"
            :class="[
              errors.nickname
                ? (isDark ? 'bg-red-400/5 border border-red-400/40 text-wt-sub' : 'bg-red-50/40 border border-red-300 text-lt-sub')
                : (isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/50' : 'bg-l2 border border-bdrF text-lt-sub focus:border-brand-300')
            ]"
            @keydown.enter="save">
          <div class="flex items-center justify-between mt-1">
            <span class="text-[10px]" :class="errors.nickname ? 'text-red-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
              {{ errors.nickname || '支持中英文、数字、下划线、横线' }}
            </span>
            <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ form.nickname.length }}/{{ NICKNAME_MAX }}</span>
          </div>
        </div>

        <!-- Email -->
        <div>
          <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">邮箱</label>
          <input v-model="form.email" type="email" placeholder="email@example.com"
            class="w-full h-9 px-3 rounded-md text-[12px] outline-none transition-colors"
            :class="[
              errors.email
                ? (isDark ? 'bg-red-400/5 border border-red-400/40 text-wt-sub' : 'bg-red-50/40 border border-red-300 text-lt-sub')
                : (isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/50' : 'bg-l2 border border-bdrF text-lt-sub focus:border-brand-300')
            ]"
            @keydown.enter="save">
          <div class="mt-1 text-[10px]" :class="errors.email ? 'text-red-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
            {{ errors.email || '用于接收通知和找回账号' }}
          </div>
        </div>

        <!-- Bio -->
        <div>
          <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">简介</label>
          <textarea v-model="form.bio" :maxlength="BIO_MAX" rows="3" placeholder="一句话介绍自己..."
            class="w-full px-3 py-2 rounded-md text-[12px] outline-none resize-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/50' : 'bg-l2 border border-bdrF text-lt-sub focus:border-brand-300'" />
          <div class="flex justify-end mt-1">
            <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ form.bio.length }}/{{ BIO_MAX }}</span>
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <button @click="close"
          class="h-8 px-3.5 rounded-md text-[11.5px] font-medium transition-colors"
          :class="isDark ? 'bg-d0 text-wt-aux hover:bg-d4 border border-bdr' : 'bg-l2 text-lt-aux hover:bg-l4 border border-bdrF'">
          取消
        </button>
        <button @click="save"
          class="h-8 px-4 rounded-md text-[11.5px] font-semibold text-white transition-all"
          :style="{ background: 'linear-gradient(90deg, var(--brand), #A78BFA)' }">
          <i class="ri-check-line text-[12px] mr-0.5" /> 保存
        </button>
      </template>
    </MsModal>
  </div>
</template>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
