<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import NewPipelineWizard from "../components/NewPipelineWizard.vue";
import PipelineEditorForm from "../components/PipelineEditorForm.vue";
import { usePipelineStore } from "../stores/pipelines";

const store = usePipelineStore();
const route = useRoute();
const showWizard = ref(false);

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
      :is-saved="store.isCurrentSaved"
      @save="store.saveCurrent"
      @preview="store.runPreview"
    />
  </div>
</template>
