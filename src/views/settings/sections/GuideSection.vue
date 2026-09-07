<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useSettingsStore } from '@/stores/settings';
import { parseModelRef } from '@/utils/modelRef';

const router = useRouter();
const appStore = useAppStore();
const settingsStore = useSettingsStore();
const isDark = computed(() => appStore.isDark);

function go(path) {
  if (!path) return;
  router.push(path);
}

function providerReady(provider) {
  if (!provider?.enabled) return false;
  if (!settingsStore.providerConfigured(provider)) return false;
  return (provider.models || []).some((m) => m.enabled && m.tier !== 'embedding');
}

function findModel(ref) {
  const parsed = parseModelRef(ref);
  if (!parsed.modelId) return null;
  if (parsed.scoped) {
    const p = settingsStore.providers.find((x) => x.id === parsed.providerId);
    const m = p?.models?.find((x) => x.id === parsed.modelId);
    return p && m ? { provider: p, model: m } : null;
  }
  for (const p of settingsStore.providers) {
    const m = p.models?.find((x) => x.id === parsed.modelId);
    if (m) return { provider: p, model: m };
  }
  return null;
}

const defaultModelKeys = [
  { key: 'chat', label: '对话' },
  { key: 'title', label: '标题' },
  { key: 'translation', label: '翻译' },
];

const readyProviders = computed(() => settingsStore.providers.filter(providerReady));
const modelServiceReady = computed(() => readyProviders.value.length > 0);
const defaultModelsReady = computed(() =>
  defaultModelKeys.every(({ key }) => {
    const match = findModel(settingsStore.defaultModels[key]);
    return !!match && providerReady(match.provider) && match.model.enabled && match.model.tier !== 'embedding';
  }),
);

const workspaceReady = computed(() => settingsStore.isWorkspaceReady);
const progress = computed(() =>
  [workspaceReady.value, modelServiceReady.value, defaultModelsReady.value].filter(Boolean).length,
);
const allDone = computed(() => progress.value === 3);

const steps = computed(() => [
  {
    key: 'workspace',
    num: '1',
    title: '设置授权根目录',
    color: 'emerald',
    icon: 'ri-folder-shield-line',
    ready: workspaceReady.value,
    status: workspaceReady.value ? '已完成' : '未设置',
    path: '/settings/directory',
    summary: '指定一个文件夹作为工作区，用于保存文档、笔记和 Agent 产出，也是 Agent 读写文件的安全边界。',
    detail: '根目录一旦设置，Agent 的文件操作都会限制在该目录内，避免误触系统其他位置。后续导入资料、生成内容也默认存放在这里。',
    tip: '新建一个专用文件夹（如 D:\\Reviva）专门放学习资料和产出，方便管理和备份。',
  },
  {
    key: 'models',
    num: '2',
    title: '配置模型服务',
    color: 'brand',
    icon: 'ri-ai-generate-3d-line',
    ready: modelServiceReady.value,
    status: modelServiceReady.value ? '已可用' : '待配置',
    path: '/settings/models',
    summary: '为 Reviva 接入大语言模型，可以填自己的 API Key，或使用官方云端模型按积分付费。',
    detail: '添加服务商（如 OpenAI 兼容接口、官方云端、本地模型），填入 API Key 与 Base URL，勾选要启用的模型。每个模型可单独启用，未勾选的不会出现在选择列表里。',
    tip: '不确定用哪个模型？先启用一个对话模型即可，后续随时调整。embedding 模型仅在知识库检索时需要。',
  },
  {
    key: 'defaults',
    num: '3',
    title: '确认默认模型',
    color: 'sky',
    icon: 'ri-cpu-line',
    ready: defaultModelsReady.value,
    status: defaultModelsReady.value ? '已确认' : '建议检查',
    path: '/settings/default-models',
    summary: '为对话、标题生成、翻译分别指定默认模型，开始新对话时无需每次手动选择。',
    detail: '从已启用的模型里挑选对话主模型；标题和翻译模型可以用较便宜的小模型以节省消耗。某项留空时对应功能会用对话模型兜底。',
    tip: '对话模型选能力强的，标题/翻译选小而快的，能显著降低成本。',
  },
  {
    key: 'agents',
    num: '4',
    title: '了解与使用 Agent',
    color: 'violet',
    icon: 'ri-sparkling-2-line',
    ready: true,
    status: '可开始',
    path: '/agents',
    summary: 'Agent 是 Reviva 的核心，负责理解资料、调用工具、遵循权限，把结果变成可复用的学习产出。',
    detail: '内置 Agent（课程助教、复习教练、文档助手等）配好模型后即可直接对话。需要更贴合自己流程时，可在 Agent 页面编辑提示词、工具权限、模型和执行限制，或创建全新的自定义 Agent。',
    tip: '新手阶段先用内置 Agent 体验完整流程，熟悉后再做个性化调整。',
  },
]);

