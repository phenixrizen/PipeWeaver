<script setup lang="ts">
import FormatSelector from "@/components/FormatSelector.vue";
import type { ConnectorConfig } from "@/types/pipeline";

const connector = defineModel<ConnectorConfig>({ required: true });

defineProps<{
  title: string;
  connectorTypes: string[];
}>();
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
      <span
        class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400"
        >Connector</span
      >
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <label>
        <span class="label">Type</span>
        <select v-model="connector.type" class="input">
          <option
            v-for="option in connectorTypes"
            :key="option"
            :value="option"
          >
            {{ option }}
          </option>
        </select>
      </label>
      <FormatSelector v-model="connector.format" label="Format" />
      <label class="md:col-span-2">
        <span class="label">Path / endpoint hint</span>
        <input
          v-model="connector.config.path"
          class="input"
          placeholder="examples/output.json or future endpoint"
        />
      </label>
    </div>
  </section>
</template>
