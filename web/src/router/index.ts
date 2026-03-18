import { createRouter, createWebHistory } from "vue-router";

import PipelineEditorView from "@/views/PipelineEditorView.vue";
import PipelineListView from "@/views/PipelineListView.vue";

// Route configuration keeps the MVP focused on the two key authoring views.
export default createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "pipelines",
      component: PipelineListView,
    },
    {
      path: "/pipelines/new",
      name: "pipeline-new",
      component: PipelineEditorView,
    },
    {
      path: "/pipelines/:id",
      name: "pipeline-edit",
      component: PipelineEditorView,
      props: true,
    },
  ],
});