const faqs = [
  {
    q: '对话无响应或报错',
    a: '先到「模型服务」确认服务商已启用、API Key 有效、模型已勾选。再去【默认模型【页面配置好默认对话模型。若用国外模型，检查网络代理是否配置正确；模型上下文超长也会报错，尝试缩短资料或换用长上下文模型。',
    path: '/settings/models',
    icon: 'ai-generate-3d-line',
  },
  {
    q: '文档导入失败或解析乱码',
    a: '确认文件在授权根目录内、格式受支持（PDF/DOCX/MD/TXT 等）。扫描版 PDF 需先配置 OCR；体积过大的文件建议拆分后再导入。乱码通常是编码问题，另存为 UTF-8 后重试。',
    path: '/docs-manage',
    icon: 'ri-file-damage-line',
  },
  {
    q: 'Agent 不调用工具或命令被拦截',
    a: '检查「沙箱与权限」是否放行了对应工具，以及该 Agent 是否启用了相关工具。文件写入、命令执行受授权根目录和安全沙箱限制，超出范围会被拦截并提示原因。',
    path: '/settings/sandbox',
    icon: 'ri-tools-line',
  },
  {
    q: '知识库检索不到内容',
    a: 'Wiki 知识库需要配置 embedding 模型并完成索引后才能检索。确认 embedding 模型已启用、资料已解析入库；若刚导入，等待索引完成后再提问。',
    path: '/settings/models',
    icon: 'ri-search-line',
  },
  {
    q: '模型连接超时或失败',
    a: '多数是网络问题。国内直连国外 API 容易超时，建议配置代理；自建本地模型则确认服务已启动且 Base URL 指向正确端口。可在模型服务页点测试连接排查。',
    path: '/settings/models',
    icon: 'ri-wifi-off-line',
  },
  {
    q: '自动更新失败',
    a: '自动更新走系统通道，网络不可达时会失败。可在更新弹窗里用备用下载入口（夸克网盘）手动下载安装包覆盖安装，数据不会丢失。',
    path: '/settings/about',
    icon: 'ri-refresh-line',
  },
];

