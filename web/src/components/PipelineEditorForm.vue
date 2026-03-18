<script setup lang="ts">
import ConnectorConfigCard from "./ConnectorConfigCard.vue";
import HttpEndpointPanel from "./HttpEndpointPanel.vue";
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
    <section class="panel overflow-hidden">
      <div
        class="bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.16),_transparent_35%),linear-gradient(180deg,_#ffffff,_#f8fafc)] p-6"
      >
        <div
          class="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
        >
          <div>
            <p class="panel-title">Pipeline metadata</p>
            <h3 class="mt-3 text-2xl font-semibold text-slate-900">
              Configure the flow definition
            </h3>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Set the pipeline identity, tune connectors, preview the output,
              and publish an HTTP-ready transformation flow from a single
              studio.
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
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Pipeline ID</span>
            <input v-model="pipeline.pipeline.id" class="input" />
          </label>
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Name</span>
            <input v-model="pipeline.pipeline.name" class="input" />
          </label>
          <div
            class="rounded-3xl border border-violet-100 bg-white/70 p-4 shadow-sm lg:row-span-2"
          >
            <p class="panel-title text-violet-500">Studio flow</p>
            <p class="mt-3 text-sm leading-6 text-violet-900">
              Save to expose the HTTP endpoint, drag source columns into output
              targets, then use the generated curl command to test the live
              flow.
            </p>
          </div>
          <label
            class="space-y-2 text-sm font-medium text-slate-700 lg:col-span-2"
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

    <HttpEndpointPanel :pipeline="pipeline" :sample-payload="samplePayload" />

    <div class="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
      <div class="space-y-6">
        <SamplePayloadEditor v-model="samplePayload" />
        <MappingTable
          v-model="pipeline.mapping.fields"
          :source-format="pipeline.source.format"
          :sample-payload="samplePayload"
          :target-schema="pipeline.targetSchema"
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
