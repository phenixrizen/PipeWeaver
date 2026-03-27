<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, watch } from "vue";

defineOptions({ inheritAttrs: false });

type SelectOptionValue = string | number;
type SelectOption =
  | SelectOptionValue
  | {
      label: string;
      value: SelectOptionValue;
      disabled?: boolean;
      description?: string;
    };

type NormalizedSelectOption = {
  label: string;
  value: SelectOptionValue;
  disabled: boolean;
  description?: string;
};

const props = withDefaults(
  defineProps<{
    modelValue?: SelectOptionValue | "";
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: SelectOptionValue | ""];
}>();

const attrs = useAttrs();
const showNativeMirror = import.meta.env.MODE === "test";
const triggerRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const highlightedIndex = ref(-1);
const listboxId = `app-select-${Math.random().toString(36).slice(2)}`;
const menuPosition = ref({
  top: 0,
  left: 0,
  width: 0,
});

const triggerAttrs = computed(() => {
  const next = { ...attrs } as Record<string, unknown>;
  delete next["data-testid"];
  return next;
});

const triggerTestId = computed(() =>
  String(attrs["data-testid"] ?? "app-select-trigger"),
);

const normalizeOption = (option: SelectOption): NormalizedSelectOption => {
  if (typeof option === "object" && option !== null && "value" in option) {
    return {
      label: option.label,
      value: option.value,
      disabled: option.disabled ?? false,
      description: option.description,
    };
  }

  return {
    label: String(option),
    value: option,
    disabled: false,
  };
};

const matchesValue = (
  optionValue: SelectOptionValue,
  candidate: SelectOptionValue | "",
) => String(optionValue) === String(candidate);

const normalizedOptions = computed(() => props.options.map(normalizeOption));

const selectedIndex = computed(() =>
  normalizedOptions.value.findIndex((option) =>
    matchesValue(option.value, props.modelValue ?? ""),
  ),
);

const selectedOption = computed(() =>
  selectedIndex.value >= 0 ? normalizedOptions.value[selectedIndex.value] : null,
);

const displayLabel = computed(() => {
  if (selectedOption.value) {
    return selectedOption.value.label;
  }

  if (props.modelValue !== undefined && props.modelValue !== "") {
    return String(props.modelValue);
  }

  return props.placeholder || "Select an option";
});

const firstEnabledIndex = () =>
  normalizedOptions.value.findIndex((option) => !option.disabled);

const lastEnabledIndex = () => {
  for (let index = normalizedOptions.value.length - 1; index >= 0; index -= 1) {
    if (!normalizedOptions.value[index]?.disabled) {
      return index;
    }
  }
  return -1;
};

const findEnabledIndex = (startIndex: number, step: 1 | -1) => {
  const options = normalizedOptions.value;
  if (!options.some((option) => !option.disabled)) {
    return -1;
  }

  let index = startIndex;
  for (let attempts = 0; attempts < options.length; attempts += 1) {
    index = (index + step + options.length) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
};

const primeHighlight = () => {
  if (
    selectedIndex.value >= 0 &&
    !normalizedOptions.value[selectedIndex.value]?.disabled
  ) {
    highlightedIndex.value = selectedIndex.value;
    return;
  }

  highlightedIndex.value = firstEnabledIndex();
};

const scrollHighlightedIntoView = () => {
  const element = menuRef.value?.querySelector<HTMLElement>(
    `[data-option-index="${highlightedIndex.value}"]`,
  );
  if (element && typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "nearest" });
  }
};

const updateMenuPosition = () => {
  if (!triggerRef.value) {
    return;
  }

  const rect = triggerRef.value.getBoundingClientRect();
  menuPosition.value = {
    top: rect.bottom + 8,
    left: rect.left,
    width: rect.width,
  };
};

const closeMenu = () => {
  isOpen.value = false;
  highlightedIndex.value = -1;
};

const openMenu = async () => {
  if (props.disabled || !normalizedOptions.value.length) {
    return;
  }

  isOpen.value = true;
  primeHighlight();
  await nextTick();
  updateMenuPosition();
  scrollHighlightedIntoView();
};

const toggleMenu = async () => {
  if (isOpen.value) {
    closeMenu();
    return;
  }

  await openMenu();
};

const selectOption = (option: NormalizedSelectOption) => {
  if (option.disabled) {
    return;
  }

  emit("update:modelValue", option.value);
  closeMenu();
};

const onNativeChange = (event: Event) => {
  const nextValue = (event.target as HTMLSelectElement).value;
  const matchingOption = normalizedOptions.value.find((option) =>
    matchesValue(option.value, nextValue),
  );
  emit("update:modelValue", matchingOption?.value ?? nextValue);
};

const moveHighlight = (step: 1 | -1) => {
  if (!normalizedOptions.value.length) {
    return;
  }

  const startIndex =
    highlightedIndex.value >= 0
      ? highlightedIndex.value
      : selectedIndex.value >= 0
        ? selectedIndex.value
        : step === 1
          ? normalizedOptions.value.length - 1
          : 0;
  highlightedIndex.value = findEnabledIndex(startIndex, step);
  nextTick(scrollHighlightedIntoView);
};

