<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "../components/AppHeader.vue";
import { usePipelineStore } from "../stores/pipelines";

const route = useRoute();
const store = usePipelineStore();
const currentPipelineTitle = computed(() => {
  if (!["pipeline-new", "pipeline-edit"].includes(String(route.name ?? ""))) {
    return "";
  }

  const liveName = store.current.pipeline.name?.trim();
  if (liveName) {
    return liveName;
  }

  if (typeof route.params.id === "string" && route.params.id.length > 0) {
    return route.params.id;
  }

  return "New pipeline";
});
</script>

<template>
  <div class="min-h-screen bg-transparent text-gray-900">
    <AppHeader :current-pipeline-title="currentPipelineTitle" />
    <main class="grow">
      <div
        class="mx-auto w-full px-4 py-6 sm:px-6 md:w-[95%] lg:px-8 lg:py-8"
      >
        <slot />
      </div>
    </main>
  </div>
</template>
