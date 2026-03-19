<script setup lang="ts">
import { RouterLink } from "vue-router";
import PipeWeaverLogo from "./PipeWeaverLogo.vue";

defineProps<{ currentPipelineTitle?: string }>();
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-white/70 bg-white/85 backdrop-blur-xl"
  >
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="flex h-20 items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-4">
          <div>
            <PipeWeaverLogo compact />
            <p class="mt-2 hidden text-sm text-slate-500 sm:block">
              Build, test, and expose transformation flows from one workspace.
            </p>
          </div>
          <p
            v-if="currentPipelineTitle"
            class="hidden max-w-64 truncate text-sm font-semibold text-slate-700 lg:block"
          >
            {{ currentPipelineTitle }}
          </p>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <RouterLink class="button-secondary hidden sm:inline-flex" to="/">
            Browse pipelines
          </RouterLink>
          <RouterLink class="button-primary" to="/pipelines/new">
            New pipeline
          </RouterLink>
        </div>
      </div>
    </div>
  </header>
</template>
