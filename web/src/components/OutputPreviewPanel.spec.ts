import { mount } from "@vue/test-utils";
import OutputPreviewPanel from "./OutputPreviewPanel.vue";

it("renders preview output", () => {
  const wrapper = mount(OutputPreviewPanel, {
    props: {
      preview: {
        inputRecords: [],
        outputRecords: [],
        encodedOutput: '{"ok":true}',
        durationMs: 3,
      },
    },
  });

  expect(wrapper.text()).toContain('{"ok":true}');
  expect(wrapper.text()).toContain("Last run 3 ms");
});

it("humanizes long preview durations in seconds", () => {
  const wrapper = mount(OutputPreviewPanel, {
    props: {
      preview: {
        inputRecords: [],
        outputRecords: [],
        encodedOutput: '{"ok":true}',
        durationMs: 1250,
      },
    },
  });

  expect(wrapper.text()).toContain("Last run 1.25 s");
});
