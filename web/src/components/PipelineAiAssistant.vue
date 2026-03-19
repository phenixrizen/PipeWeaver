<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import MonacoCodeEditor from "./MonacoCodeEditor.vue";
import {
  aiModeLabels,
  aiModelOptions,
  buildAiPrompt,
  defaultAiInstruction,
  isStructuredAiMode,
  normalizeStructuredAiResponseText,
  parseAiResponse,
  structuredAiResponseSchema,
  type AiDraftMode,
  type AiDraftResponse,
} from "../lib/ai";
import { loadWebLLM } from "../lib/webllm";
import type { PipelineDefinition } from "../types/pipeline";

const pipeline = defineModel<PipelineDefinition>("pipeline", {
  required: true,
});
const emit = defineEmits<{
  generated: [
    result: {
      mode: AiDraftMode;
      structured: boolean;
      summary: string;
      responseText: string;
      parsedResponse: AiDraftResponse | null;
    },
  ];
}>();
const props = withDefaults(
  defineProps<{
    samplePayload: string;
    sampleOutput?: string;
    autoApplyStructured?: boolean;
    hideApplyActions?: boolean;
    lockTargetSchema?: boolean;
    generateLabel?: string;
    hidePromptEditors?: boolean;
    hideSummaryPanel?: boolean;
    hideResponseEditor?: boolean;
  }>(),
  {
    sampleOutput: "",
    autoApplyStructured: false,
    hideApplyActions: false,
    lockTargetSchema: false,
    generateLabel: "Generate draft",
    hidePromptEditors: false,
    hideSummaryPanel: false,
    hideResponseEditor: false,
  },
);

const selectedModel = ref(aiModelOptions[0].id);
const selectedMode = ref<AiDraftMode>("studio");
const maxTokens = ref(1200);
const instructionText = ref(defaultAiInstruction(selectedMode.value, pipeline.value));
const requestPreview = ref("");
const responseText = ref("");
const summary = ref("");
const loadStatus = ref("Idle");
const progressStep = ref("Idle");
const progressText = ref("");
const errorMessage = ref("");
const isModelReady = ref(false);
const browserCacheStatus = ref<"checking" | "cached" | "missing" | "unavailable">(
  "checking",
);
const isBusy = ref(false);
const cancelRequested = ref(false);
const parsedResponse = ref<AiDraftResponse | null>(null);

const elapsedSeconds = ref(0);

let elapsedTimer: number | undefined;
let modelCacheStatusRequestId = 0;

let engine:
  | {
      modelId: string;
      instance: {
        interruptGenerate?: () => void | Promise<void>;
        chat: {
          completions: {
            create: (request: {
              messages: { role: "system" | "user"; content: string }[];
              temperature: number;
              max_tokens: number;
              stream?: boolean;
              response_format?: {
                type: "json_object";
                schema: string;
              };
            }) => Promise<
              | {
                  choices: { message: { content?: string | null } }[];
                }
              | AsyncIterable<{
                  choices: {
                    delta?: { content?: string | null };
                    finish_reason?: string | null;
                  }[];
                }>
            >;
          };
        };
      };
    }
  | undefined;

const canUseWebGpu = computed(
  () => typeof navigator !== "undefined" && "gpu" in navigator,
);
const isStructuredMode = computed(() => isStructuredAiMode(selectedMode.value));
const selectedModelOption = computed(
  () => aiModelOptions.find((option) => option.id === selectedModel.value) ?? aiModelOptions[0],
);

const elapsedLabel = computed(() =>
  elapsedSeconds.value > 0 ? `${elapsedSeconds.value}s` : "Not running",
);

const browserCacheStatusLabel = computed(() => {
  switch (browserCacheStatus.value) {
    case "cached":
      return "Cached in browser";
    case "missing":
      return "Not cached yet";
    case "unavailable":
      return "Cache status unavailable";
    default:
      return "Checking browser cache";
  }
});

const responseEditorLabel = computed(() =>
  isStructuredMode.value ? "AI JSON response" : "AI explanation",
);

const responseEditorLanguage = computed(() =>
  isStructuredMode.value ? "json" : "markdown",
);

const summaryLabel = computed(() =>
  isStructuredMode.value ? "AI summary" : "Explanation overview",
);

