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

  const previewButton = wrapper
    .findAll("button")
    .find((button) => button.text().includes("Run preview"));

  expect(previewButton).toBeTruthy();
  await previewButton!.trigger("click");
  expect(wrapper.emitted("preview")).toBeTruthy();
});
