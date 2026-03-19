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
      class="panel group block p-5 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p
            class="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400"
          >
            {{ pipeline.pipeline.id }}
          </p>
          <h3
            class="mt-2 text-xl font-semibold text-gray-900 transition group-hover:text-sky-600"
          >
            {{ pipeline.pipeline.name }}
          </h3>
          <p class="mt-2 text-sm leading-6 text-gray-600">
            {{ pipeline.pipeline.description || "No description yet." }}
          </p>
        </div>
        <span
          class="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-600"
        >
          Open
        </span>
      </div>

      <div class="mt-5 flex flex-wrap gap-2 text-xs font-medium">
        <span
          class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-600"
        >
          {{ pipeline.source.type }} → {{ pipeline.target.type }}
        </span>
        <span
          class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-600"
        >
          {{ pipeline.source.format }} → {{ pipeline.target.format }}
        </span>
      </div>
    </RouterLink>
  </div>
</template>
