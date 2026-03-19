import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HttpEndpointPanel from "./HttpEndpointPanel.vue";
import { defaultPipeline, defaultSamplePayload } from "../lib/defaults";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  writeText.mockReset();
});

it("copies the sample curl command to the clipboard", async () => {
  const pipeline = defaultPipeline();

  const wrapper = mount(HttpEndpointPanel, {
    props: {
      pipeline,
      samplePayload: defaultSamplePayload,
    },
  });

  await wrapper.get('[data-testid="copy-curl-button"]').trigger("click");
  await wrapper.vm.$nextTick();

  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("curl -X POST"));
  expect(wrapper.get('[data-testid="copy-curl-button"]').text()).toBe("Copied");
});
