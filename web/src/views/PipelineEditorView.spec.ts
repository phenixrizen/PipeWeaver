import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import PipelineEditorView from "./PipelineEditorView.vue";
import { usePipelineStore } from "../stores/pipelines";

const routes = [
  { path: "/pipelines/new", component: PipelineEditorView },
  { path: "/pipelines/:id", component: PipelineEditorView },
];

describe("PipelineEditorView", () => {
  it("creates a fresh draft when navigating from an existing pipeline to /pipelines/new", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const router = createRouter({
      history: createMemoryHistory(),
      routes,
    });

    await router.push("/pipelines/existing-pipeline");
    await router.isReady();

    const store = usePipelineStore();
    const loadPipeline = vi
      .spyOn(store, "loadPipeline")
      .mockResolvedValue(undefined as never);
    const createDraft = vi.spyOn(store, "createDraft");

    mount(PipelineEditorView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          PageHeader: true,
          PipelineEditorForm: true,
        },
      },
    });

    await nextTick();
    expect(loadPipeline).toHaveBeenCalledWith("existing-pipeline");

    await router.push("/pipelines/new");
    await nextTick();

    expect(createDraft).toHaveBeenCalled();
  });
});
