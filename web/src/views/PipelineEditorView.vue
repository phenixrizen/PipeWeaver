<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

import OutputPreviewPanel from "@/components/OutputPreviewPanel.vue";
import PageHeader from "@/components/PageHeader.vue";
import PipelineEditorForm from "@/components/PipelineEditorForm.vue";
import ValidationErrorsPanel from "@/components/ValidationErrorsPanel.vue";
import { inferSchema } from "@/lib/api";
import { createEmptyPipeline, usePipelineStore } from "@/stores/pipelines";

const route = useRoute();
const router = useRouter();
const store = usePipelineStore();

const isNew = computed(() => route.params.id === undefined);

// onMounted loads the selected pipeline or initializes a new editor state.
onMounted(async () => {
  if (isNew.value) {
    store.setCurrent(createEmptyPipeline());
    return;
  }
  await store.loadOne(String(route.params.id));
});

// savePipeline persists the current document and routes to its stable editor URL.
async function savePipeline() {
  await store.saveCurrent();
  await router.push(`/pipelines/${store.current.id}`);
}

// previewPipeline calls the backend mapping preview endpoint.
async function previewPipeline() {
  await store.runPreview();
}

// inferTargetSchema uses the sample input and source format to seed target schema editing.
async function inferTargetSchema() {
  const schema = await inferSchema(
    `${store.current.name}-schema`,
    store.current.source.format,
    store.current.sampleInput ?? "",
  );
  store.current.targetSchema = schema;
}
</script>

<template>
  <PageHeader
    title="Pipeline editor"
    description="Configure connectors, map fields, and preview transformed output."
  >
    <div class="flex flex-wrap gap-3">
      <button type="button" class="btn-secondary" @click="inferTargetSchema">
        Infer schema
      </button>
      <button type="button" class="btn-secondary" @click="previewPipeline">
        Preview
      </button>
      <button type="button" class="btn-primary" @click="savePipeline">
        Save pipeline
      </button>
    </div>
  </PageHeader>

  <div
    v-if="store.error"
    class="mb-6 rounded-2xl border border-rose-900/60 bg-rose-950/30 p-4 text-sm text-rose-200"
  >
    {{ store.error }}
  </div>

  <div class="grid gap-6 xl:grid-cols-[1.3fr,0.9fr]">
    <PipelineEditorForm v-model="store.current" />
    <div class="space-y-6">
      <OutputPreviewPanel :preview="store.preview" />
      <ValidationErrorsPanel :preview="store.preview" />
    </div>
  </div>
</template>
