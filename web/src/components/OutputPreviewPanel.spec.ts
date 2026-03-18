import { render, screen } from "@testing-library/vue";

import OutputPreviewPanel from "./OutputPreviewPanel.vue";

// The preview panel test ensures transformed output is visible after a backend preview call.
it("renders preview output", () => {
  render(OutputPreviewPanel, {
    props: {
      preview: {
        pipelineId: "demo",
        recordCount: 1,
        durationMs: 3,
        output: '{"ok":true}',
        records: [{ ok: true }],
      },
    },
  });

  expect(screen.getByText('{"ok":true}').textContent).toBe('{"ok":true}');
});
