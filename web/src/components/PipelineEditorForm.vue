<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ConnectorConfigCard from "./ConnectorConfigCard.vue";
import HttpEndpointPanel from "./HttpEndpointPanel.vue";
import MappingTable from "./MappingTable.vue";
import OutputPreviewPanel from "./OutputPreviewPanel.vue";
import PipelineAiAssistant from "./PipelineAiAssistant.vue";
import SamplePayloadEditor from "./SamplePayloadEditor.vue";
import SchemaEditor from "./SchemaEditor.vue";
import ValidationErrorsPanel from "./ValidationErrorsPanel.vue";
import type { PipelineDefinition, PreviewResult } from "../types/pipeline";

const pipeline = defineModel<PipelineDefinition>({ required: true });
const samplePayload = defineModel<string>("samplePayload", { required: true });
const props = defineProps<{ preview?: PreviewResult; loading: boolean }>();
const emit = defineEmits<{ save: []; preview: [] }>();

const connectorTypes = ["http", "file", "stdout", "postgres", "kafka"];
const formatOptions = ["json", "csv", "tsv", "pipe", "xml"];

type EditorTab = {
  id:
    | "pipeline"
    | "endpoint"
    | "sample"
    | "mapping"
    | "assistant"
    | "schema"
    | "preview"
    | "validation";
  label: string;
  count?: number;
};

const activeTab = ref<EditorTab["id"]>("pipeline");

const tabs = computed<EditorTab[]>(() => {
  const nextTabs: EditorTab[] = [
    { id: "pipeline", label: "Pipeline" },
    { id: "sample", label: "Sample payload" },
    { id: "mapping", label: "Mapping" },
    { id: "assistant", label: "AI copilot" },
    { id: "schema", label: "Target schema" },
    { id: "preview", label: "Preview" },
    {
      id: "validation",
      label: "Validation",
      count: props.preview?.validationErrors?.length ?? 0,
    },
  ];

  if (pipeline.value.source.type === "http") {
    nextTabs.splice(1, 0, { id: "endpoint", label: "Endpoint" });
  }

  return nextTabs;
});

watch(
  tabs,
  (availableTabs) => {
    if (!availableTabs.some((tab) => tab.id === activeTab.value)) {
      activeTab.value = "pipeline";
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-6">
    <section class="panel overflow-hidden">
      <div
        class="bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.16),_transparent_35%),linear-gradient(180deg,_#ffffff,_#f8fafc)] p-6"
      >
        <div
          class="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
        >
          <div>
            <p class="panel-title">Pipeline studio</p>
            <h3 class="mt-3 text-2xl font-semibold text-slate-900">
              Configure the flow definition
            </h3>
            <p class="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Edit the full pipeline as tabbed cards so metadata, connectors,
              HTTP settings, mappings, and previews all stay one click away.
            </p>
          </div>
          <div class="flex flex-wrap gap-3">
            <button
              class="button-secondary"
              type="button"
              :disabled="loading"
              @click="emit('preview')"
            >
              Run preview
            </button>
            <button
              class="button-primary"
              type="button"
              :disabled="loading"
              @click="emit('save')"
            >
              Save pipeline
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="rounded-2xl border px-4 py-2 text-sm font-semibold transition"
            :class="
              activeTab === tab.id
                ? 'border-violet-500 bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                : 'border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white'
            "
            type="button"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
            <span
              v-if="typeof tab.count === 'number'"
              class="ml-2 rounded-full px-2 py-0.5 text-xs"
              :class="
                activeTab === tab.id
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-500'
              "
            >
              {{ tab.count }}
            </span>
          </button>
        </div>
      </div>
    </section>

    <div v-show="activeTab === 'pipeline'" class="space-y-6">
      <section class="panel overflow-hidden">
        <div class="p-6">
          <div class="mb-6">
            <p class="panel-title">Pipeline metadata</p>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              Name the pipeline, describe its purpose, and keep the core flow
              identity together with the connector setup.
            </p>
          </div>

          <div class="grid gap-4 xl:grid-cols-[1fr,1fr,1.2fr]">
            <label class="space-y-2 text-sm font-medium text-slate-700">
              <span>Pipeline ID</span>
              <input v-model="pipeline.pipeline.id" class="input" />
            </label>
            <label class="space-y-2 text-sm font-medium text-slate-700">
              <span>Name</span>
              <input v-model="pipeline.pipeline.name" class="input" />
            </label>
            <div
              class="rounded-3xl border border-violet-100 bg-violet-50/70 p-4 shadow-sm xl:row-span-2"
            >
              <p class="panel-title text-violet-500">Studio flow</p>
              <p class="mt-3 text-sm leading-6 text-violet-900">
                Save to expose the HTTP endpoint, tune connectors, and move
                across the remaining tabs to refine the payload, schema, and
                output preview.
              </p>
            </div>
            <label
              class="space-y-2 text-sm font-medium text-slate-700 xl:col-span-2"
            >
              <span>Description</span>
              <textarea
                v-model="pipeline.pipeline.description"
                class="input min-h-28"
              />
            </label>
          </div>
        </div>
      </section>

      <div class="grid gap-6 2xl:grid-cols-2">
        <ConnectorConfigCard
          v-model="pipeline.source"
          title="Source connector"
          :connector-types="connectorTypes"
          :format-options="formatOptions"
        />
        <ConnectorConfigCard
          v-model="pipeline.target"
          title="Target connector"
          :connector-types="connectorTypes"
          :format-options="formatOptions"
        />
      </div>
    </div>

    <div v-show="activeTab === 'endpoint'">
      <HttpEndpointPanel :pipeline="pipeline" :sample-payload="samplePayload" />
    </div>

    <div v-show="activeTab === 'sample'">
      <SamplePayloadEditor
        v-model="samplePayload"
        :format="pipeline.source.format"
      />
    </div>

    <div v-show="activeTab === 'mapping'">
      <MappingTable
        v-model="pipeline.mapping.fields"
        :source-format="pipeline.source.format"
        :sample-payload="samplePayload"
        :target-schema="pipeline.targetSchema"
      />
    </div>

    <div v-show="activeTab === 'assistant'">
      <PipelineAiAssistant
        v-model:pipeline="pipeline"
        :sample-payload="samplePayload"
      />
    </div>

    <div v-show="activeTab === 'schema'">
      <SchemaEditor v-model="pipeline.targetSchema" />
    </div>

    <div v-show="activeTab === 'preview'">
      <OutputPreviewPanel :preview="props.preview" />
    </div>

    <div v-show="activeTab === 'validation'">
      <ValidationErrorsPanel :errors="props.preview?.validationErrors" />
    </div>
  </div>
</template>
