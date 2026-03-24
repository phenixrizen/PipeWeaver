<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    status: string;
    step: string;
    elapsedLabel: string;
    detail: string;
    responseText?: string;
    wordsReceived?: number;
    modelLabel?: string;
    scopeLabel?: string;
    errorMessage?: string;
    canCancel?: boolean;
  }>(),
  {
    responseText: "",
    wordsReceived: 0,
    modelLabel: "",
    scopeLabel: "",
    errorMessage: "",
    canCancel: false,
  },
);

const emit = defineEmits<{
  cancel: [];
  close: [];
}>();

const responseScrollRef = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);

const responsePreview = computed(() =>
  props.responseText.trim()
    ? props.responseText
    : "Waiting for streamed output from the local model.",
);

const onResponseScroll = () => {
  const container = responseScrollRef.value;
  if (!container) {
    return;
  }

  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  stickToBottom.value = distanceFromBottom < 24;
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      stickToBottom.value = true;
    }
  },
);

watch(
  () => props.responseText,
  async () => {
    await nextTick();
    const container = responseScrollRef.value;
    if (!container || !stickToBottom.value) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  },
);
</script>

<template>
  <div
    v-if="visible"
    data-testid="generation-progress-modal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
  >
    <div class="w-full max-w-4xl rounded-3xl border border-sky-200 bg-white shadow-2xl shadow-slate-900/20">
      <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
        <div class="flex items-start gap-4">
          <div
            class="mt-1 h-10 w-10 shrink-0 rounded-full border-2 border-sky-200 border-t-sky-500 animate-spin"
          />
          <div>
            <p class="panel-title text-sky-700">Crunching</p>
            <h3 class="mt-2 text-xl font-semibold text-slate-900">
              {{ title }}
            </h3>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              PipeWeaver is keeping the draft work in one place while the browser
              analyzes samples and, when needed, runs the local model.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <div
            v-if="modelLabel"
            class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
          >
            {{ modelLabel }}
          </div>
          <div
            v-if="scopeLabel"
            class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
          >
            {{ scopeLabel }}
          </div>
          <button
            v-if="canCancel"
            type="button"
            class="button-secondary"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            v-if="errorMessage"
            type="button"
            class="button-secondary"
            @click="emit('close')"
          >
            Close
          </button>
        </div>
      </div>

      <div class="grid gap-3 border-b border-slate-200 bg-slate-50/80 px-6 py-5 md:grid-cols-[auto,auto,auto,1fr,auto]">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Status
          </p>
          <p class="mt-2 text-sm font-medium text-slate-900">{{ status }}</p>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Step
          </p>
          <p class="mt-2 text-sm font-medium text-slate-900">{{ step }}</p>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Elapsed
          </p>
          <p class="mt-2 text-sm font-medium text-slate-900">
            {{ elapsedLabel }}
          </p>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Detail
          </p>
          <p class="mt-2 text-sm text-slate-600">
            {{ detail || "Waiting for the next local progress update." }}
          </p>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Words received
          </p>
          <p class="mt-2 text-sm font-medium text-slate-900">
            <span data-testid="generation-progress-words">
            {{ wordsReceived }}
            </span>
          </p>
        </div>
      </div>

      <div class="px-6 py-5">
        <div
          v-if="errorMessage"
          class="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {{ errorMessage }}
        </div>

        <div class="rounded-2xl border border-slate-200 bg-slate-950">
          <div class="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
              Streamed output
            </p>
            <p class="text-xs text-slate-300">
              Auto-scroll pauses if you scroll up.
            </p>
          </div>
          <div
            ref="responseScrollRef"
            data-testid="generation-progress-response"
            class="max-h-80 overflow-auto px-4 py-4"
            @scroll="onResponseScroll"
          >
            <pre class="whitespace-pre-wrap text-sm leading-6 text-sky-100">{{ responsePreview }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
