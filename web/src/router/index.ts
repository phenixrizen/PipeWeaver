import { createRouter, createWebHistory } from "vue-router";
import PipelineEditorView from "../views/PipelineEditorView.vue";
import PipelineListView from "../views/PipelineListView.vue";

// The router keeps the UI small while still separating list and editor concerns cleanly.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "pipelines",
      component: PipelineListView,
      meta: { wideContent: true },
    },
    {
      path: "/pipelines/new",
      name: "pipeline-new",
      component: PipelineEditorView,
      meta: { wideContent: true },
    },
    {
      path: "/pipelines/:id",
      name: "pipeline-edit",
      component: PipelineEditorView,
      props: true,
      meta: { wideContent: true },
    },
  ],
});
