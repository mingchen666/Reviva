<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const activeSection = ref('overview')
const contentRef = ref(null)
const agreed = ref(false)

const sections = [
  { key: 'overview', label: '概述' },
  { key: 'collect', label: '信息收集' },
  { key: 'use', label: '信息使用' },
  { key: 'ai-data', label: 'AI 数据处理' },
  { key: 'storage', label: '信息存储' },
  { key: 'share', label: '信息共享' },
  { key: 'rights', label: '您的权利' },
  { key: 'cookies', label: '本地存储' },
  { key: 'children', label: '未成年人保护' },
  { key: 'updates', label: '政策更新' },
]

function scrollTo(key) {
  activeSection.value = key
  const el = document.getElementById('sec-' + key)
  if (el && contentRef.value) {
    contentRef.value.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
  }
}

function onScroll() {
  if (!contentRef.value) return
  const scrollTop = contentRef.value.scrollTop
  for (const s of sections) {
    const el = document.getElementById('sec-' + s.key)
    if (el && el.offsetTop - 32 <= scrollTop) {
      activeSection.value = s.key
    }
  }
}
</script>

<template>
  <div class="flex h-full">
    <!-- Sidebar TOC -->
    <div class="w-52 shrink-0 flex flex-col border-r" :class="isDark ? 'bg-d1 border-bdr' : 'bg-l1 border-bdrL'">
      <div class="h-10 flex items-center gap-2 px-4 shrink-0" :class="isDark ? 'border-b border-bdr' : 'border-b border-bdrL'">
        <i class="ri-lock-line text-[13px] text-emerald-400" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">隐私政策</span>
      </div>
      <nav class="flex-1 overflow-y-auto py-2 px-2">
        <button
          v-for="s in sections"
          :key="s.key"
          class="w-full text-left px-3 py-[6px] rounded-md text-[11px] transition-all relative"
          :class="activeSection === s.key
            ? (isDark ? 'bg-emerald-400/12 text-emerald-400 font-semibold' : 'bg-emerald-50 text-emerald-600 font-semibold')
            : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')"
          @click="scrollTo(s.key)"
        >
          <span v-show="activeSection === s.key" class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-emerald-400" />
          {{ s.label }}
        </button>
      </nav>
      <div class="px-4 py-2" :class="isDark ? 'border-t border-bdr' : 'border-t border-bdrL'">
        <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">生效日期：2026 年 5 月 1 日</span>
      </div>
    </div>

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <div class="h-10 flex items-center justify-between px-6 shrink-0" :class="isDark ? 'border-b border-bdr' : 'border-b border-bdrL'">
        <div class="flex items-center gap-2">
          <i class="ri-shield-keyhole-line text-[14px] text-emerald-400" />
          <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Reviva 隐私政策</span>
        </div>
        <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">版本 1.0</span>
      </div>

      <!-- Scrollable content -->
      <div ref="contentRef" @scroll="onScroll" class="flex-1 overflow-y-auto px-8 py-6 space-y-7">
        <div class="max-w-2xl">
          <p class="text-[11px] leading-relaxed mb-6" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">
            Reviva 非常重视您的隐私保护。本政策旨在帮助您了解我们如何收集、使用、存储和保护您的个人信息。请您仔细阅读本政策。
          </p>

          <!-- 1. 概述 -->
          <section id="sec-overview" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">一、概述</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>1.1 本政策适用于 Reviva 桌面端应用提供的所有服务，包括但不限于知识库管理、AI 辅助学习、智能体对话等功能。</p>
              <p>1.2 我们将按照合法、正当、必要和诚信原则处理您的个人信息，不会收集与服务无关的个人信息。</p>
              <p>1.3 本政策中「个人信息」指以电子方式记录的与已识别或可识别的自然人有关的各种信息，不包括匿名化处理后的信息。</p>
            </div>
          </section>

          <!-- 2. 信息收集 -->
          <section id="sec-collect" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">二、信息收集</h2>

            <div class="space-y-3">
              <div class="rounded-lg p-3" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-1.5 mb-2">
                  <i class="ri-user-line text-[12px] text-brand-400" />
                  <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">您主动提供的信息</span>
                </div>
                <ul class="pl-1 space-y-1 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  <li class="flex items-start gap-2"><span class="text-brand-400 shrink-0">•</span>注册账号时提供的手机号/邮箱、昵称、密码</li>
                  <li class="flex items-start gap-2"><span class="text-brand-400 shrink-0">•</span>上传至知识库的文档、笔记、学习资料</li>
                  <li class="flex items-start gap-2"><span class="text-brand-400 shrink-0">•</span>创建的智能体配置、Skill 设置、对话历史</li>
                  <li class="flex items-start gap-2"><span class="text-brand-400 shrink-0">•</span>个人偏好设置（主题、语言、回答风格等）</li>
                </ul>
              </div>

              <div class="rounded-lg p-3" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-1.5 mb-2">
                  <i class="ri-computer-line text-[12px] text-agent-400" />
                  <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">我们自动收集的信息</span>
                </div>
                <ul class="pl-1 space-y-1 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  <li class="flex items-start gap-2"><span class="text-agent-400 shrink-0">•</span>设备信息：操作系统版本、应用版本、设备标识符</li>
                  <li class="flex items-start gap-2"><span class="text-agent-400 shrink-0">•</span>使用数据：功能使用频次、页面访问记录、操作时长</li>
                  <li class="flex items-start gap-2"><span class="text-agent-400 shrink-0">•</span>性能数据：应用崩溃日志、加载耗时</li>
                </ul>
              </div>

              <div class="rounded-lg p-3" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-1.5 mb-2">
                  <i class="ri-links-line text-[12px] text-amber-400" />
                  <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">第三方来源信息</span>
                </div>
                <ul class="pl-1 space-y-1 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  <li class="flex items-start gap-2"><span class="text-amber-400 shrink-0">•</span>第三方登录（如微信）授权的昵称、头像等公开信息</li>
                  <li class="flex items-start gap-2"><span class="text-amber-400 shrink-0">•</span>AI 服务提供商根据其隐私政策处理的交互数据</li>
                </ul>
              </div>
            </div>
          </section>

          <!-- 3. 信息使用 -->
          <section id="sec-use" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">三、信息使用</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>我们将收集的信息用于以下目的：</p>
              <ul class="pl-4 space-y-1 list-disc" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <li>为您提供知识库管理、AI 学习辅助等核心功能服务</li>
                <li>维护账号安全，包括身份验证、安全审计和欺诈检测</li>
                <li>改进产品功能和用户体验，进行服务优化</li>
                <li>向您发送服务相关的通知（如系统更新、安全提醒）</li>
                <li>遵守法律法规要求和监管义务</li>
                <li>经您另行同意的其他用途</li>
              </ul>
              <p>我们不会将您的个人信息用于本政策未载明的其他目的。如需超出上述范围使用，我们将再次征得您的同意。</p>
            </div>
          </section>

          <!-- 4. AI 数据处理 -->
          <section id="sec-ai-data" class="mb-6">
            <div class="rounded-lg p-3 mb-3" :class="isDark ? 'bg-agent-400/8 border border-agent-400/15' : 'bg-agent-50 border border-agent-100'">
              <div class="flex items-center gap-1.5 mb-1">
                <i class="ri-sparkling-2-line text-[12px] text-agent-400" />
                <span class="text-[11px] font-semibold" :class="isDark ? 'text-agent-400' : 'text-agent-500'">AI 数据处理特别说明</span>
              </div>
              <p class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">Reviva 的 AI 功能涉及对您输入内容的处理，我们对此采取严格的保护措施。</p>
            </div>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>4.1 当您使用 AI 对话、智能体问答等功能时，您输入的文本和引用的文档内容将被发送至 AI 模型服务端进行处理，生成回答后返回给您。</p>
              <p>4.2 我们选择符合数据安全标准的 AI 服务提供商，并签署数据处理协议，要求其不得将您的数据用于模型训练或其他无关目的。</p>
              <p>4.3 对话历史默认存储在您的本地设备上。如您开启云端同步，对话数据将加密传输至我们的服务器。我们不会主动读取您的对话内容。</p>
              <p>4.4 知识库文档在本地进行索引构建。如需使用云端 AI 能力处理文档，我们将明确告知并征得您的同意。</p>
              <p>4.5 您可以在设置中随时清除对话历史和 AI 缓存数据，相关数据删除后不可恢复。</p>
            </div>
          </section>

          <!-- 5. 信息存储 -->
          <section id="sec-storage" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">五、信息存储</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>5.1 您的学习数据（笔记、知识库、智能体配置等）默认存储在本地设备上。开启云端同步后，数据将存储在我们位于中华人民共和国境内的服务器上。</p>
              <p>5.2 我们采用符合行业标准的加密技术（TLS 传输加密、AES-256 存储加密）保护您的数据安全。</p>
              <p>5.3 我们仅留存实现服务目的所必需的最短期限。账号注销后，除法律法规要求保留的信息外，我们将在 30 个工作日内删除您的个人信息。</p>
              <p>5.4 如发生个人信息安全事件，我们将依法及时通知您，包括事件影响范围、可能造成的危害及我们采取的补救措施。</p>
            </div>
          </section>

          <!-- 6. 信息共享 -->
          <section id="sec-share" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">六、信息共享</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>我们不会向第三方出售您的个人信息。仅在以下情形中共享：</p>
              <ul class="pl-4 space-y-1 list-disc" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <li><b>AI 服务提供商</b>：为提供 AI 功能，将您的输入内容发送至合作方的模型接口，数据处理受严格协议约束</li>
                <li><b>云存储服务商</b>：如您开启云端同步，数据将存储在合作的云服务提供商，其受同等安全标准约束</li>
                <li><b>法律要求</b>：根据法律法规、诉讼、政府机关要求，我们可能需要披露您的信息</li>
                <li><b>经您同意</b>：获得您明确同意的其他共享场景</li>
              </ul>
              <p>我们要求所有接收您个人信息的第三方采取至少同等水平的安全保护措施。</p>
            </div>
          </section>

          <!-- 7. 您的权利 -->
          <section id="sec-rights" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">七、您的权利</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>根据相关法律法规，您对个人信息享有以下权利：</p>
              <div class="grid grid-cols-2 gap-2 my-2">
                <div class="rounded-md px-3 py-2" :class="isDark ? 'bg-d3' : 'bg-l3'">
                  <div class="text-[11px] font-semibold mb-0.5" :class="isDark ? 'text-brand-400' : 'text-brand-500'">查阅与复制</div>
                  <div class="text-[10px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">在应用内查看并导出您的个人信息</div>
                </div>
                <div class="rounded-md px-3 py-2" :class="isDark ? 'bg-d3' : 'bg-l3'">
                  <div class="text-[11px] font-semibold mb-0.5" :class="isDark ? 'text-brand-400' : 'text-brand-500'">更正与补充</div>
                  <div class="text-[10px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">修改不准确或不完整的个人信息</div>
                </div>
                <div class="rounded-md px-3 py-2" :class="isDark ? 'bg-d3' : 'bg-l3'">
                  <div class="text-[11px] font-semibold mb-0.5" :class="isDark ? 'text-brand-400' : 'text-brand-500'">删除</div>
                  <div class="text-[10px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">请求删除我们持有的您的个人信息</div>
                </div>
                <div class="rounded-md px-3 py-2" :class="isDark ? 'bg-d3' : 'bg-l3'">
                  <div class="text-[11px] font-semibold mb-0.5" :class="isDark ? 'text-brand-400' : 'text-brand-500'">撤回同意</div>
                  <div class="text-[10px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">撤回之前给予的授权同意</div>
                </div>
              </div>
              <p>您可通过应用内「设置 → 数据与备份」行使上述权利，或通过 our email 联系我们。我们将在 15 个工作日内回复您的请求。</p>
            </div>
          </section>

          <!-- 8. 本地存储 -->
          <section id="sec-cookies" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">八、本地存储</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>8.1 Reviva 作为桌面应用，使用本地存储（如 localStorage、IndexedDB、本地文件系统）保存您的偏好设置、学习数据和缓存内容。</p>
              <p>8.2 本地存储的数据完全由您控制。您可以通过应用内设置清除缓存，或直接删除本地数据目录。</p>
              <p>8.3 我们不使用传统 Web Cookie 追踪技术。应用内数据统计功能（如用量统计）仅记录在本地，不会自动上传。</p>
            </div>
          </section>

          <!-- 9. 未成年人保护 -->
          <section id="sec-children" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">九、未成年人保护</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>9.1 我们高度重视对未成年人个人信息的保护。若您是未满 14 周岁的未成年人，须在监护人的陪同下阅读本政策，并在取得监护人同意后使用我们的服务。</p>
              <p>9.2 如我们在不知情的情况下收集了未成年人的个人信息，将在获悉后及时删除相关信息。</p>
              <p>9.3 Reviva 的 AI 功能面向学习场景，我们不会向未成年人推送广告或商业营销内容。</p>
            </div>
          </section>

          <!-- 10. 政策更新 -->
          <section id="sec-updates" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">十、政策更新</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>10.1 我们可能适时修订本政策。修订后的政策将在应用内发布，并在生效前通过弹窗或应用内通知提醒您。</p>
              <p>10.2 对于重大变更（如信息收集范围扩大、共享对象增加等），我们将再次征得您的明确同意。</p>
              <p>10.3 本政策所指的重大变更包括但不限于：</p>
              <ul class="pl-4 space-y-1 list-disc" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <li>个人信息处理目的、处理方式和处理种类发生变更</li>
                <li>向第三方共享个人信息的对象或方式发生变更</li>
                <li>您参与个人信息处理的权利及其行使方式发生变更</li>
              </ul>
            </div>
          </section>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="shrink-0 px-6 py-3 flex items-center justify-between" :class="isDark ? 'bg-d1 border-t border-bdr' : 'bg-l1 border-t border-bdrL'">
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <div @click="agreed = !agreed" class="checkbox" :class="agreed ? 'checked-emerald' : (isDark ? '' : 'light')" />
          <span class="text-[11px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">我已阅读并同意《隐私政策》</span>
        </label>
        <button
          class="h-8 px-5 rounded-lg text-[12px] font-semibold transition-all"
          :class="agreed
            ? 'bg-emerald-400 text-white hover:bg-emerald-500'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l3 text-lt-aux cursor-not-allowed')"
          :disabled="!agreed"
        >
          同意并继续
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkbox {
  width: 16px; height: 16px; border-radius: 4px; position: relative; cursor: pointer; transition: all .15s;
  border: 1.5px solid #555568; background: transparent;
}
.checkbox.light { border-color: #b0b0ba; }
.checkbox.checked-emerald { background: #34D399; border-color: #34D399; }
.checkbox.checked-emerald::after {
  content: ''; position: absolute; left: 4.5px; top: 1.5px;
  width: 5px; height: 9px; border: solid #fff; border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
</style>