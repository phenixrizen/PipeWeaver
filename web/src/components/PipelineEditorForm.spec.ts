import { mount } from "@vue/test-utils";
import PipelineEditorForm from "./PipelineEditorForm.vue";
import { defaultPipeline, defaultSamplePayload } from "../lib/defaults";

it("emits preview when requested", async () => {
  const wrapper = mount(PipelineEditorForm, {
    props: {
      modelValue: defaultPipeline(),
      samplePayload: defaultSamplePayload,
      loading: false,
      preview: undefined,
      "onUpdate:modelValue": () => undefined,
      "onUpdate:samplePayload": () => undefined,
    },
  });

  const buttons = wrapper.findAll("button");
  await buttons[1].trigger("click");
  expect(wrapper.emitted("preview")).toBeTruthy();
});
