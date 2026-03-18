import { mount } from "@vue/test-utils";
import PipelineEditorForm from "./PipelineEditorForm.vue";
import { defaultPipeline, defaultSamplePayload } from "../lib/defaults";

const buildWrapper = () =>
  mount(PipelineEditorForm, {
    props: {
      modelValue: defaultPipeline(),
      samplePayload: defaultSamplePayload,
      loading: false,
      preview: {
        inputRecords: [],
        outputRecords: [],
        encodedOutput: '{"ok":true}',
        durationMs: 12,
        validationErrors: [{ path: "target.id", message: "Required" }],
      },
      "onUpdate:modelValue": () => undefined,
      "onUpdate:samplePayload": () => undefined,
    },
  });

it("emits preview when requested", async () => {
  const wrapper = buildWrapper();

  const previewButton = wrapper
    .findAll("button")
    .find((button) => button.text().includes("Run preview"));

  expect(previewButton).toBeTruthy();
  await previewButton!.trigger("click");
  expect(wrapper.emitted("preview")).toBeTruthy();
});

it("shows pipeline tabs and switches to the endpoint tab for http sources", async () => {
  const wrapper = buildWrapper();

  expect(wrapper.text()).toContain("Pipeline");
  expect(wrapper.text()).toContain("Endpoint");
  expect(wrapper.text()).toContain("Sample payload");

  const endpointTab = wrapper
    .findAll("button")
    .find((button) => button.text().includes("Endpoint"));

  expect(endpointTab).toBeTruthy();
  await endpointTab!.trigger("click");

  expect(endpointTab!.classes()).toContain("bg-violet-500");
});
