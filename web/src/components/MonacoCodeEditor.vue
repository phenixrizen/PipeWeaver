<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { editor as MonacoEditor, IDisposable } from "monaco-editor";
import { ensureMonacoEnvironment } from "../lib/monaco";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language?: string;
    height?: string;
    readonly?: boolean;
    label?: string;
  }>(),
  {
    language: "plaintext",
    height: "320px",
    readonly: false,
    label: undefined,
  },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const editorElement = ref<HTMLElement | null>(null);
const textareaValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});

const useTextareaFallback =
  typeof window === "undefined" ||
  typeof ResizeObserver === "undefined" ||
  /jsdom/i.test(window.navigator.userAgent);

let monaco: typeof import("../lib/monaco-editor").default | undefined;
let editor: MonacoEditor.IStandaloneCodeEditor | undefined;
let model: MonacoEditor.ITextModel | undefined;
let resizeObserver: ResizeObserver | undefined;
let changeSubscription: IDisposable | undefined;

const syncEditorValue = (nextValue: string) => {
  if (!editor || !model || model.getValue() === nextValue) {
    return;
  }

  model.pushEditOperations(
    [],
    [
      {
        range: model.getFullModelRange(),
        text: nextValue,
      },
    ],
    () => null,
  );
};

onMounted(async () => {
  if (useTextareaFallback || !editorElement.value) {
    return;
  }

  ensureMonacoEnvironment();
  monaco = (await import("../lib/monaco-editor")).default;

  const uri = monaco.Uri.parse(
    `file:///pipeweaver/${Math.random().toString(36).slice(2)}.${props.language === "json" ? "json" : props.language === "javascript" ? "js" : "txt"}`,
  );

  model = monaco.editor.createModel(props.modelValue, props.language, uri);
  editor = monaco.editor.create(editorElement.value, {
    model,
    automaticLayout: true,
    contextmenu: true,
    fontFamily:
      "ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
    fontSize: 13,
    minimap: { enabled: false },
    padding: { top: 14, bottom: 14 },
    readOnly: props.readonly,
    roundedSelection: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 2,
    theme: "vs",
    wordWrap: "on",
  });

  changeSubscription = editor!.onDidChangeModelContent(() => {
    const value = editor?.getValue() ?? "";
    if (value !== props.modelValue) {
      emit("update:modelValue", value);
    }
  });

  resizeObserver = new ResizeObserver(() => editor?.layout());
  resizeObserver.observe(editorElement.value);
});

watch(
  () => props.modelValue,
  (value) => syncEditorValue(value),
);

watch(
  () => props.language,
  (language) => {
    if (!monaco || !model) {
      return;
    }
    monaco.editor.setModelLanguage(model, language);
  },
);

watch(
  () => props.readonly,
  (readonly) => editor?.updateOptions({ readOnly: readonly }),
);

onBeforeUnmount(() => {
  changeSubscription?.dispose();
  resizeObserver?.disconnect();
  editor?.dispose();
  model?.dispose();
});
</script>

<template>
  <div class="space-y-2">
    <p
      v-if="label"
      class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
    >
      {{ label }}
    </p>
    <textarea
      v-if="useTextareaFallback"
      v-model="textareaValue"
      :readonly="readonly"
      class="monaco-fallback"
      :style="{ minHeight: height }"
      spellcheck="false"
    />
    <div v-else ref="editorElement" class="monaco-shell" :style="{ height }" />
  </div>
</template>