const summaryFallbackText = computed(() =>
  isStructuredMode.value
    ? "Generate a draft to see a structured summary here."
    : "Generate an explanation to see the operator-facing overview here.",
);

const assistantDescription = computed(() =>
  props.hidePromptEditors
    ? "Run a local WebLLM model in the browser, keep the target sample contract in play, and generate a first draft without sending data to a server."
    : "Run a WebLLM model entirely in the UI, review the generated draft or explanation in Monaco, and selectively apply the description, schema, or mappings when the output is structured.",
);

const generateButtonLabel = computed(() => {
  if (!isBusy.value) {
    return props.generateLabel;
  }

  if (progressStep.value === "Running local inference") {
    return `Generating... ${elapsedSeconds.value}s`;
  }

  return `${progressStep.value}...`;
});

const normalizedMaxTokens = computed(() => {
  const numericValue = Number(maxTokens.value);
  if (!Number.isFinite(numericValue)) {
    return 1200;
  }
  return Math.max(256, Math.min(4096, Math.round(numericValue)));
});

const isAsyncIterable = <T,>(
  value: AsyncIterable<T> | unknown,
): value is AsyncIterable<T> =>
  typeof value === "object" &&
  value !== null &&
  Symbol.asyncIterator in value;

const canCancelGeneration = computed(
  () =>
    isBusy.value &&
    [
      "Submitting prompt",
      "Running local inference",
      "Streaming partial response",
      "Parsing model response",
      "Cancelling generation",
    ].includes(progressStep.value),
);

const stopElapsedTimer = () => {
  if (typeof window === "undefined" || elapsedTimer === undefined) {
    return;
  }

  window.clearInterval(elapsedTimer);
  elapsedTimer = undefined;
};

const startElapsedTimer = () => {
  if (typeof window === "undefined") {
    return;
  }

  stopElapsedTimer();
  elapsedSeconds.value = 0;
  elapsedTimer = window.setInterval(() => {
    elapsedSeconds.value += 1;
  }, 1000);
};

const updateProgress = (status: string, step: string, detail: string) => {
  loadStatus.value = status;
  progressStep.value = step;
  progressText.value = detail;
};

const resetResponse = () => {
  responseText.value = "";
  summary.value = "";
  parsedResponse.value = null;
  errorMessage.value = "";
  cancelRequested.value = false;
};

const summarizeExplainResponse = (raw: string) => {
  const normalized = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line.length > 0);

  return normalized ?? "Explanation ready.";
};

const refreshModelCacheStatus = async () => {
  const requestId = ++modelCacheStatusRequestId;
  browserCacheStatus.value = "checking";

  try {
    const webllm = await loadWebLLM();
    const cached = await webllm.hasModelInCache(selectedModel.value);

    if (requestId !== modelCacheStatusRequestId) {
      return;
    }

    browserCacheStatus.value = cached ? "cached" : "missing";
  } catch {
    if (requestId !== modelCacheStatusRequestId) {
      return;
    }

    browserCacheStatus.value = "unavailable";
  }
};

watch(selectedMode, (mode) => {
  instructionText.value = defaultAiInstruction(mode, pipeline.value);
  resetResponse();
});

watch(
  selectedModel,
  (modelId) => {
    isModelReady.value = engine?.modelId === modelId;

    if (!isBusy.value) {
      if (isModelReady.value) {
        updateProgress(
          "Ready",
          "Model already loaded",
          "Using the model cached in this browser session.",
        );
      } else {
        updateProgress(
          "Idle",
          "Model not loaded",
          "Load the selected model or generate a draft to let PipeWeaver load it automatically.",
        );
      }
    }

    void refreshModelCacheStatus();
  },
  { immediate: true },
);

watch(
  () => pipeline.value.target.format,
  () => {
    instructionText.value = defaultAiInstruction(
      selectedMode.value,
      pipeline.value,
    );
  },
);

onBeforeUnmount(() => {
  stopElapsedTimer();
});

