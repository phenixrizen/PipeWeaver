<script setup lang="ts">
const model = defineModel<string>({ required: true });
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4">
      <p class="panel-title">Sample payload</p>
      <p class="mt-1 text-sm text-slate-400">
        Use real-ish payloads to exercise the parser and mapping runtime.
      </p>
    </div>
    <textarea v-model="model" class="input min-h-56 font-mono" />
  </section>
</template>
