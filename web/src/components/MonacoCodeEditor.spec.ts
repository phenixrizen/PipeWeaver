import { mount } from "@vue/test-utils";
import { expect, it } from "vitest";
import MonacoCodeEditor from "./MonacoCodeEditor.vue";

it("supports drag resizing in the textarea fallback", async () => {
  const wrapper = mount(MonacoCodeEditor, {
    props: {
      modelValue: "hello",
      height: "240px",
      "onUpdate:modelValue": () => undefined,
    },
  });

  await wrapper.get('[data-testid="monaco-resize-handle"]').trigger("mousedown", {
    clientY: 100,
  });
  window.dispatchEvent(new MouseEvent("mousemove", { clientY: 180 }));
  window.dispatchEvent(new MouseEvent("mouseup"));
  await wrapper.vm.$nextTick();

  expect(
    (wrapper.get("textarea").element as HTMLTextAreaElement).style.height,
  ).toBe("320px");
});

it("opens and closes the in-app full screen editor shell", async () => {
  const wrapper = mount(MonacoCodeEditor, {
    props: {
      modelValue: "hello",
      label: "Sample payload",
      "onUpdate:modelValue": () => undefined,
    },
  });

  await wrapper.get('[data-testid="monaco-fullscreen-button"]').trigger("click");
  expect(
    document.body.querySelector('[data-testid="monaco-close-fullscreen-button"]'),
  ).toBeTruthy();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await wrapper.vm.$nextTick();

  expect(
    document.body.querySelector('[data-testid="monaco-close-fullscreen-button"]'),
  ).toBeFalsy();
});