const loadModel = async () => {
  errorMessage.value = "";
  if (!canUseWebGpu.value) {
    errorMessage.value =
      "WebLLM needs a browser with WebGPU enabled. Try Chrome, Edge, or another WebGPU-capable browser.";
    return;
  }

  if (engine?.modelId === selectedModel.value) {
    isModelReady.value = true;
    updateProgress(
      "Ready",
      "Model already loaded",
      "Using the model cached in this browser session.",
    );
    return;
  }

  isBusy.value = true;
  updateProgress(
    "Loading model",
    "Preparing WebLLM runtime",
    "Starting the local inference engine in this browser tab.",
  );

  try {
    const webllm = await loadWebLLM();
    const instance = await webllm.CreateMLCEngine(selectedModel.value, {
      initProgressCallback(progress) {
        progressStep.value = "Loading model artifacts";
        progressText.value =
          typeof progress.text === "string" && progress.text.length > 0
            ? progress.text
            : `Loading ${(progress.progress ?? 0) * 100}%`;
      },
    });

    engine = { modelId: selectedModel.value, instance };
    isModelReady.value = true;
    browserCacheStatus.value = "cached";
    updateProgress(
      "Ready",
      "Model ready",
      "Model cached in this browser session.",
    );
  } catch (error) {
    isModelReady.value = false;
    updateProgress(
      "Load failed",
      "Model load failed",
      "WebLLM could not finish loading the selected model.",
    );
    errorMessage.value =
      error instanceof Error ? error.message : "Failed to load WebLLM model.";
  } finally {
    isBusy.value = false;
  }
};

const generateDraft = async () => {
  resetResponse();
  elapsedSeconds.value = 0;
  updateProgress(
    "Preparing request",
    "Building request payload",
    "Collecting the current pipeline, sample payload, and operator prompt.",
  );

  requestPreview.value = buildAiPrompt({
    mode: selectedMode.value,
    pipeline: pipeline.value,
    samplePayload: props.samplePayload,
    sampleOutput: props.sampleOutput,
    authorPrompt: instructionText.value,
  });

  updateProgress(
    "Preparing request",
    "Request payload ready",
    `Built a ${requestPreview.value.length.toLocaleString()} character request for local inference with a ${normalizedMaxTokens.value.toLocaleString()} token response budget.`,
  );

  if (!isModelReady.value) {
    updateProgress(
      "Preparing request",
      "Ensuring model is loaded",
      "The selected model is not ready yet, so the browser is loading it first.",
    );
    await loadModel();
  }

  if (!engine) {
    return;
  }

  isBusy.value = true;
  updateProgress(
    "Generating",
    "Submitting prompt",
    "Sending the request payload to the local model.",
  );
  startElapsedTimer();

  try {
    let wasCancelled = false;

    updateProgress(
      "Generating",
      "Running local inference",
      isStructuredMode.value
        ? "The local model is decoding a structured JSON draft. Larger prompts and models can take a while."
        : "The local model is drafting an operator-facing explanation. Larger prompts and models can take a while.",
    );

    const completion = await engine.instance.chat.completions.create({
      messages: [
        {
          role: "system",
          content: isStructuredMode.value
            ? "You are PipeWeaver Studio AI. Produce practical mapping drafts for ETL operators. Return exactly one JSON object that follows the provided schema. Do not include markdown fences or commentary."
            : "You are PipeWeaver Studio AI. Explain ETL pipelines for operators in concise markdown. Do not return JSON unless the user explicitly asks for it.",
        },
        {
          role: "user",
          content: requestPreview.value,
        },
      ],
      max_tokens: normalizedMaxTokens.value,
      stream: true,
      temperature: 0.2,
      ...(isStructuredMode.value
        ? {
            response_format: {
              type: "json_object" as const,
              schema: structuredAiResponseSchema,
            },
          }
        : {}),
    });

    responseText.value = "";

    if (isAsyncIterable(completion)) {
      updateProgress(
        "Generating",
        "Streaming partial response",
        "Receiving partial output from the local model.",
      );

      for await (const chunk of completion) {
        const delta = chunk.choices
          ?.map((choice) => choice.delta?.content ?? "")
          .join("");

        if (chunk.choices?.some((choice) => choice.finish_reason === "abort")) {
          wasCancelled = true;
        }

        if (!delta) {
          if (wasCancelled || cancelRequested.value) {
            break;
          }
          continue;
        }

        responseText.value += delta;
        updateProgress(
          "Generating",
          "Streaming partial response",
          `Received ${responseText.value.length.toLocaleString()} response characters so far.`,
        );

        if (wasCancelled || cancelRequested.value) {
          break;
        }
      }
    } else {
      responseText.value = completion.choices[0]?.message.content ?? "";
    }

    if (cancelRequested.value) {
      wasCancelled = true;
    }

    if (wasCancelled) {
      updateProgress(
        "Generation cancelled",
        "Generation cancelled",
        `Stopped after ${elapsedSeconds.value}s. Partial output remains in the response editor.`,
      );
      return;
    }

    updateProgress(
      "Generating",
      isStructuredMode.value ? "Parsing model response" : "Finalizing explanation",
      isStructuredMode.value
        ? "The raw response is back. Validating and parsing the JSON draft now."
        : "The raw explanation is back. Tidying the final markdown output now.",
    );
    responseText.value = responseText.value.trim();
    if (isStructuredMode.value) {
      parsedResponse.value = parseAiResponse(responseText.value);
      responseText.value = normalizeStructuredAiResponseText(responseText.value);
      summary.value = parsedResponse.value.summary;
      if (props.autoApplyStructured) {
        applyAll();
      }
    } else {
      parsedResponse.value = null;
      summary.value = summarizeExplainResponse(responseText.value);
    }
    emit("generated", {
      mode: selectedMode.value,
      structured: isStructuredMode.value,
      summary: summary.value,
      responseText: responseText.value,
      parsedResponse: parsedResponse.value,
    });
    updateProgress(
      isStructuredMode.value ? "Draft ready" : "Explanation ready",
      isStructuredMode.value ? "Draft ready" : "Explanation ready",
      `${isStructuredMode.value ? "Draft" : "Explanation"} generated locally in ${elapsedSeconds.value}s.`,
    );
  } catch (error) {
    updateProgress(
      "Generation failed",
      "Generation failed",
      isStructuredMode.value
        ? "The local model could not initialize or satisfy the schema-constrained JSON response."
        : "The local model did not return a usable explanation.",
    );
    errorMessage.value =
      error instanceof Error
        ? isStructuredMode.value
          ? `Structured AI generation failed: ${error.message}`
          : error.message
        : "AI generation failed.";
  } finally {
    stopElapsedTimer();
    isBusy.value = false;
  }
};

