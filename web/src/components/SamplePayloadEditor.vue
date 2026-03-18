<script setup lang="ts">
const model = defineModel<string>({ required: true });
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <p class="panel-title">Sample payload</p>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          Use realistic request payloads to exercise the parser, mapping
          runtime, and the generated HTTP endpoint.
        </p>
      </div>
      <span
        class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
      >
        Raw request body
      </span>
    </div>
    <textarea v-model="model" class="input min-h-56 font-mono text-xs" />
  </section>
</template>
