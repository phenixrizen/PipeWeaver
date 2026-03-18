<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import PipelineEditorForm from "../components/PipelineEditorForm.vue";
import { usePipelineStore } from "../stores/pipelines";

const store = usePipelineStore();
const route = useRoute();

// loadEditor chooses between a new draft and an existing pipeline based on the route parameter.
const loadEditor = async () => {
  const id = route.params.id;
  if (typeof id === "string" && id.length > 0) {
    await store.loadPipeline(id);
    return;
  }
  store.createDraft();
};

onMounted(() => {
  void loadEditor();
});
</script>

<template>
  <div>
    <PageHeader
      title="Pipeline editor"
      description="Configure connectors, define mappings, test payloads, and inspect transformed output in one place."
    />

    <div
      v-if="store.error"
      class="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
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
