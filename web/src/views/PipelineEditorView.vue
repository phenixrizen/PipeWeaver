<script setup lang="ts">
import { watch } from "vue";
import { useRoute } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import PipelineEditorForm from "../components/PipelineEditorForm.vue";
import { usePipelineStore } from "../stores/pipelines";

const store = usePipelineStore();
const route = useRoute();

const loadEditor = async () => {
  const id = route.params.id;
  if (typeof id === "string" && id.length > 0) {
    await store.loadPipeline(id);
    return;
  }
  store.createDraft();
};

watch(
  () => route.params.id,
  () => {
    void loadEditor();
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <PageHeader
      title="Pipeline editor"
      description="Design polished request-to-response flows, configure HTTP-ready endpoints, and map CSV data into structured output with drag-and-drop assistance."
    />

    <div
      v-if="store.error"
      class="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm"
    >
      {{ store.error }}
    </div>

    <PipelineEditorForm
      v-model="store.current"
      v-model:sample-payload="store.samplePayload"
      :preview="store.preview"
      :loading="store.loading"
      @save="store.saveCurrent"
      @preview="store.runPreview"
    />
  </div>
</template>
