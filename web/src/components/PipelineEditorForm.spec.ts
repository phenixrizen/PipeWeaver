import { mount } from "@vue/test-utils";
import PipelineEditorForm from "./PipelineEditorForm.vue";
import SamplePayloadEditor from "./SamplePayloadEditor.vue";
import {
  blankSampleOutput,
  defaultPipeline,
  defaultSamplePayload,
} from "../lib/defaults";

const buildWrapper = () =>
  mount(PipelineEditorForm, {
    props: {
      modelValue: defaultPipeline(),
      samplePayload: defaultSamplePayload,
      sampleOutput: blankSampleOutput,
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
      "onUpdate:sampleOutput": () => undefined,
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

  const previewTab = wrapper
    .findAll("button")
    .find((button) => button.text().includes("Preview"));

  expect(previewTab?.classes()).toContain("bg-sky-500");
});

it("shows pipeline tabs and switches to the endpoint tab for http sources", async () => {
  const wrapper = buildWrapper();

  expect(wrapper.text()).toContain("Pipeline");
  expect(wrapper.text()).toContain("Endpoint");
  expect(wrapper.text()).toContain("Sample payload");
  expect(wrapper.text()).toContain("Sample output");

  const endpointTab = wrapper
    .findAll("button")
    .find((button) => button.text().includes("Endpoint"));

  expect(endpointTab).toBeTruthy();
  await endpointTab!.trigger("click");

  expect(endpointTab!.classes()).toContain("bg-sky-500");
});

it("updates the source format when the sample payload editor detects one", async () => {
  const pipeline = defaultPipeline();
  const wrapper = mount(PipelineEditorForm, {
    props: {
      modelValue: pipeline,
      samplePayload: defaultSamplePayload,
      sampleOutput: blankSampleOutput,
      loading: false,
      "onUpdate:modelValue": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
  });

  const sampleTab = wrapper
    .findAll("button")
    .find((button) => button.text().includes("Sample payload"));

  expect(sampleTab).toBeTruthy();
  await sampleTab!.trigger("click");

  wrapper
    .findAllComponents(SamplePayloadEditor)[0]
    .vm.$emit("detected-format", "xml");
  await wrapper.vm.$nextTick();

  expect(pipeline.source.format).toBe("xml");
});
