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
});
