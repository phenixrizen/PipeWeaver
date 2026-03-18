<script setup lang="ts">
import type { ConnectorConfig } from "../types/pipeline";

const model = defineModel<ConnectorConfig>({ required: true });
defineProps<{
  title: string;
  connectorTypes: string[];
  formatOptions: string[];
}>();

// updateConfig converts the free-form JSON editor into a typed connector config object.
const updateConfig = (event: Event) => {
  const value = (event.target as HTMLTextAreaElement).value;
  model.value.config = JSON.parse(value || "{}") as Record<string, unknown>;
};
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <p class="panel-title">{{ title }}</p>
        <p class="mt-1 text-sm text-slate-400">
          Configure connector type, payload format, and JSON config.
        </p>
      </div>
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <label class="space-y-2 text-sm text-slate-300">
        <span>Connector type</span>
        <select v-model="model.type" class="input">
          <option
            v-for="option in connectorTypes"
            :key="option"
            :value="option"
          >
            {{ option }}
          </option>
        </select>
      </label>
      <label class="space-y-2 text-sm text-slate-300">
        <span>Format</span>
        <select v-model="model.format" class="input">
          <option v-for="option in formatOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>
    </div>
    <label class="mt-4 block space-y-2 text-sm text-slate-300">
      <span>Config JSON</span>
      <textarea
        class="input min-h-32 font-mono"
        :value="JSON.stringify(model.config, null, 2)"
        @change="updateConfig"
      />
    </label>
  </section>
</template>
