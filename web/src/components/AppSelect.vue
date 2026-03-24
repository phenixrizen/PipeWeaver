<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useAttrs, watch } from "vue";

defineOptions({ inheritAttrs: false });

type SelectOptionValue = string | number;
type SelectOption =
  | SelectOptionValue
  | {
      label: string;
      value: SelectOptionValue;
      disabled?: boolean;
    };

type NormalizedSelectOption = {
  label: string;
  value: SelectOptionValue;
  disabled: boolean;
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
const rootRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const highlightedIndex = ref(-1);
const listboxId = `app-select-${Math.random().toString(36).slice(2)}`;

const normalizeOption = (option: SelectOption): NormalizedSelectOption => {
  if (typeof option === "object" && option !== null && "value" in option) {
    return {
      label: option.label,
      value: option.value,
      disabled: option.disabled ?? false,
    };
  }

  return {
    label: String(option),
    value: option,
    disabled: false,
  };
};

const matchesValue = (optionValue: SelectOptionValue, candidate: SelectOptionValue | "") =>
  String(optionValue) === String(candidate);

const normalizedOptions = computed(() => props.options.map(normalizeOption));

const selectedIndex = computed(() =>
  normalizedOptions.value.findIndex((option) => matchesValue(option.value, props.modelValue ?? "")),
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

  return props.placeholder;
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

const openMenu = () => {
  if (props.disabled || !normalizedOptions.value.length) {
    return;
  }

  isOpen.value = true;
  primeHighlight();
};

const closeMenu = () => {
  isOpen.value = false;
  highlightedIndex.value = -1;
};

const toggleMenu = () => {
  if (isOpen.value) {
    closeMenu();
    return;
  }

  openMenu();
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
};

const onTriggerKeydown = (event: KeyboardEvent) => {
  if (props.disabled) {
    return;
  }

  if (["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(event.key)) {
    event.preventDefault();
  }

  if (event.key === "ArrowDown") {
    if (!isOpen.value) {
      openMenu();
      return;
    }
    moveHighlight(1);
    return;
  }

  if (event.key === "ArrowUp") {
    if (!isOpen.value) {
      openMenu();
      return;
    }
    moveHighlight(-1);
    return;
  }

  if (event.key === "Home") {
    openMenu();
    highlightedIndex.value = firstEnabledIndex();
    return;
  }

  if (event.key === "End") {
    openMenu();
    highlightedIndex.value = lastEnabledIndex();
    return;
  }

  if (event.key === "Escape") {
    closeMenu();
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    if (!isOpen.value) {
      openMenu();
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

const handlePointerDown = (event: PointerEvent) => {
  if (!rootRef.value?.contains(event.target as Node)) {
    closeMenu();
  }
};

watch(isOpen, (open) => {
  if (typeof window === "undefined") {
    return;
  }

  if (open) {
    window.addEventListener("pointerdown", handlePointerDown);
    return;
  }

  window.removeEventListener("pointerdown", handlePointerDown);
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
    window.removeEventListener("pointerdown", handlePointerDown);
  }
});
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <button
      data-testid="app-select-trigger"
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
        class="truncate"
        :class="selectedOption ? 'text-slate-900' : 'text-slate-400'"
      >
        {{ displayLabel || "Select an option" }}
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
      v-bind="attrs"
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

    <div
      v-if="isOpen"
      :id="listboxId"
      role="listbox"
      class="absolute left-0 top-full z-50 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-300/30"
    >
      <button
        v-for="(option, index) in normalizedOptions"
        :key="String(option.value)"
        data-testid="app-select-option"
        type="button"
        role="option"
        class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition"
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
        <span class="truncate">{{ option.label }}</span>
        <svg
          v-if="selectedIndex === index"
          class="h-4 w-4 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M3 8.25L6.2 11.25L13 4.75"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
