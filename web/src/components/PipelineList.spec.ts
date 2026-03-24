import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { expect, it } from "vitest";
import PipelineList from "./PipelineList.vue";
import { blankPipeline } from "../lib/defaults";

const RouterLinkStub = defineComponent({
  props: {
    to: {
      type: String,
      default: "",
    },
  },
  template: '<a :href="to"><slot /></a>',
});

it("opens a custom delete confirmation dialog before emitting delete", async () => {
  const pipeline = blankPipeline();
  pipeline.pipeline.id = "claims";
  pipeline.pipeline.name = "Claims export";

  const wrapper = mount(PipelineList, {
    props: {
      pipelines: [pipeline],
    },
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  });

  await wrapper.get('[data-testid="pipeline-delete-button"]').trigger("click");

  expect(wrapper.text()).toContain("Delete Claims export?");
  expect(wrapper.text()).toContain("claims");

  await wrapper.get('[data-testid="pipeline-delete-cancel"]').trigger("click");

  expect(wrapper.find('[data-testid="pipeline-delete-confirm"]').exists()).toBe(false);

  await wrapper.get('[data-testid="pipeline-delete-button"]').trigger("click");
  await wrapper.get('[data-testid="pipeline-delete-confirm"]').trigger("click");

  expect(wrapper.emitted("delete")).toEqual([["claims"]]);
});
