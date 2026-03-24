<script setup lang="ts">
import { computed } from "vue";
import AppSelect from "./AppSelect.vue";
import type { Transform } from "../types/pipeline";

type TransformMode =
  | "none"
  | "value"
  | "pair"
  | "coalesce"
  | "conditional";

interface TransformOption {
  type: string;
  label: string;
  mode: TransformMode;
  valueLabel?: string;
  valuePlaceholder?: string;
  firstLabel?: string;
  firstPlaceholder?: string;
  secondLabel?: string;
  secondPlaceholder?: string;
}

const model = defineModel<Transform[]>({ required: true });

const transformOptions: TransformOption[] = [
  { type: "trim", label: "Trim", mode: "none" },
  {
    type: "normalize_whitespace",
    label: "Normalize whitespace",
    mode: "none",
  },
  { type: "upper", label: "Uppercase", mode: "none" },
  { type: "lower", label: "Lowercase", mode: "none" },
  { type: "to_int", label: "To integer", mode: "none" },
  { type: "to_float", label: "To number", mode: "none" },
  { type: "to_bool", label: "To boolean", mode: "none" },
  {
    type: "default",
    label: "Default value",
    mode: "value",
    valueLabel: "Fallback value",
    valuePlaceholder: "USD",
  },
  {
    type: "prefix",
    label: "Prefix",
    mode: "value",
    valueLabel: "Prefix",
    valuePlaceholder: "INV-",
  },
  {
    type: "suffix",
    label: "Suffix",
    mode: "value",
    valueLabel: "Suffix",
    valuePlaceholder: "-processed",
  },
  {
    type: "concat",
    label: "Concat",
    mode: "value",
    valueLabel: "Delimiter",
    valuePlaceholder: " ",
  },
  {
    type: "replace",
    label: "Replace",
    mode: "pair",
    firstLabel: "Find",
    firstPlaceholder: "Inc.",
    secondLabel: "Replace with",
    secondPlaceholder: "Incorporated",
  },
  {
    type: "substring",
    label: "Substring",
    mode: "pair",
    firstLabel: "Start index",
    firstPlaceholder: "0",
    secondLabel: "Length",
    secondPlaceholder: "8",
  },
  { type: "coalesce", label: "Coalesce", mode: "coalesce" },
  { type: "conditional", label: "Conditional", mode: "conditional" },
  { type: "date_parse", label: "Date parse", mode: "none" },
];

const transformMetadata = computed(() =>
  Object.fromEntries(transformOptions.map((option) => [option.type, option])),
);
const transformTypeOptions = transformOptions.map((option) => ({
  value: option.type,
  label: option.label,
}));

const addTransform = () => {
  model.value.push({ type: "trim" });
};

const setType = (transform: Transform, nextType: string) => {
  transform.type = nextType;

  const meta = transformMetadata.value[nextType];
  if (!meta) {
    return;
  }

  if (meta.mode === "none") {
    transform.value = undefined;
    transform.values = undefined;
    transform.then = undefined;
    transform.else = undefined;
  }

  if (meta.mode === "value") {
    transform.values = undefined;
    transform.then = undefined;
    transform.else = undefined;
  }

  if (meta.mode === "pair") {
    transform.value = undefined;
    transform.values = [transform.values?.[0] ?? "", transform.values?.[1] ?? ""];
    transform.then = undefined;
    transform.else = undefined;
  }

  if (meta.mode === "coalesce") {
    transform.values = transform.values?.length ? transform.values : [""];
    transform.then = undefined;
    transform.else = undefined;
  }

  if (meta.mode === "conditional") {
    transform.value = undefined;
    transform.values = undefined;
  }
};

const setValue = (transform: Transform, value: string) => {
  transform.value = value;
};

const ensureValueIndex = (transform: Transform, index: number) => {
  transform.values ??= [];
  while (transform.values.length <= index) {
    transform.values.push("");
  }
};

const setListValue = (transform: Transform, index: number, value: string) => {
  ensureValueIndex(transform, index);
  transform.values![index] = value;
};

const addCoalescePath = (transform: Transform) => {
  transform.values ??= [];
  transform.values.push("");
};

