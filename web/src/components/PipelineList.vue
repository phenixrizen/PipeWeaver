<script setup lang="ts">
import type { PipelineDefinition } from "@/types/pipeline";

defineProps<{
  pipelines: PipelineDefinition[];
}>();
</script>

<template>
  <div class="panel overflow-hidden">
    <table class="min-w-full divide-y divide-slate-800 text-sm">
      <thead class="bg-slate-900/80 text-left text-slate-400">
        <tr>
          <th class="px-4 py-3">Name</th>
          <th class="px-4 py-3">Source</th>
          <th class="px-4 py-3">Target</th>
          <th class="px-4 py-3">Mappings</th>
          <th class="px-4 py-3">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800">
        <tr
          v-for="pipeline in pipelines"
          :key="pipeline.id"
          class="hover:bg-slate-900/60"
        >
          <td class="px-4 py-3">
            <p class="font-medium text-white">{{ pipeline.name }}</p>
            <p class="text-xs text-slate-500">{{ pipeline.id }}</p>
          </td>
          <td class="px-4 py-3 text-slate-300">
            {{ pipeline.source.type }} / {{ pipeline.source.format }}
          </td>
          <td class="px-4 py-3 text-slate-300">
            {{ pipeline.target.type }} / {{ pipeline.target.format }}
          </td>
          <td class="px-4 py-3 text-slate-300">
            {{ pipeline.mapping.fields.length }}
          </td>
          <td class="px-4 py-3">
            <RouterLink class="btn-secondary" :to="`/pipelines/${pipeline.id}`"
              >Open</RouterLink
            >
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
