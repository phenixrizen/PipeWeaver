<script setup lang="ts">
const model = defineModel<string>({ required: true });

defineProps<{
  title?: string;
}>();
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4">
      <h3 class="text-lg font-semibold text-white">
        {{ title ?? "Sample payload" }}
      </h3>
      <p class="mt-1 text-sm text-slate-400">
        Paste a representative input payload for schema inference and preview
        runs.
      </p>
    </div>
    <textarea
      v-model="model"
      class="input min-h-[240px] font-mono text-xs"
      spellcheck="false"
    />
  </section>
</template>