const removeCoalescePath = (transform: Transform, index: number) => {
  transform.values?.splice(index, 1);
  if (!transform.values?.length) {
    transform.values = [""];
  }
};

const onTypeChange = (transform: Transform, nextType: string) => {
  setType(transform, nextType);
};

const onValueInput = (transform: Transform, event: Event) => {
  setValue(transform, (event.target as HTMLInputElement).value);
};

const onListInput = (transform: Transform, index: number, event: Event) => {
  setListValue(transform, index, (event.target as HTMLInputElement).value);
};

const onThenInput = (transform: Transform, event: Event) => {
  transform.then = (event.target as HTMLInputElement).value;
};

const onElseInput = (transform: Transform, event: Event) => {
  transform.else = (event.target as HTMLInputElement).value;
};
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="(transform, index) in model"
      :key="`${transform.type}.${index}`"
      class="rounded-2xl border border-slate-200 bg-slate-50/90 p-4"
    >
      <div class="grid gap-3 lg:grid-cols-[1fr,auto]">
        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>Transform</span>
          <AppSelect
            :model-value="transform.type"
            :options="transformTypeOptions"
            @update:modelValue="onTypeChange(transform, String($event))"
          />
        </label>

        <div class="flex items-end justify-end">
          <button
            class="button-secondary"
            type="button"
            @click="model.splice(index, 1)"
          >
            Remove
          </button>
        </div>
      </div>

      <div
        v-if="transformMetadata[transform.type]?.mode === 'value'"
        class="mt-3"
      >
        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>{{ transformMetadata[transform.type]?.valueLabel }}</span>
          <input
            :value="transform.value ?? ''"
            class="input"
            :placeholder="transformMetadata[transform.type]?.valuePlaceholder"
            @input="onValueInput(transform, $event)"
          />
        </label>
      </div>

      <div
        v-if="transformMetadata[transform.type]?.mode === 'pair'"
        class="mt-3 grid gap-3 md:grid-cols-2"
      >
        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>{{ transformMetadata[transform.type]?.firstLabel }}</span>
          <input
            :value="transform.values?.[0] ?? ''"
            class="input"
            :placeholder="transformMetadata[transform.type]?.firstPlaceholder"
            @input="onListInput(transform, 0, $event)"
          />
        </label>
        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>{{ transformMetadata[transform.type]?.secondLabel }}</span>
          <input
            :value="transform.values?.[1] ?? ''"
            class="input"
            :placeholder="transformMetadata[transform.type]?.secondPlaceholder"
            @input="onListInput(transform, 1, $event)"
          />
        </label>
      </div>

      <div
        v-if="transformMetadata[transform.type]?.mode === 'coalesce'"
        class="mt-3 space-y-3"
      >
        <div
          v-for="(path, pathIndex) in transform.values ?? ['']"
          :key="`${index}-${pathIndex}`"
          class="grid gap-3 md:grid-cols-[1fr,auto]"
        >
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Fallback source path</span>
            <input
              :value="path"
              class="input"
              placeholder="customer.account.id"
              @input="onListInput(transform, pathIndex, $event)"
            />
          </label>
          <div class="flex items-end justify-end">
            <button
              class="button-secondary"
              type="button"
              @click="removeCoalescePath(transform, pathIndex)"
            >
              Remove path
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            class="button-secondary"
            type="button"
            @click="addCoalescePath(transform)"
          >
            Add fallback path
          </button>
        </div>

        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>Literal fallback</span>
          <input
            :value="transform.value ?? ''"
            class="input"
            placeholder="Unknown"
            @input="onValueInput(transform, $event)"
          />
        </label>
      </div>

      <div
        v-if="transformMetadata[transform.type]?.mode === 'conditional'"
        class="mt-3 grid gap-3 md:grid-cols-2"
      >
        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>Then</span>
          <input
            :value="transform.then ?? ''"
            class="input"
            placeholder="active"
            @input="onThenInput(transform, $event)"
          />
        </label>
        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>Else</span>
          <input
            :value="transform.else ?? ''"
            class="input"
            placeholder="inactive"
            @input="onElseInput(transform, $event)"
          />
        </label>
      </div>
    </div>

    <button class="button-secondary w-full" type="button" @click="addTransform">
      Add transform
    </button>
  </div>
</template>