const onTriggerKeydown = async (event: KeyboardEvent) => {
  if (props.disabled) {
    return;
  }

  if (["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(event.key)) {
    event.preventDefault();
  }

  if (event.key === "ArrowDown") {
    if (!isOpen.value) {
      await openMenu();
      return;
    }
    moveHighlight(1);
    return;
  }

  if (event.key === "ArrowUp") {
    if (!isOpen.value) {
      await openMenu();
      return;
    }
    moveHighlight(-1);
    return;
  }

  if (event.key === "Home") {
    await openMenu();
    highlightedIndex.value = firstEnabledIndex();
    return;
  }

  if (event.key === "End") {
    await openMenu();
    highlightedIndex.value = lastEnabledIndex();
    return;
  }

  if (event.key === "Escape") {
    closeMenu();
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    if (!isOpen.value) {
      await openMenu();
      return;
    }

    const highlightedOption = normalizedOptions.value[highlightedIndex.value];
    if (highlightedOption) {
      selectOption(highlightedOption);
    }
  }
};

const onOptionKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveHighlight(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveHighlight(-1);
  }
};

const onDocumentPointerDown = (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) {
    return;
  }

  closeMenu();
};

const onWindowChange = () => {
  if (!isOpen.value) {
    return;
  }

  updateMenuPosition();
};

watch(isOpen, (open) => {
  if (typeof window === "undefined") {
    return;
  }

  if (open) {
    window.addEventListener("pointerdown", onDocumentPointerDown);
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    return;
  }

  window.removeEventListener("pointerdown", onDocumentPointerDown);
  window.removeEventListener("resize", onWindowChange);
  window.removeEventListener("scroll", onWindowChange, true);
});

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closeMenu();
    }
  },
);

watch(
  () => props.modelValue,
  () => {
    if (!isOpen.value) {
      highlightedIndex.value = -1;
    }
  },
);

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("pointerdown", onDocumentPointerDown);
    window.removeEventListener("resize", onWindowChange);
    window.removeEventListener("scroll", onWindowChange, true);
  }
});
</script>

<template>
  <div class="relative w-full">
    <button
      ref="triggerRef"
      v-bind="triggerAttrs"
      :data-testid="triggerTestId"
      type="button"
      class="input flex items-center justify-between gap-3 text-left"
      :class="[
        props.disabled ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'cursor-pointer',
        isOpen ? 'border-sky-400 ring-4 ring-sky-100' : '',
      ]"
      :disabled="props.disabled"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :aria-controls="listboxId"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <span
        class="min-w-0 flex-1 truncate"
        :class="selectedOption ? 'text-slate-900' : 'text-slate-400'"
      >
        {{ displayLabel }}
      </span>
      <svg
        class="h-4 w-4 shrink-0 text-slate-400 transition-transform"
        :class="isOpen ? 'rotate-180 text-sky-500' : ''"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M5.5 7.5L10 12L14.5 7.5"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
        />
      </svg>
    </button>

    <select
      v-if="showNativeMirror"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      :disabled="props.disabled"
      :value="props.modelValue ?? ''"
      @change="onNativeChange"
    >
      <option v-if="props.placeholder" disabled value="">
        {{ props.placeholder }}
      </option>
      <option
        v-for="option in normalizedOptions"
        :key="String(option.value)"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>

    <Teleport to="body">
      <div
        v-if="isOpen"
        :id="listboxId"
        ref="menuRef"
        role="listbox"
        class="fixed z-[120] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-300/30"
        :style="{
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          width: `${menuPosition.width}px`,
        }"
      >
        <div class="max-h-80 overflow-auto">
          <button
            v-for="(option, index) in normalizedOptions"
            :key="String(option.value)"
            :data-option-index="index"
            data-testid="app-select-option"
            :data-option-value="String(option.value)"
            type="button"
            role="option"
            class="w-full rounded-xl px-3 py-2 text-left text-sm transition"
            :class="[
              option.disabled
                ? 'cursor-not-allowed text-slate-300'
                : selectedIndex === index
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/10'
                  : highlightedIndex === index
                    ? 'bg-sky-50 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
            ]"
            :aria-selected="selectedIndex === index"
            :disabled="option.disabled"
            @click="selectOption(option)"
            @keydown="onOptionKeydown"
            @mouseenter="highlightedIndex = option.disabled ? highlightedIndex : index"
            @focus="highlightedIndex = option.disabled ? highlightedIndex : index"
          >
            <div class="min-w-0">
              <p class="truncate font-semibold">
                {{ option.label }}
              </p>
              <p
                v-if="option.description"
                class="mt-1 text-xs leading-5"
                :class="
                  selectedIndex === index
                    ? 'text-sky-100'
                    : highlightedIndex === index
                      ? 'text-slate-600'
                      : 'text-slate-500'
                "
              >
                {{ option.description }}
              </p>
            </div>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
