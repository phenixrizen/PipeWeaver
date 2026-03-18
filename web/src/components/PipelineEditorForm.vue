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
    <section class="panel p-6">
      <div
        class="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
      >
        <div>
          <p class="panel-title">Pipeline metadata</p>
          <h3 class="mt-3 text-xl font-semibold text-gray-900">
            Configure the flow definition
          </h3>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Set the pipeline identity, capture a concise description, then use
            preview and save actions to iterate like a dashboard workflow.
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

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="space-y-2 text-sm font-medium text-gray-700">
          <span>Pipeline ID</span>
          <input v-model="pipeline.pipeline.id" class="input" />
        </label>
        <label class="space-y-2 text-sm font-medium text-gray-700">
          <span>Name</span>
          <input v-model="pipeline.pipeline.name" class="input" />
        </label>
        <div
          class="rounded-2xl border border-violet-100 bg-violet-50 p-4 lg:row-span-2"
        >
          <p class="panel-title text-violet-500">Quick notes</p>
          <p class="mt-3 text-sm leading-6 text-violet-700">
            Saved pipelines appear in the catalog view. Seeded examples also
            show there when the API starts with the seeding flag.
          </p>
        </div>
        <label
          class="space-y-2 text-sm font-medium text-gray-700 lg:col-span-2"
        >
          <span>Description</span>
          <textarea
            v-model="pipeline.pipeline.description"
            class="input min-h-28"
          />
        </label>
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
        <MappingTable
          v-model="pipeline.mapping.fields"
          :source-format="pipeline.source.format"
          :sample-payload="samplePayload"
        />
      </div>
      <div class="space-y-6">
        <SchemaEditor v-model="pipeline.targetSchema" />
        <OutputPreviewPanel :preview="preview" />
        <ValidationErrorsPanel :errors="preview?.validationErrors" />
      </div>
    </div>
  </div>
</template>
