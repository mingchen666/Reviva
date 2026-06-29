<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const activeSection = ref('acceptance')
const contentRef = ref(null)
const agreed = ref(false)

const sections = [
  { key: 'acceptance', label: '接受条款' },
  { key: 'account', label: '账号与安全' },
  { key: 'usage', label: '使用规范' },
  { key: 'ai', label: 'AI 服务条款' },
  { key: 'content', label: '内容与知识产权' },
  { key: 'payment', label: '付费与订阅' },
  { key: 'disclaimer', label: '免责声明' },
  { key: 'termination', label: '服务终止' },
  { key: 'changes', label: '条款变更' },
  { key: 'governing', label: '适用法律' },
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
        <i class="ri-file-list-3-line text-[13px] text-brand-400" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">用户协议</span>
      </div>
      <nav class="flex-1 overflow-y-auto py-2 px-2">
        <button
          v-for="s in sections"
          :key="s.key"
          class="w-full text-left px-3 py-[6px] rounded-md text-[11px] transition-all relative"
          :class="activeSection === s.key
            ? (isDark ? 'bg-brand-400/12 text-brand-400 font-semibold' : 'bg-brand-50 text-brand-500 font-semibold')
            : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')"
          @click="scrollTo(s.key)"
        >
          <span v-show="activeSection === s.key" class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-brand-400" />
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
          <i class="ri-shield-check-line text-[14px] text-brand-400" />
          <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Reviva 用户协议</span>
        </div>
        <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">版本 1.0</span>
      </div>

      <!-- Scrollable content -->
      <div ref="contentRef" @scroll="onScroll" class="flex-1 overflow-y-auto px-8 py-6 space-y-7">
        <div class="max-w-2xl">
          <p class="text-[11px] leading-relaxed mb-6" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">
            欢迎使用 Reviva。请您在使用本应用之前，仔细阅读并充分理解以下条款。您登录、下载或使用 Reviva 即表示您已阅读、理解并同意接受本协议的全部内容。
          </p>

          <!-- 1. 接受条款 -->
          <section id="sec-acceptance" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">一、接受条款</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>1.1 本协议是您与 Reviva（以下简称「我们」）之间关于使用 Reviva 桌面端应用及相关服务所订立的协议。</p>
              <p>1.2 本协议内容包括协议正文及所有我们已经发布的或将来可能发布的各类规则。所有规则为本协议不可分割的一部分，与协议正文具有同等法律效力。</p>
              <p>1.3 您通过网络页面点击确认、实际使用 Reviva 服务等方式，即表示您已充分阅读、理解并接受本协议的全部内容。如果您不同意本协议的任何内容，请立即停止使用我们的服务。</p>
            </div>
          </section>

          <!-- 2. 账号与安全 -->
          <section id="sec-account" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">二、账号与安全</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>2.1 您需注册账号方可使用 Reviva 的完整功能。注册时须提供真实、准确、完整的个人信息，并在信息变更时及时更新。</p>
              <p>2.2 您的账号仅限本人使用，不得以任何方式转让、出借、出售给第三方。您应对账号下发生的所有活动承担法律责任。</p>
              <p>2.3 如发现账号被非法使用，您应立即通知我们。我们不对因您保管不善导致的账号损失承担责任。</p>
              <p>2.4 我们有权依据法律法规要求对您进行实名认证。如未能通过认证，我们有权限制或终止向您提供部分或全部服务。</p>
            </div>
          </section>

          <!-- 3. 使用规范 -->
          <section id="sec-usage" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">三、使用规范</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>3.1 您承诺依法合规使用 Reviva，不得利用本服务从事任何违反中华人民共和国法律法规的活动。</p>
              <p>3.2 您不得实施以下行为：</p>
              <ul class="pl-4 space-y-1 list-disc" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <li>发布、传播含有违法违规信息的内容</li>
                <li>侵犯他人知识产权、隐私权等合法权益</li>
                <li>利用自动化手段批量抓取、爬取平台数据</li>
                <li>对服务系统进行反向工程、反编译或反汇编</li>
                <li>干扰或破坏服务的正常运行</li>
                <li>将服务用于商业竞争或向第三方提供类似服务</li>
              </ul>
              <p>3.3 您理解并同意，我们有权对违规行为采取警告、限制功能、暂停服务、注销账号等措施，并有权保存相关记录向有关部门报告。</p>
            </div>
          </section>

          <!-- 4. AI 服务条款 -->
          <section id="sec-ai" class="mb-6">
            <div class="rounded-lg p-3 mb-3" :class="isDark ? 'bg-agent-400/8 border border-agent-400/15' : 'bg-agent-50 border border-agent-100'">
              <div class="flex items-center gap-1.5 mb-1">
                <i class="ri-sparkling-2-line text-[12px] text-agent-400" />
                <span class="text-[11px] font-semibold" :class="isDark ? 'text-agent-400' : 'text-agent-500'">AI 服务特别说明</span>
              </div>
              <p class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">Reviva 的 AI 功能（包括但不限于智能体、Skill、对话生成）基于大型语言模型提供，以下条款专门适用于这些功能。</p>
            </div>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>4.1 AI 生成的内容（包括文本、摘要、测验题目等）仅供参考和学习辅助之用，不构成专业建议。我们不保证 AI 输出的准确性、完整性或时效性。</p>
              <p>4.2 您应对 AI 生成内容进行独立判断和验证，不得将 AI 输出直接用于考试作答、学术论文提交等需要原创性的场景。</p>
              <p>4.3 您输入的内容将被发送至 AI 服务提供商进行处理。请勿输入涉及国家秘密、商业机密或个人敏感信息的内容。</p>
              <p>4.4 AI 服务可能因模型更新、服务维护等原因发生功能变化，我们将尽可能提前通知，但不对服务中断造成的损失承担责任。</p>
              <p>4.5 您对使用 AI 功能生成的成果享有合理使用权，但不得声称 AI 生成内容为完全原创作品。</p>
            </div>
          </section>

          <!-- 5. 内容与知识产权 -->
          <section id="sec-content" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">五、内容与知识产权</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>5.1 Reviva 应用软件的著作权、商标权、专利权等知识产权均归我们所有。</p>
              <p>5.2 您在 Reviva 中创建的学习笔记、知识卡片、自定义智能体配置等用户内容，其知识产权归您所有。您授予我们非独占的、可撤销的许可，以便我们为您提供存储、同步和展示服务。</p>
              <p>5.3 您上传至知识库的文档资料，您保证拥有合法权利或已获得合法授权。如因您上传的内容引发知识产权纠纷，由您自行承担责任。</p>
              <p>5.4 我们尊重他人知识产权。如您认为 Reviva 上的内容侵犯了您的权利，请通过应用内反馈渠道联系我们，我们将依法处理。</p>
            </div>
          </section>

          <!-- 6. 付费与订阅 -->
          <section id="sec-payment" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">六、付费与订阅</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>6.1 Reviva 提供免费版和付费订阅版（Pro）。付费服务的价格、功能范围以购买页面展示为准。</p>
              <p>6.2 付费订阅采用自动续费模式。我们将在订阅到期前通过应用内通知提醒您，您可随时在设置中关闭自动续费。</p>
              <p>6.3 因您主动注销账号或因违规被终止服务的，已支付的订阅费用不予退还。</p>
              <p>6.4 我们保留调整付费服务价格的权利。价格调整将提前 30 天通知，调整后新价格在下一个计费周期生效。</p>
            </div>
          </section>

          <!-- 7. 免责声明 -->
          <section id="sec-disclaimer" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">七、免责声明</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>7.1 本服务按「现状」和「可获得性」基础提供。我们在法律允许的最大范围内，不对服务作任何明示或暗示的保证。</p>
              <p>7.2 对于因不可抗力、网络故障、系统维护、第三方服务中断等原因导致的服务中断或数据损失，我们不承担责任，但将尽合理努力减少损失。</p>
              <p>7.3 您理解并同意，使用本服务可能存在一定风险。您应自行承担使用服务所产生的风险和责任。</p>
            </div>
          </section>

          <!-- 8. 服务终止 -->
          <section id="sec-termination" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">八、服务终止</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>8.1 您有权随时注销您的账号并停止使用服务。账号注销后，我们将在法律法规允许的范围内删除您的个人信息。</p>
              <p>8.2 在您严重违反本协议的情况下，我们有权暂停或终止向您提供服务，并有权追究相关法律责任。</p>
              <p>8.3 如我们决定终止提供全部服务，将提前 60 天通知您，并给予合理时间供您导出数据。</p>
            </div>
          </section>

          <!-- 9. 条款变更 -->
          <section id="sec-changes" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">九、条款变更</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>9.1 我们有权根据法律法规变化、业务发展需要等原因修改本协议条款。</p>
              <p>9.2 修改后的协议将在应用内公示。如您在协议修改后继续使用服务，即视为接受修改后的协议。</p>
              <p>9.3 如您不同意修改后的内容，有权停止使用服务并注销账号。我们将在修改前通过应用内通知、弹窗等方式告知您重大变更。</p>
            </div>
          </section>

          <!-- 10. 适用法律 -->
          <section id="sec-governing" class="mb-6">
            <h2 class="text-[13px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">十、适用法律与争议解决</h2>
            <div class="space-y-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <p>10.1 本协议的订立、执行和解释均适用中华人民共和国法律。</p>
              <p>10.2 因本协议产生的争议，双方应首先友好协商解决；协商不成的，任何一方均有权向我们所在地有管辖权的人民法院提起诉讼。</p>
              <p>10.3 本协议中任何条款被认定为无效或不可执行的，不影响其他条款的效力。</p>
            </div>
          </section>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="shrink-0 px-6 py-3 flex items-center justify-between" :class="isDark ? 'bg-d1 border-t border-bdr' : 'bg-l1 border-t border-bdrL'">
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <div @click="agreed = !agreed" class="checkbox" :class="agreed ? 'checked' : (isDark ? '' : 'light')" />
          <span class="text-[11px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">我已阅读并同意《用户协议》</span>
        </label>
        <button
          class="h-8 px-5 rounded-lg text-[12px] font-semibold transition-all"
          :class="agreed
            ? 'bg-brand-400 text-white hover:bg-brand-500'
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
.checkbox.checked { background: #6C8AFF; border-color: #6C8AFF; }
.checkbox.checked::after {
  content: ''; position: absolute; left: 4.5px; top: 1.5px;
  width: 5px; height: 9px; border: solid #fff; border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
</style>