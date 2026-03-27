<script setup lang="ts">
import { Teleport, computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { editor as MonacoEditor, IDisposable } from "monaco-editor";
import { editorFileExtensionForLanguage } from "../lib/editorLanguage";
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
const isFullScreen = ref(false);
const textareaValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});
const minimumHeightPx = 220;
const fallbackHeightPx = 320;
const editorHeightPx = ref(fallbackHeightPx);
const viewportHeightPx = ref(
  typeof window !== "undefined" ? window.innerHeight : 0,
);

const useTextareaFallback =
  typeof window === "undefined" ||
  typeof ResizeObserver === "undefined" ||
  /jsdom/i.test(window.navigator.userAgent);

let monaco: typeof import("../lib/monaco-editor").default | undefined;
let editor: MonacoEditor.IStandaloneCodeEditor | undefined;
let model: MonacoEditor.ITextModel | undefined;
let resizeObserver: ResizeObserver | undefined;
let changeSubscription: IDisposable | undefined;
let resizeStartY = 0;
let resizeStartHeight = fallbackHeightPx;
let isResizing = false;

const parseHeight = (value?: string) => {
  const numericValue = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(numericValue)) {
    return fallbackHeightPx;
  }
  return Math.max(minimumHeightPx, numericValue);
};

const visibleHeight = computed(() => {
  if (!isFullScreen.value) {
    return `${editorHeightPx.value}px`;
  }

  return `${Math.max(viewportHeightPx.value - 220, editorHeightPx.value, 360)}px`;
});

const syncBodyInteractivity = () => {
  if (typeof document === "undefined") {
    return;
  }

  document.body.style.overflow = isFullScreen.value ? "hidden" : "";
  document.body.style.cursor = isResizing ? "ns-resize" : "";
  document.body.style.userSelect = isResizing ? "none" : "";
};

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

const layoutEditor = () => {
  if (!editor) {
    return;
  }

  editor.layout();
};

const stopResizing = () => {
  if (typeof window !== "undefined") {
    window.removeEventListener("mousemove", handleResize);
    window.removeEventListener("mouseup", stopResizing);
  }

  isResizing = false;
  syncBodyInteractivity();
  layoutEditor();
};

function handleResize(event: MouseEvent) {
  if (!isResizing) {
    return;
  }

  editorHeightPx.value = Math.max(
    minimumHeightPx,
    resizeStartHeight + (event.clientY - resizeStartY),
  );
}

const startResizing = (event: MouseEvent) => {
  event.preventDefault();
  resizeStartY = event.clientY;
  resizeStartHeight = editorHeightPx.value;
  isResizing = true;
  syncBodyInteractivity();

  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", handleResize);
    window.addEventListener("mouseup", stopResizing);
  }
};

const openFullScreen = () => {
  if (typeof window !== "undefined") {
    viewportHeightPx.value = window.innerHeight;
  }
  isFullScreen.value = true;
};

const closeFullScreen = () => {
  isFullScreen.value = false;
};

const handleViewportResize = () => {
  if (typeof window === "undefined") {
    return;
  }

  viewportHeightPx.value = window.innerHeight;
  layoutEditor();
};

const handleEscape = (event: KeyboardEvent) => {
  if (event.key === "Escape" && isFullScreen.value) {
    closeFullScreen();
  }
};

onMounted(async () => {
  editorHeightPx.value = parseHeight(props.height);

  if (useTextareaFallback || !editorElement.value) {
    return;
  }

  ensureMonacoEnvironment();
  monaco = (await import("../lib/monaco-editor")).default;

  const uri = monaco.Uri.parse(
    `file:///pipeweaver/${Math.random().toString(36).slice(2)}.${editorFileExtensionForLanguage(props.language)}`,
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

watch(
  () => props.height,
  (height) => {
    editorHeightPx.value = parseHeight(height);
    layoutEditor();
  },
  { immediate: true },
);

watch(editorHeightPx, () => layoutEditor());

watch(isFullScreen, (fullScreen) => {
  syncBodyInteractivity();

  if (typeof window === "undefined") {
    return;
  }

  if (fullScreen) {
    viewportHeightPx.value = window.innerHeight;
    window.addEventListener("resize", handleViewportResize);
    window.addEventListener("keydown", handleEscape);
  } else {
    window.removeEventListener("resize", handleViewportResize);
    window.removeEventListener("keydown", handleEscape);
  }

  window.setTimeout(() => layoutEditor(), 0);
});

onBeforeUnmount(() => {
  stopResizing();
  closeFullScreen();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleViewportResize);
    window.removeEventListener("keydown", handleEscape);
  }
  syncBodyInteractivity();
  changeSubscription?.dispose();
  resizeObserver?.disconnect();
  editor?.dispose();
  model?.dispose();
});
</script>

<template>
  <Teleport to="body" :disabled="!isFullScreen">
    <div class="relative">
      <div
        v-if="isFullScreen"
        class="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm"
        @click="closeFullScreen"
      />

      <div
        class="flex flex-col gap-2"
        :class="
          isFullScreen
            ? 'fixed inset-4 z-50 rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl'
            : ''
        "
      >
        <div class="flex items-center justify-between gap-3">
          <p
            v-if="label"
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
          >
            {{ label }}
          </p>
          <span v-else class="sr-only">Editor controls</span>

          <div class="flex items-center gap-2">
            <button
              v-if="!isFullScreen"
              data-testid="monaco-fullscreen-button"
              class="button-secondary px-3 py-2 text-xs"
              type="button"
              @click="openFullScreen"
            >
              Full screen
            </button>
            <button
              v-else
              data-testid="monaco-close-fullscreen-button"
              class="button-secondary px-3 py-2 text-xs"
              type="button"
              @click="closeFullScreen"
            >
              Close full screen
            </button>
          </div>
        </div>

        <textarea
          v-if="useTextareaFallback"
          v-model="textareaValue"
          :readonly="readonly"
          class="monaco-fallback"
          :style="{ height: visibleHeight }"
          spellcheck="false"
        />
        <div
          v-else
          ref="editorElement"
          class="monaco-shell"
          :style="{ height: visibleHeight }"
        />

        <button
          data-testid="monaco-resize-handle"
          class="flex w-full cursor-ns-resize items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:border-slate-300 hover:bg-slate-100"
          type="button"
          @mousedown="startResizing"
        >
          Drag to resize
        </button>
      </div>
    </div>
  </Teleport>
</template>
