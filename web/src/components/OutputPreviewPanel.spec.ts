import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import OutputPreviewPanel from "./OutputPreviewPanel.vue";

const MonacoStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      default: "plaintext",
    },
    readonly: {
      type: Boolean,
      default: false,
    },
  },
  template:
    '<div data-testid="preview-editor" :data-language="language" :data-readonly="readonly">{{ modelValue }}</div>',
});

it("renders preview output in the read-only editor", () => {
  const wrapper = mount(OutputPreviewPanel, {
    props: {
      format: "json",
      preview: {
        inputRecords: [],
        outputRecords: [],
        encodedOutput: '{"ok":true}',
        durationMs: 3,
      },
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  expect(wrapper.get('[data-testid="preview-editor"]').text()).toContain('{"ok":true}');
  expect(wrapper.text()).toContain("Last run 3 ms");
});

it("humanizes long preview durations in seconds", () => {
  const wrapper = mount(OutputPreviewPanel, {
    props: {
      format: "json",
      preview: {
        inputRecords: [],
        outputRecords: [],
        encodedOutput: '{"ok":true}',
        durationMs: 1250,
      },
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  expect(wrapper.text()).toContain("Last run 1.25 s");
});

it("shows a table toggle for csv previews and renders table rows", async () => {
  const wrapper = mount(OutputPreviewPanel, {
    props: {
      format: "csv",
      preview: {
        inputRecords: [],
        outputRecords: [],
        encodedOutput: "name,code\nBob,12345\nBob,67890",
        durationMs: 10,
      },
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  expect(wrapper.text()).toContain("Raw");
  expect(wrapper.text()).toContain("Table");

  await wrapper.findAll("button").find((button) => button.text() === "Table")!.trigger("click");

  expect(wrapper.find('[data-testid="preview-editor"]').exists()).toBe(false);
  expect(wrapper.text()).toContain("name");
  expect(wrapper.text()).toContain("code");
  expect(wrapper.text()).toContain("12345");
  expect(wrapper.text()).toContain("67890");
});
