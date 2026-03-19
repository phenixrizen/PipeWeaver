import { mount } from "@vue/test-utils";
import { expect, it } from "vitest";
import ConnectorConfigCard from "./ConnectorConfigCard.vue";

it("hides config json by default and reveals it on demand", async () => {
  const wrapper = mount(ConnectorConfigCard, {
    props: {
      modelValue: {
        type: "http",
        format: "json",
        config: {
          samplePayload: '{"ok":true}',
        },
      },
      title: "Source connector",
      connectorTypes: ["http", "file"],
      formatOptions: ["json", "csv"],
      "onUpdate:modelValue": () => undefined,
    },
  });

  expect(wrapper.find('[data-testid="config-json-textarea"]').exists()).toBe(false);
  expect(wrapper.get('[data-testid="toggle-config-json"]').text()).toContain(
    "Show config JSON",
  );

  await wrapper.get('[data-testid="toggle-config-json"]').trigger("click");

  expect(wrapper.find('[data-testid="config-json-textarea"]').exists()).toBe(true);
  expect(
    (wrapper.get('[data-testid="config-json-textarea"]').element as HTMLTextAreaElement)
      .value,
  ).toContain("samplePayload");
});
