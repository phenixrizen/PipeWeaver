<script setup lang="ts">
import ConnectorConfigCard from "./ConnectorConfigCard.vue";
import MappingTable from "./MappingTable.vue";
import OutputPreviewPanel from "./OutputPreviewPanel.vue";
import SamplePayloadEditor from "./SamplePayloadEditor.vue";
import SchemaEditor from "./SchemaEditor.vue";
import ValidationErrorsPanel from "./ValidationErrorsPanel.vue";
import type { PipelineDefinition, PreviewResult } from "../types/pipeline";

const pipeline = defineModel<PipelineDefinition>({ required: true });
const samplePayload = defineModel<string>("samplePayload", { required: true });
defineProps<{ preview?: PreviewResult; loading: boolean }>();
const emit = defineEmits<{ save: []; preview: [] }>();

const connectorTypes = ["http", "file", "stdout", "postgres", "kafka"];
const formatOptions = ["json", "csv", "tsv", "pipe", "xml"];
</script>

<template>
  <div class="space-y-6">
    <section class="panel p-5">
      <div class="grid gap-4 lg:grid-cols-3">
        <label class="space-y-2 text-sm text-slate-300">
          <span>Pipeline ID</span>
          <input v-model="pipeline.pipeline.id" class="input" />
        </label>
        <label class="space-y-2 text-sm text-slate-300">
          <span>Name</span>
          <input v-model="pipeline.pipeline.name" class="input" />
        </label>
        <label class="space-y-2 text-sm text-slate-300 lg:col-span-3">
          <span>Description</span>
          <textarea
            v-model="pipeline.pipeline.description"
            class="input min-h-24"
          />
        </label>
      </div>
      <div class="mt-4 flex flex-wrap gap-3">
        <button
          class="button-primary"
          type="button"
          :disabled="loading"
          @click="emit('save')"
        >
          Save pipeline
        </button>
        <button
          class="button-secondary"
          type="button"
          :disabled="loading"
          @click="emit('preview')"
        >
          Run preview
        </button>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-2">
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

    <div class="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
      <div class="space-y-6">
        <SamplePayloadEditor v-model="samplePayload" />
        <MappingTable v-model="pipeline.mapping.fields" />
      </div>
      <div class="space-y-6">
        <SchemaEditor v-model="pipeline.targetSchema" />
        <OutputPreviewPanel :preview="preview" />
        <ValidationErrorsPanel :errors="preview?.validationErrors" />
      </div>
    </div>
  </div>
</template>
