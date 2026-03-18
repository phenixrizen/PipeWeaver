<script setup lang="ts">
import { RouterLink } from "vue-router";

defineProps<{ sidebarOpen: boolean }>();
defineEmits<{ toggleSidebar: [] }>();
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur"
  >
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-100 lg:hidden"
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
            <p
              class="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500"
            >
              PipeWeaver
            </p>
            <div class="flex items-center gap-2">
              <h1 class="text-sm font-semibold text-gray-900 sm:text-base">
                Pipeline operations dashboard
              </h1>
              <span
                class="hidden rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600 sm:inline-flex"
              >
                Cruip-style UI refresh
              </span>
            </div>
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