const cancelGeneration = async () => {
  if (!engine || !canCancelGeneration.value || cancelRequested.value) {
    return;
  }

  cancelRequested.value = true;
  updateProgress(
    "Cancelling",
    "Cancelling generation",
    "Stopping the local model and keeping any partial output collected so far.",
  );

  try {
    await Promise.resolve(engine.instance.interruptGenerate?.());
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Failed to cancel generation.";
  }
};

const applyDescription = () => {
  if (parsedResponse.value?.pipelineDescription) {
    pipeline.value.pipeline.description =
      parsedResponse.value.pipelineDescription;
  }
};

const applySchema = () => {
  if (!props.lockTargetSchema && parsedResponse.value?.targetSchema) {
    pipeline.value.targetSchema = parsedResponse.value.targetSchema;
  }
};

const applyMappings = () => {
  if (parsedResponse.value?.mappingFields?.length) {
    pipeline.value.mapping.fields = parsedResponse.value.mappingFields;
  }
};

const applyAll = () => {
  applyDescription();
  applySchema();
  applyMappings();
};
</script>

<template>
  <section class="panel p-5">
    <div
      class="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-start xl:justify-between"
    >
      <div>
        <p class="panel-title">Local AI copilot</p>
        <h3 class="mt-3 text-lg font-semibold text-slate-900">
          Draft mappings in the browser
        </h3>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {{ assistantDescription }}
        </p>
      </div>
      <div
        class="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900 shadow-sm"
      >
        <p class="font-semibold">Runtime</p>
        <p class="mt-1">
          {{
            canUseWebGpu
              ? "WebGPU detected for local inference."
              : "WebGPU unavailable in this browser."
          }}
        </p>
      </div>
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-[1fr,1fr,0.8fr,auto]">
      <label class="space-y-2 text-sm font-medium text-slate-700">
        <span>Local model</span>
        <select
          v-model="selectedModel"
          data-testid="ai-model-select"
          class="input"
        >
          <option
            v-for="option in aiModelOptions"
            :key="option.id"
            :value="option.id"
          >
            {{ option.dropdownLabel }}
          </option>
        </select>
        <p class="text-xs leading-5 text-slate-500">
          {{ selectedModelOption.note }}
        </p>
        <p class="text-xs leading-5 text-slate-500">
          {{ selectedModelOption.sizeLabel }} model class with
          {{ selectedModelOption.vramLabel }}.
        </p>
        <p
          data-testid="ai-model-cache-status"
          class="text-xs leading-5 text-slate-500"
        >
          Browser cache: {{ browserCacheStatusLabel }}. First load downloads the
          model. Later loads reuse browser cache when available.
        </p>
      </label>

      <label class="space-y-2 text-sm font-medium text-slate-700">
        <span>Draft task</span>
        <select v-model="selectedMode" class="input">
          <option
            v-for="(label, mode) in aiModeLabels"
            :key="mode"
            :value="mode"
          >
            {{ label }}
          </option>
        </select>
      </label>

      <label class="space-y-2 text-sm font-medium text-slate-700">
        <span>Max output tokens</span>
        <input
          v-model.number="maxTokens"
          data-testid="ai-max-tokens-input"
          type="number"
          min="256"
          max="4096"
          step="128"
          class="input"
        />
        <p class="text-xs leading-5 text-slate-500">
          Higher limits allow longer drafts but increase local inference time.
        </p>
      </label>

      <div class="flex flex-col gap-3 justify-end">
        <button
          class="button-secondary"
          type="button"
          :disabled="isBusy"
          @click="loadModel"
        >
          {{ isModelReady ? "Reload model" : "Load model" }}
        </button>
        <button
          v-if="canCancelGeneration"
          data-testid="ai-cancel-button"
          class="button-secondary"
          type="button"
          :disabled="cancelRequested"
          @click="cancelGeneration"
        >
          {{ cancelRequested ? "Cancelling..." : "Cancel generation" }}
        </button>
        <button
          data-testid="ai-generate-button"
          class="button-primary"
          type="button"
          :disabled="isBusy"
          @click="generateDraft"
        >
          {{ generateButtonLabel }}
        </button>
      </div>
    </div>

    <div
      class="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-[auto,auto,auto,1fr]"
    >
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
        >
          Status
        </p>
        <p class="mt-2 text-sm font-medium text-slate-900">{{ loadStatus }}</p>
      </div>
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
        >
          Step
        </p>
        <p class="mt-2 text-sm font-medium text-slate-900">
          {{ progressStep }}
        </p>
      </div>
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
        >
          Elapsed
        </p>
        <p class="mt-2 text-sm font-medium text-slate-900">
          {{ elapsedLabel }}
        </p>
      </div>
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
        >
          Detail
        </p>
        <p class="mt-2 text-sm text-slate-600">
          {{ progressText || "No model activity yet." }}
        </p>
      </div>
    </div>

    <div
      v-if="errorMessage"
      class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ errorMessage }}
    </div>

    <div v-if="!props.hidePromptEditors" class="mt-6 grid gap-6 xl:grid-cols-[1fr,1fr]">
      <MonacoCodeEditor
        v-model="instructionText"
        label="Operator prompt"
        language="markdown"
        height="220px"
      />
      <MonacoCodeEditor
        v-model="requestPreview"
        label="Generated request payload"
        language="markdown"
        height="220px"
        readonly
      />
    </div>

    <div
      v-if="!props.hideSummaryPanel"
      class="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div
        class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
      >
        <div>
          <p
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
          >
            {{ summaryLabel }}
          </p>
          <p class="mt-2 text-sm leading-6 text-slate-700">
            {{
              summary || summaryFallbackText
            }}
          </p>
        </div>
        <div
          v-if="isStructuredMode && !props.hideApplyActions"
          class="flex flex-wrap gap-2"
        >
          <button
            class="button-secondary"
            type="button"
            :disabled="!parsedResponse?.pipelineDescription"
            @click="applyDescription"
          >
            Apply description
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="!parsedResponse?.targetSchema"
            @click="applySchema"
          >
            Apply schema
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="!parsedResponse?.mappingFields?.length"
            @click="applyMappings"
          >
            Apply mappings
          </button>
          <button
            class="button-primary"
            type="button"
            :disabled="!parsedResponse"
            @click="applyAll"
          >
            Apply all
          </button>
        </div>
      </div>
    </div>

    <div v-if="!props.hideResponseEditor" class="mt-6">
      <MonacoCodeEditor
        v-model="responseText"
        :label="responseEditorLabel"
        :language="responseEditorLanguage"
        height="360px"
        readonly
      />
    </div>
  </section>
</template>