function toneClass(tone) {
  const dark = {
    brand: 'bg-brand-400/10 text-brand-400 border-brand-400/20',
    emerald: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    sky: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
    violet: 'bg-violet-400/10 text-violet-400 border-violet-400/20',
    amber: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    rose: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
  };
  const light = {
    brand: 'bg-brand-50 text-brand-600 border-brand-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };
  return (isDark.value ? dark : light)[tone] || dark.brand;
}

function toneText(tone) {
  const dark = { brand: 'text-brand-400', emerald: 'text-emerald-400', sky: 'text-sky-400', violet: 'text-violet-400', amber: 'text-amber-400', rose: 'text-rose-400' };
  const light = { brand: 'text-brand-600', emerald: 'text-emerald-600', sky: 'text-sky-600', violet: 'text-violet-600', amber: 'text-amber-600', rose: 'text-rose-600' };
  return (isDark.value ? dark : light)[tone] || dark.brand;
}

function stepBorder(color) {
  const dark = { brand: 'border-l-brand-400', emerald: 'border-l-emerald-400', sky: 'border-l-sky-400', violet: 'border-l-violet-400' };
  const light = { brand: 'border-l-brand-500', emerald: 'border-l-emerald-500', sky: 'border-l-sky-500', violet: 'border-l-violet-500' };
  return (isDark.value ? dark : light)[color] || dark.brand;
}

function stepIconBg(tone) {
  const dark = { brand: 'bg-brand-400/12 text-brand-400', emerald: 'bg-emerald-400/12 text-emerald-400', sky: 'bg-sky-400/12 text-sky-400', violet: 'bg-violet-400/12 text-violet-400' };
  const light = { brand: 'bg-brand-50 text-brand-600', emerald: 'bg-emerald-50 text-emerald-600', sky: 'bg-sky-50 text-sky-600', violet: 'bg-violet-50 text-violet-600' };
  return (isDark.value ? dark : light)[tone] || dark.brand;
}

function btnClass(step) {
  if (step.ready) {
    return isDark.value
      ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30'
      : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-200';
  }
  return isDark.value
    ? 'bg-brand-400/12 text-brand-300 hover:bg-brand-400/18'
    : 'bg-brand-50 text-brand-600 hover:bg-brand-100';
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- Hero -->
    <div class="rounded-xl p-5 relative overflow-hidden" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-400 via-sky-400 to-emerald-400" />
      <div class="flex items-start gap-4 pt-1">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" :class="stepIconBg('brand')">
          <i class="ri-compass-3-line text-[26px]" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-[21px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">新手教程</h2>
          <p class="text-[12px] leading-relaxed mt-2 max-w-3xl" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            按顺序完成基础配置，之后对话、资料和 Agent 就能稳定工作。每步都会检测当前状态，已完成会标记，未完成可直接跳转去设置。
          </p>
        </div>
      </div>
    </div>

    <!-- 进度总览 -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" :class="allDone ? toneClass('emerald') : (isDark ? 'bg-d0' : 'bg-l2')">
          <i :class="allDone ? 'ri-checkbox-circle-fill' : 'ri-list-check-2'" class="text-[18px]" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基础准备 {{ progress }}/3</span>
            <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ allDone ? '全部就绪，可以开始对话了' : '根目录必须设置，其余可稍后完善' }}</span>
          </div>
          <div class="h-1.5 rounded-full mt-2 overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
            <div class="h-full rounded-full transition-all duration-500" :class="allDone ? 'bg-emerald-400' : 'bg-brand-400'" :style="{ width: (progress / 3) * 100 + '%' }" />
          </div>
        </div>
      </div>
    </div>

    <!-- 配置步骤 -->
    <div>
      <div class="flex items-center gap-2 mb-3 px-1">
        <i class="ri-settings-4-line text-brand-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">快速配置</span>
      </div>
      <div class="space-y-3">
        <div v-for="step in steps" :key="step.key" class="rounded-xl p-4 border-l-[3px]" :class="[stepBorder(step.color), isDark ? 'border-y border-r border-bdr' : 'border-y border-r border-bdrF']">
          <div class="flex items-start gap-3.5">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" :class="stepIconBg(step.color)">
              <i :class="[step.icon, 'text-[18px]']" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap mb-1.5">
                <span class="text-[11px] font-mono font-bold" :class="toneText(step.color)">{{ step.num }}</span>
                <h3 class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ step.title }}</h3>
                <span class="ctx-pill border" :class="step.ready ? toneClass('emerald') : toneClass(step.color)">
                  <i :class="[step.ready ? 'ri-check-line' : 'ri-time-line', 'text-[8px]']" />
                  {{ step.status }}
                </span>
              </div>
              <p class="text-[12px] leading-relaxed mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ step.summary }}</p>
              <p class="text-[11px] leading-relaxed mb-2.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ step.detail }}</p>
              <div class="rounded-lg px-2.5 py-2 flex items-start gap-2 mb-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <i class="ri-lightbulb-line text-amber-400 text-[12px] mt-[1px] shrink-0" />
                <span class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ step.tip }}</span>
              </div>
              <button class="h-8 px-3.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors" :class="btnClass(step)" @click="go(step.path)">
                <i :class="[step.ready ? 'ri-eye-line' : 'ri-arrow-right-line', 'text-[11px]']" />
                {{ step.ready ? '查看设置' : '去设置' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 常见问题 -->
    <div>
      <div class="flex items-center gap-2 mb-3 px-1">
        <i class="ri-question-line text-amber-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">常见问题</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div v-for="faq in faqs" :key="faq.q" class="rounded-xl p-3.5 cursor-pointer transition-colors" :class="isDark ? 'bg-d3 border border-bdr hover:border-amber-400/30' : 'bg-l3 border border-bdrF hover:border-amber-200'" @click="go(faq.path)">
          <div class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="toneClass('amber')">
              <i :class="[faq.icon, 'text-[14px]']" />
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-[12px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ faq.q }}</h4>
              <p class="text-[10.5px] leading-relaxed mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ faq.a }}</p>
              <span class="text-[10px] inline-flex items-center gap-1" :class="isDark ? 'text-brand-400' : 'text-brand-600'">
                <i class="ri-arrow-right-line text-[10px]" />去排查
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部反馈 -->
    <div class="rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="toneClass('brand')">
          <i class="ri-customer-service-2-line text-[15px]" />
        </div>
        <div class="min-w-0">
          <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">还有问题？</div>
          <div class="text-[10.5px] leading-snug" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">在「系统版本」页提交反馈，或加入用户交流群一起探讨</div>
        </div>
      </div>
      <button class="h-8 px-3.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors shrink-0" :class="isDark ? 'bg-brand-400/12 text-brand-300 hover:bg-brand-400/18' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'" @click="go('/settings/about')">
        <i class="ri-arrow-right-line text-[11px]" />
        前往反馈
      </button>
    </div>
  </div>
</template>
