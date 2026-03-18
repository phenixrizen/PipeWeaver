<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import PipeWeaverLogo from "./PipeWeaverLogo.vue";

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
      class="fixed inset-0 z-40 bg-slate-950/35 transition-opacity duration-200 lg:hidden"
      :class="open ? 'opacity-100' : 'pointer-events-none opacity-0'"
      aria-hidden="true"
      @click="$emit('close')"
    />

    <aside
      id="app-sidebar"
      class="absolute left-0 top-0 z-50 flex h-[100dvh] w-80 shrink-0 flex-col overflow-y-auto border-r border-white/60 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.12),_transparent_35%),linear-gradient(180deg,_#ffffff,_#f8fafc)] p-5 transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0"
      :class="open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
    >
      <div class="mb-8 flex items-center justify-between gap-3 pt-2">
        <PipeWeaverLogo />

        <button
          class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 lg:hidden"
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
        class="rounded-3xl border border-white/70 bg-white/80 px-5 py-5 shadow-lg shadow-slate-200/50 backdrop-blur"
      >
        <p class="text-sm font-semibold text-slate-900">Live HTTP ingestion</p>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          Configure an HTTP source, enable response mode on the target, and use
          the generated curl command in the editor to test real request/response
          flows.
        </p>
      </div>

      <div class="mt-8">
        <p
          class="px-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400"
        >
          Workspace
        </p>
        <nav class="mt-3 space-y-2">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="block rounded-2xl border px-4 py-3 transition"
            :class="
              isActive(item.to)
                ? 'border-violet-200 bg-violet-50/80 text-violet-700 shadow-sm'
                : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
            "
            @click="$emit('close')"
          >
            <p class="text-sm font-semibold">{{ item.label }}</p>
            <p class="mt-1 text-xs leading-5 text-slate-500">
              {{ item.description }}
            </p>
          </RouterLink>
        </nav>
      </div>

      <div
        class="mt-auto rounded-3xl bg-slate-950 px-5 py-5 text-white shadow-xl shadow-slate-300/30"
      >
        <p class="text-sm font-semibold">Studio notes</p>
        <p class="mt-2 text-sm leading-6 text-slate-300">
          Drag CSV columns into schema targets, let AI suggestions pre-wire the
          obvious matches, then preview or expose the flow as an endpoint.
        </p>
      </div>
    </aside>
  </div>
</template>
