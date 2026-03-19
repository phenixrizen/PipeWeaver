<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import NewPipelineWizard from "../components/NewPipelineWizard.vue";
import PageHeader from "../components/PageHeader.vue";
import PipelineEditorForm from "../components/PipelineEditorForm.vue";
import { usePipelineStore } from "../stores/pipelines";

const store = usePipelineStore();
const route = useRoute();
const showWizard = ref(false);

const isEditorRoute = computed(() =>
  ["pipeline-new", "pipeline-edit"].includes(String(route.name ?? "")),
);

const pageTitle = computed(() => {
  if (showWizard.value) {
    return "New pipeline";
  }

  const liveName = store.current.pipeline.name?.trim();
  if (liveName) {
    return liveName;
  }

  if (typeof route.params.id === "string" && route.params.id.length > 0) {
    return route.params.id;
  }

  return "Pipeline editor";
});

const pageDescription = computed(() => {
  if (showWizard.value) {
    return "Start with source and target samples, let the local copilot pre-wire the obvious matches, and open the full editor once the flow has a real contract.";
  }

  return "Design polished request-to-response flows, configure HTTP-ready endpoints, and map source fields into the target schema with drag-and-drop assistance.";
});

const loadEditor = async () => {
  const id = route.params.id;
  if (typeof id === "string" && id.length > 0) {
    await store.loadPipeline(id);
    showWizard.value = false;
    return;
  }
  store.createDraft();
  showWizard.value = true;
};

const handleWizardComplete = () => {
  showWizard.value = false;
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
    <PageHeader v-if="isEditorRoute" :title="pageTitle" :description="pageDescription" />

    <div
      v-if="store.error"
      class="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm"
    >
      {{ store.error }}
    </div>

    <NewPipelineWizard
      v-if="showWizard"
      v-model:pipeline="store.current"
      v-model:sample-payload="store.samplePayload"
      v-model:sample-output="store.sampleOutput"
      @complete="handleWizardComplete"
    />
    <PipelineEditorForm
      v-else
      v-model="store.current"
      v-model:sample-payload="store.samplePayload"
      v-model:sample-output="store.sampleOutput"
      :preview="store.preview"
      :loading="store.loading"
      @save="store.saveCurrent"
      @preview="store.runPreview"
    />
  </div>
</template>
