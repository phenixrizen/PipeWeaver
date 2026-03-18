<script setup lang="ts">
import { RouterLink } from "vue-router";
import PipeWeaverLogo from "./PipeWeaverLogo.vue";

defineProps<{ sidebarOpen: boolean }>();
defineEmits<{ toggleSidebar: [] }>();
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-white/70 bg-white/85 backdrop-blur-xl"
  >
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="flex h-20 items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 lg:hidden"
            type="button"
            :aria-expanded="sidebarOpen"
            aria-controls="app-sidebar"
            @click="$emit('toggleSidebar')"
          >
            <span class="sr-only">Toggle navigation</span>
            <svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <rect x="4" y="6" width="16" height="2" rx="1" />
              <rect x="4" y="11" width="16" height="2" rx="1" />
              <rect x="4" y="16" width="16" height="2" rx="1" />
            </svg>
          </button>

          <div>
            <PipeWeaverLogo compact />
            <p class="mt-2 hidden text-sm text-slate-500 sm:block">
              Build, test, and expose transformation flows from one workspace.
            </p>
          </div>
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
