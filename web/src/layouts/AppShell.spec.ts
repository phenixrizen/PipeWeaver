import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent, nextTick } from "vue";
import AppShell from "./AppShell.vue";
import { usePipelineStore } from "../stores/pipelines";

const DummyView = defineComponent({
  template: "<div />",
});

const buildRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/",
        name: "pipelines",
        component: DummyView,
        meta: { wideContent: true },
      },
      {
        path: "/pipelines/new",
        name: "pipeline-new",
        component: DummyView,
        meta: { wideContent: true },
      },
    ],
  });

it("shows the live pipeline name in the top bar on editor routes", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = buildRouter();

  await router.push("/pipelines/new");
  await router.isReady();

  const store = usePipelineStore();
  store.current.pipeline.name = "Claim intake to CSV";

  const wrapper = mount(AppShell, {
    global: {
      plugins: [pinia, router],
      stubs: {
        PipeWeaverLogo: true,
      },
    },
    slots: {
      default: '<div data-testid="shell-slot">Content</div>',
    },
  });

  await nextTick();

  expect(wrapper.text()).toContain("Claim intake to CSV");
  expect(wrapper.text()).toContain("Browse pipelines");
});

it("keeps the pipeline catalog route on the shared 95 percent layout", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = buildRouter();

  await router.push("/");
  await router.isReady();

  const wrapper = mount(AppShell, {
    global: {
      plugins: [pinia, router],
      stubs: {
        PipeWeaverLogo: true,
      },
    },
    slots: {
      default: '<div data-testid="shell-slot">Content</div>',
    },
  });

  const contentContainer = wrapper.find("main > div");
  expect(contentContainer.classes()).toContain("md:w-[95%]");
});
