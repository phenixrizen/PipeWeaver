<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConnectorConfig } from "../types/pipeline";

const model = defineModel<ConnectorConfig>({ required: true });
const props = defineProps<{
  title: string;
  connectorTypes: string[];
  formatOptions: string[];
}>();

const isTargetCard = computed(() =>
  props.title.toLowerCase().includes("target"),
);
const showConfigJson = ref(false);

const ensureConfig = () => {
  if (!model.value.config || typeof model.value.config !== "object") {
    model.value.config = {};
  }
};

const updateConfig = (event: Event) => {
  ensureConfig();
  const value = (event.target as HTMLTextAreaElement).value;
  model.value.config = JSON.parse(value || "{}") as Record<string, unknown>;
};

const setResponseMode = (enabled: boolean) => {
  ensureConfig();
  model.value.config.responseMode = enabled ? "reply" : "preview";
};

const setOmitNullValues = (enabled: boolean) => {
  ensureConfig();
  model.value.config.omitNullValues = enabled;
};

const responseModeEnabled = computed(
  () => model.value.config?.responseMode === "reply",
);

const omitNullValuesEnabled = computed(
  () => model.value.config?.omitNullValues === true,
);
</script>

<template>
  <section class="panel p-5">
    <div class="mb-5 flex items-start justify-between gap-4">
      <div>
        <p class="panel-title">{{ title }}</p>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          Configure connector type, payload format, and runtime options.
        </p>
      </div>
      <div
        class="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600"
      >
        {{ model.type || "connector" }} · {{ model.format || "format" }}
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <label class="space-y-2 text-sm font-medium text-slate-700">
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
      <label class="space-y-2 text-sm font-medium text-slate-700">
        <span>Format</span>
        <select v-model="model.format" class="input">
          <option v-for="option in formatOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>
    </div>

    <div
      v-if="isTargetCard"
      class="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4"
    >
      <div class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-sky-900">
              HTTP response mode
            </p>
            <p class="mt-1 text-sm leading-6 text-sky-700">
              When this pipeline is triggered through the HTTP endpoint, send the
              transformed payload back on the same connection.
            </p>
          </div>
          <label
            class="inline-flex items-center gap-2 text-sm font-medium text-sky-900"
          >
            <input
              :checked="responseModeEnabled"
              type="checkbox"
              class="h-4 w-4 rounded border-sky-300 text-sky-500 focus:ring-sky-200"
              @change="
                setResponseMode(($event.target as HTMLInputElement).checked)
              "
            />
            Reply inline
          </label>
        </div>

        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-sky-900">
              Omit null values
            </p>
            <p class="mt-1 text-sm leading-6 text-sky-700">
              Leave null or missing values blank in tabular output and omit them from JSON or XML output instead of rendering <code>&lt;nil&gt;</code> or <code>null</code>.
            </p>
          </div>
          <label
            class="inline-flex items-center gap-2 text-sm font-medium text-sky-900"
          >
            <input
              data-testid="omit-null-values-toggle"
              :checked="omitNullValuesEnabled"
              type="checkbox"
              class="h-4 w-4 rounded border-sky-300 text-sky-500 focus:ring-sky-200"
              @change="
                setOmitNullValues(($event.target as HTMLInputElement).checked)
              "
            />
            Omit nulls
          </label>
        </div>
      </div>
    </div>

    <div class="mt-4">
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-medium text-slate-700">Config JSON</span>
        <button
          data-testid="toggle-config-json"
          class="button-secondary px-3 py-2 text-xs"
          type="button"
          @click="showConfigJson = !showConfigJson"
        >
          {{ showConfigJson ? "Hide config JSON" : "Show config JSON" }}
        </button>
      </div>

      <label
        v-if="showConfigJson"
        class="mt-3 block space-y-2 text-sm font-medium text-slate-700"
      >
        <textarea
          data-testid="config-json-textarea"
          class="input min-h-36 font-mono text-xs"
          :value="JSON.stringify(model.config, null, 2)"
          @change="updateConfig"
        />
      </label>
    </div>
  </section>
</template>
