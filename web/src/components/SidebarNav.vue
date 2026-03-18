<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const props = defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();
const route = useRoute();

const navItems = [
  {
    label: "Pipeline catalog",
    description: "Browse stored flows and examples.",
    to: "/",
  },
  {
    label: "Create pipeline",
    description: "Launch the editor with a draft config.",
    to: "/pipelines/new",
  },
];

const currentPath = computed(() => route.path);
const isActive = (to: string) =>
  to === "/" ? currentPath.value === "/" : currentPath.value.startsWith(to);
</script>

<template>
  <div class="min-w-fit">
    <div
      class="fixed inset-0 z-40 bg-gray-900/30 transition-opacity duration-200 lg:hidden"
      :class="open ? 'opacity-100' : 'pointer-events-none opacity-0'"
      aria-hidden="true"
      @click="$emit('close')"
    />

    <aside
      id="app-sidebar"
      class="absolute left-0 top-0 z-50 flex h-[100dvh] w-72 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white p-4 transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0"
      :class="open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
    >
      <div class="mb-8 flex items-center justify-between gap-3 px-2 pt-2">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-sm"
          >
            <svg
              class="h-5 w-5 fill-current"
              viewBox="0 0 32 32"
              aria-hidden="true"
            >
              <path
                d="M29.2 14.8C28.67 7.63 22.94 1.9 15.77 1.37v5.2a8.23 8.23 0 0 0 8.23 8.23h5.2ZM13.34 24.2v5.2C6.17 28.87.44 23.14-.09 15.97h5.2a8.23 8.23 0 0 1 8.23 8.23Zm10.66-8.23h5.2c-.53 7.17-6.26 12.9-13.43 13.43v-5.2A8.23 8.23 0 0 1 24 15.97ZM-.09 14.8C.44 7.63 6.17 1.9 13.34 1.37v5.2a8.23 8.23 0 0 1-8.23 8.23h-5.2Z"
              />
            </svg>
          </div>
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-[0.28em] text-violet-500"
            >
              PipeWeaver
            </p>
            <p class="text-sm font-semibold text-gray-900">Operations hub</p>
          </div>
        </div>

        <button
          class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-100 lg:hidden"
          type="button"
          @click="$emit('close')"
        >
          <span class="sr-only">Close sidebar</span>
          <svg class="h-4 w-4 fill-current" viewBox="0 0 16 16">
            <path
              d="M12.78 4.28 11.72 3.22 8 6.94 4.28 3.22 3.22 4.28 6.94 8l-3.72 3.72 1.06 1.06L8 9.06l3.72 3.72 1.06-1.06L9.06 8l3.72-3.72Z"
            />
          </svg>
        </button>
      </div>

      <div
        class="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 shadow-sm"
      >
        <p class="text-sm font-semibold text-gray-900">Seed-ready examples</p>
        <p class="mt-1 text-sm text-gray-600">
          Start the API with
          <code class="rounded bg-gray-900 px-1.5 py-0.5 text-[11px] text-white"
            >-seed-examples</code
          >
          to make bundled examples visible in the UI.
        </p>
      </div>

      <div class="mt-8">
        <p
          class="px-3 text-xs font-semibold uppercase tracking-[0.24em] text-gray-400"
        >
          Workspace
        </p>
        <nav class="mt-3 space-y-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="block rounded-2xl border px-3 py-3 transition"
            :class="
              isActive(item.to)
                ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm'
                : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900'
            "
            @click="$emit('close')"
          >
            <p class="text-sm font-semibold">{{ item.label }}</p>
            <p class="mt-1 text-xs leading-5 text-gray-500">
              {{ item.description }}
            </p>
          </RouterLink>
        </nav>
      </div>

      <div
        class="mt-auto rounded-2xl bg-gray-900 px-4 py-4 text-white shadow-sm"
      >
        <p class="text-sm font-semibold">Template notes</p>
        <p class="mt-1 text-sm text-gray-300">
          This layout adapts the Cruip dashboard aesthetic to PipeWeaver’s
          Vue-based editor and pipeline catalog.
        </p>
      </div>
    </aside>
  </div>
</template>
