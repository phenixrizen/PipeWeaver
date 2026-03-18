<script setup lang="ts">
import type { PipelineDefinition } from "../types/pipeline";

defineProps<{ pipelines: PipelineDefinition[] }>();
</script>

<template>
  <div class="grid gap-4 xl:grid-cols-2">
    <RouterLink
      v-for="pipeline in pipelines"
      :key="pipeline.pipeline.id"
      :to="`/pipelines/${pipeline.pipeline.id}`"
      class="panel block p-5 transition hover:-translate-y-0.5 hover:border-cyan-400/40"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-white">
            {{ pipeline.pipeline.name }}
          </h3>
          <p class="mt-2 text-sm text-slate-400">
            {{ pipeline.pipeline.description || "No description yet." }}
          </p>
        </div>
        <span
          class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300"
          >{{ pipeline.pipeline.id }}</span
        >
      </div>
      <div class="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
        <span class="rounded-full bg-slate-800 px-3 py-1"
          >{{ pipeline.source.type }} → {{ pipeline.target.type }}</span
        >
        <span class="rounded-full bg-slate-800 px-3 py-1"
          >{{ pipeline.source.format }} → {{ pipeline.target.format }}</span
        >
      </div>
    </RouterLink>
  </div>
</template>
