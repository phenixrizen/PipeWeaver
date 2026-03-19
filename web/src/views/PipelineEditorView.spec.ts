import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { defineComponent, nextTick } from "vue";
import PipelineEditorView from "./PipelineEditorView.vue";
import { usePipelineStore } from "../stores/pipelines";

const routes = [
  { path: "/pipelines/new", component: PipelineEditorView },
  { path: "/pipelines/:id", component: PipelineEditorView },
];

const PipelineEditorFormStub = defineComponent({
  template: '<div data-testid="pipeline-editor-form" />',
});

const NewPipelineWizardStub = defineComponent({
  emits: ["complete"],
  template:
    '<button data-testid="wizard-complete" @click="$emit(\'complete\')">Complete wizard</button>',
});

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
          PipelineEditorForm: PipelineEditorFormStub,
          NewPipelineWizard: NewPipelineWizardStub,
        },
      },
    });

    await nextTick();
    expect(loadPipeline).toHaveBeenCalledWith("existing-pipeline");

    await router.push("/pipelines/new");
    await nextTick();

    expect(createDraft).toHaveBeenCalled();
  });

  it("shows the wizard for /pipelines/new before rendering the full editor", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const router = createRouter({
      history: createMemoryHistory(),
      routes,
    });

    await router.push("/pipelines/new");
    await router.isReady();

    const wrapper = mount(PipelineEditorView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          PageHeader: true,
          PipelineEditorForm: PipelineEditorFormStub,
          NewPipelineWizard: NewPipelineWizardStub,
        },
      },
    });

    expect(wrapper.find('[data-testid="wizard-complete"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-editor-form"]').exists()).toBe(
      false,
    );

    await wrapper.get('[data-testid="wizard-complete"]').trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="pipeline-editor-form"]').exists()).toBe(
      true,
    );
  });
});
