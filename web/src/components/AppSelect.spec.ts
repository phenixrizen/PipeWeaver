import { mount } from "@vue/test-utils";
import AppSelect from "./AppSelect.vue";

it("renders a styled dropdown and emits updates from the visible menu", async () => {
  const wrapper = mount(AppSelect, {
    props: {
      modelValue: "",
      placeholder: "Pick a format",
      options: ["json", "csv", "xml"],
    },
  });

  expect(wrapper.get('[data-testid="app-select-trigger"]').text()).toContain(
    "Pick a format",
  );

  await wrapper.get('[data-testid="app-select-trigger"]').trigger("click");
  const options = document.body.querySelectorAll('[data-testid="app-select-option"]');
  expect(options).toHaveLength(3);

  (options[1] as HTMLElement | undefined)?.click();

  expect(wrapper.emitted("update:modelValue")).toEqual([["csv"]]);
});
