<script setup lang="ts">
import ConnectorConfigCard from "@/components/ConnectorConfigCard.vue";
import MappingTable from "@/components/MappingTable.vue";
import SamplePayloadEditor from "@/components/SamplePayloadEditor.vue";
import SchemaEditor from "@/components/SchemaEditor.vue";
import type { PipelineDefinition } from "@/types/pipeline";

const pipeline = defineModel<PipelineDefinition>({ required: true });

const sourceTypes = ["http", "file", "postgres", "kafka"];
const targetTypes = ["stdout", "file", "postgres", "kafka"];
</script>

<template>
  <div class="space-y-6">
    <section class="panel p-5">
      <div class="grid gap-4 md:grid-cols-2">
        <label>
          <span class="label">Pipeline ID</span>
          <input
            v-model="pipeline.id"
            class="input"
            placeholder="customer_ingest_pipeline"
          />
        </label>
        <label>
          <span class="label">Pipeline name</span>
          <input
            v-model="pipeline.name"
            class="input"
            placeholder="Customer ingest"
          />
        </label>
        <label class="md:col-span-2">
          <span class="label">Description</span>
          <textarea v-model="pipeline.description" class="input min-h-[96px]" />
        </label>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-2">
      <ConnectorConfigCard
        v-model="pipeline.source"
        :connector-types="sourceTypes"
        title="Source connector"
      />
      <ConnectorConfigCard
        v-model="pipeline.target"
        :connector-types="targetTypes"
        title="Target connector"
      />
    </div>

    <div class="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
      <SamplePayloadEditor v-model="pipeline.sampleInput" />
      <SchemaEditor v-model="pipeline.targetSchema" />
    </div>

    <MappingTable v-model="pipeline.mapping.fields" />
  </div>
</template>
