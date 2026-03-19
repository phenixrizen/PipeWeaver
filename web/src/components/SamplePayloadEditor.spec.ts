import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { it, expect, vi } from "vitest";
import SamplePayloadEditor from "./SamplePayloadEditor.vue";

const MonacoStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  template: `
    <textarea
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
});

it("loads dropped file contents into the sample payload editor", async () => {
  const onUpdate = vi.fn();
  const onDetectedFormat = vi.fn();

  const wrapper = mount(SamplePayloadEditor, {
    props: {
      modelValue: "existing",
      format: "json",
      "onUpdate:modelValue": onUpdate,
      onDetectedFormat,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  const file = {
    name: "sample.json",
    text: async () => '{"ok":true}',
  };

  await wrapper.get('[data-testid="sample-payload-drop-zone"]').trigger("drop", {
    dataTransfer: {
      files: [file],
      getData: () => "",
    },
  });
  await flushPromises();

  expect(onUpdate).toHaveBeenCalledWith('{"ok":true}');
  expect(onDetectedFormat).toHaveBeenCalledWith("json");
});

it("detects format from dropped content when the filename is generic", async () => {
  const onUpdate = vi.fn();
  const onDetectedFormat = vi.fn();

  const wrapper = mount(SamplePayloadEditor, {
    props: {
      modelValue: "existing",
      format: "json",
      "onUpdate:modelValue": onUpdate,
      onDetectedFormat,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  const file = {
    name: "sample.txt",
    text: async () => "<order><id>1001</id></order>",
  };

  await wrapper.get('[data-testid="sample-payload-drop-zone"]').trigger("drop", {
    dataTransfer: {
      files: [file],
      getData: () => "",
    },
  });
  await flushPromises();

  expect(onUpdate).toHaveBeenCalledWith("<order><id>1001</id></order>");
  expect(onDetectedFormat).toHaveBeenCalledWith("xml");
});
