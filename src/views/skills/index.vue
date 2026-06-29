<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAgentsStore } from '@/stores/agents';
import LeftPanel from '@/components/layout/LeftPanel.vue';
import MainContent from '@/components/layout/MainContent.vue';
import SkillDetail from './sections/SkillDetail.vue';
import SkillMarket from './sections/SkillMarket.vue';

const appStore = useAppStore();
const agentsStore = useAgentsStore();
const isDark = computed(() => appStore.isDark);

const selectedSkill = ref(null);
const activeTab = ref('builtin');
const marketCat = ref('全部');

function startEditSkill() {
  // Custom Skill editing is not exposed yet.
}

async function deleteSkill() {
  // Custom Skill deletion is not exposed yet.
}
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <LeftPanel :width="260" :resizable="false">
      <!-- Module Header with Tabs -->
      <div
        class="h-10 flex items-center px-4 shrink-0 gap-3"
        :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'"
      >
        <button
          @click="
            activeTab = 'builtin';
            selectedSkill = null;
          "
          class="text-[13px] font-semibold transition-colors flex items-center gap-1"
          :class="
            activeTab === 'builtin'
              ? isDark
                ? 'text-wt-main'
                : 'text-lt-main'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          "
        >
          <i class="ri-shield-star-line text-[12px]" />内置 Skills
        </button>
        <button
          @click="
            activeTab = 'mine';
            selectedSkill = null;
          "
          class="text-[13px] font-semibold transition-colors"
          :class="
            activeTab === 'mine'
              ? isDark
                ? 'text-wt-main'
                : 'text-lt-main'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          "
        >
          自定义 Skills
          <span
            class="text-[9px] px-1.5 py-[1px] rounded-full"
            :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'"
          >
            即将支持
          </span>
        </button>
      </div>

      <!-- Built-in sidebar info -->
      <div v-if="activeTab === 'builtin'" class="flex-1 overflow-y-auto px-3 py-3">
        <div
          class="rounded-xl p-4"
          :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
        >
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-shield-star-line text-brand-400 text-[14px]" /><span
              class="section-title"
              :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
              >内置 Skills</span
            >
          </div>
          <p
            class="text-[11px] leading-relaxed mb-3"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
          >
            应用预置的能力包，跟随版本更新，全部默认启用，可直接在 Agent 配置中绑定使用。
          </p>
          <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            {{ agentsStore.platformSkills.length }} 个已内置
          </div>
        </div>
      </div>

      <!-- Custom Skills coming soon -->
      <div v-if="activeTab === 'mine'" class="flex-1 overflow-y-auto px-3 py-3">
        <div
          class="rounded-xl p-4"
          :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
        >
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-tools-line text-brand-400 text-[14px]" />
            <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              自定义 Skills
            </span>
          </div>
          <p
            class="text-[11px] leading-relaxed"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
          >
            自建、导入和 AI 生成 Skill 暂未开放，后续版本会支持。当前请优先使用内置 Skills。
          </p>
        </div>
      </div>

    </LeftPanel>

    <!-- Main Content -->
    <MainContent padding="p-0">
      <!-- Built-in Tab -->
      <SkillMarket
        v-if="activeTab === 'builtin'"
        :is-dark="isDark"
        v-model:active-cat="marketCat"
      />

      <!-- My Skills Tab -->
      <template v-else>
        <!-- Empty State -->
        <div v-if="!selectedSkill" class="flex-1 flex flex-col overflow-hidden">
          <div
            class="h-10 flex items-center px-5 shrink-0"
            :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'"
          >
            <div class="flex items-center gap-2">
              <i
                class="ri-flashlight-line text-[14px]"
                :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
              />
              <span
                class="text-[13px] font-semibold"
                :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                >Skills · 总览</span
              >
            </div>
          </div>
          <div class="flex-1 overflow-y-auto">
            <div class="max-w-5xl mx-auto px-8 py-10 fade-up">
              <div class="flex items-start gap-4 mb-8">
                <div
                  class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  :class="
                    isDark
                      ? 'bg-gradient-to-br from-brand-400/20 to-agent-400/10 border border-brand-400/20'
                      : 'bg-gradient-to-br from-brand-50 to-agent-50 border border-brand-100'
                  "
                >
                  <i class="ri-flashlight-line text-[26px] text-brand-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <h1
                    class="text-[20px] font-bold mb-1"
                    :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                  >
                    Agent Skills 能力增强
                  </h1>
                  <p
                    class="text-[13px] leading-relaxed"
                    :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
                  >
                    Skills 是 Agent 的能力增强模块，通过 prompt 驱动专项能力包来增强 Agent
                    行为。当前优先开放内置 Skills；自定义、导入和 AI 生成能力即将支持。
                  </p>
                </div>
              </div>

              <!-- Stats -->
              <div class="grid grid-cols-3 gap-3 mb-8">
                <div
                  class="stat-tile rounded-xl p-3.5"
                  :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
                >
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <i class="ri-flashlight-line text-brand-400 text-[12px]" /><span
                      class="text-[10px] font-medium"
                      :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
                      >可用总数</span
                    >
                  </div>
                  <div
                    class="text-[22px] font-bold leading-none"
                    :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                  >
                    {{ agentsStore.skillList.length }}
                  </div>
                  <div class="text-[10px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    自定义即将支持
                  </div>
                </div>
                <div
                  class="stat-tile rounded-xl p-3.5"
                  :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
                >
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <i class="ri-sparkling-2-line text-agent-400 text-[12px]" /><span
                      class="text-[10px] font-medium"
                      :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
                      >被 Agent 绑定</span
                    >
                  </div>
                  <div
                    class="text-[22px] font-bold leading-none"
                    :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                  >
                    {{ agentsStore.totalSkillUses }}
                  </div>
                  <div class="text-[10px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    次引用
                  </div>
                </div>
                <div
                  class="stat-tile rounded-xl p-3.5"
                  :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
                >
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <i class="ri-shield-star-line text-emerald-400 text-[12px]" /><span
                      class="text-[10px] font-medium"
                      :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
                      >内置 Skill</span
                    >
                  </div>
                  <div
                    class="text-[22px] font-bold leading-none"
                    :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                  >
                    {{ agentsStore.platformSkills.length }}
                  </div>
                  <div class="text-[10px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    默认启用
                  </div>
                </div>
              </div>

              <!-- Calling methods -->
              <div
                class="rounded-xl p-4"
                :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
              >
                <div class="section-title mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                  工作机制
                </div>
                <div class="space-y-2">
                  <div
                    class="flex items-center gap-2.5 text-[12px]"
                    :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
                  >
                    <i class="ri-sparkling-2-line text-agent-400 text-[14px]" /><span
                      >Agent 绑定 Skill 后，按需自动调用（渐进式披露）</span
                    >
                  </div>
                  <div
                    class="flex items-center gap-2.5 text-[12px]"
                    :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
                  >
                    <i class="ri-shield-star-line text-brand-400 text-[14px]" /><span
                      >内置 Skills 跟随应用默认启用，无需手动开启</span
                    >
                  </div>
                  <div
                    class="flex items-center gap-2.5 text-[12px]"
                    :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
                  >
                    <i class="ri-flashlight-line text-emerald-400 text-[14px]" /><span
                      >自定义、AI 生成和导入能力即将支持</span
                    >
                  </div>
                </div>
              </div>

              <div
                class="mt-6 text-center text-[11px]"
                :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
              >
                <i class="ri-arrow-left-line text-[12px] mr-1" />切换到"内置 Skills"查看应用预置能力
              </div>
            </div>
          </div>
        </div>

        <!-- Skill Detail -->
        <SkillDetail
          v-else
          :key="selectedSkill.id"
          :skill="selectedSkill"
          :is-dark="isDark"
          @edit="startEditSkill"
          @delete="deleteSkill"
        />
      </template>
    </MainContent>

  </div>
</template>
