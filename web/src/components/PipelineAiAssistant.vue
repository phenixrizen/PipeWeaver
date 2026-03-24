<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import AppSelect from "./AppSelect.vue";
import MonacoCodeEditor from "./MonacoCodeEditor.vue";
import {
  aiModeLabels,
  aiModelOptions,
  buildAiRequest,
  buildLikelyMatchReviewPrompt,
  defaultAiInstruction,
  isStructuredAiMode,
  likelyMatchReviewResponseSchema,
  normalizeStructuredAiResponseText,
  parseAiResponse,
  parseLikelyMatchReview,
  structuredAiResponseSchema,
  type AiAssistantProgress,
  type AiDraftMode,
  type AiDraftResponse,
  type AiLikelyMatchReview,
  type AiPromptBuildResult,
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
  progress: [progress: AiAssistantProgress];
}>();
const props = withDefaults(
  defineProps<{
    samplePayload: string;
    sampleOutput?: string;
    autoApplyStructured?: boolean;
    hideApplyActions?: boolean;
    lockTargetSchema?: boolean;
    forcedMode?: AiDraftMode;
    defaultModelId?: string;
    generateLabel?: string;
    hidePromptEditors?: boolean;
    hideSummaryPanel?: boolean;
    hideStatusPanel?: boolean;
    hideResponseEditor?: boolean;
  }>(),
  {
    sampleOutput: "",
    autoApplyStructured: false,
    hideApplyActions: false,
    lockTargetSchema: false,
    forcedMode: undefined,
    defaultModelId: undefined,
    generateLabel: "Generate draft",
    hidePromptEditors: false,
    hideSummaryPanel: false,
    hideStatusPanel: false,
    hideResponseEditor: false,
  },
);

type LikelyMatchReviewRequest = {
  targetPath: string;
  candidateSource: string;
  sourceSamplePreview: string;
  targetSamplePreview: string;
};

const selectedModel = ref(props.defaultModelId ?? aiModelOptions[0].id);
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
const warningMessages = ref<string[]>([]);
const isModelReady = ref(false);
const browserCacheStatus = ref<"checking" | "cached" | "missing" | "unavailable">(
  "checking",
);
const isBusy = ref(false);
const cancelRequested = ref(false);
const parsedResponse = ref<AiDraftResponse | null>(null);
const currentRunMode = ref<AiDraftMode | null>(null);
const scopedTargetPaths = ref<string[]>([]);

const elapsedSeconds = ref(0);

let elapsedTimer: number | undefined;
let modelCacheStatusRequestId = 0;
let completionAudioContext: AudioContext | null = null;

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

let lastPromptBuild: AiPromptBuildResult | undefined;

const canUseWebGpu = computed(
  () => typeof navigator !== "undefined" && "gpu" in navigator,
);
const resolvedMode = computed(
  () => currentRunMode.value ?? props.forcedMode ?? selectedMode.value,
);
const isStructuredMode = computed(() => isStructuredAiMode(resolvedMode.value));
const exposedBusy = computed(() => isBusy.value || currentRunMode.value !== null);
const scopedTargetLabel = computed(() => {
  if (!scopedTargetPaths.value.length) {
    return "";
  }

  if (scopedTargetPaths.value.length === 1) {
    return scopedTargetPaths.value[0] ?? "";
  }

  return `${scopedTargetPaths.value.length} targets`;
});
const selectedModelOption = computed(
  () => aiModelOptions.find((option) => option.id === selectedModel.value) ?? aiModelOptions[0],
);
const modelSelectOptions = computed(() =>
  aiModelOptions.map((option) => ({
    value: option.id,
    label: option.dropdownLabel,
  })),
);
const modeSelectOptions = computed(() =>
  Object.entries(aiModeLabels).map(([mode, label]) => ({
    value: mode as AiDraftMode,
    label,
  })),
);

const formatElapsedDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "Not running";
  }

  const wholeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
};

const elapsedLabel = computed(() => formatElapsedDuration(elapsedSeconds.value));
const countApproximateWords = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
};

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
  isStructuredAiMode(resolvedMode.value) ? "AI JSON response" : "AI explanation",
);

const responseEditorLanguage = computed(() =>
  isStructuredAiMode(resolvedMode.value) ? "json" : "markdown",
);

const summaryLabel = computed(() =>
  isStructuredAiMode(resolvedMode.value) ? "AI summary" : "Explanation overview",
);

const summaryFallbackText = computed(() =>
  isStructuredAiMode(resolvedMode.value)
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
    return `Generating... ${formatElapsedDuration(elapsedSeconds.value)}`;
  }

  return `${progressStep.value}...`;
});

const assistantProgress = computed<AiAssistantProgress>(() => ({
  busy: exposedBusy.value,
  status: loadStatus.value,
  step: progressStep.value,
  elapsedSeconds: elapsedSeconds.value,
  elapsedLabel: elapsedLabel.value,
  detail: progressText.value,
  responseText: responseText.value,
  wordsReceived: countApproximateWords(responseText.value),
  errorMessage: errorMessage.value,
  modelId: selectedModel.value,
  modelLabel: selectedModelOption.value.dropdownLabel,
  scopedTargetLabel: scopedTargetLabel.value,
  canCancel: canCancelGeneration.value,
}));

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
      progressStep.value === "Submitting prompt",
      progressStep.value.startsWith("Submitting batch "),
      progressStep.value === "Running local inference",
      progressStep.value === "Streaming partial response",
      progressStep.value.startsWith("Streaming batch "),
      progressStep.value === "Parsing model response",
      progressStep.value.startsWith("Parsing batch "),
      progressStep.value === "Cancelling generation",
    ].some(Boolean),
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

const playCompletionDing = async () => {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextCtor =
    window.AudioContext ||
    // @ts-expect-error Safari still exposes webkitAudioContext.
    window.webkitAudioContext;

  if (!AudioContextCtor) {
    return;
  }

  try {
    completionAudioContext ??= new AudioContextCtor();
    if (completionAudioContext.state === "suspended") {
      await completionAudioContext.resume();
    }

    const startAt = completionAudioContext.currentTime + 0.01;
    const gain = completionAudioContext.createGain();
    gain.connect(completionAudioContext.destination);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.05, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);

    const firstTone = completionAudioContext.createOscillator();
    firstTone.type = "sine";
    firstTone.frequency.setValueAtTime(880, startAt);
    firstTone.connect(gain);
    firstTone.start(startAt);
    firstTone.stop(startAt + 0.11);

    const secondTone = completionAudioContext.createOscillator();
    secondTone.type = "sine";
    secondTone.frequency.setValueAtTime(1174.66, startAt + 0.11);
    secondTone.connect(gain);
    secondTone.start(startAt + 0.11);
    secondTone.stop(startAt + 0.22);
  } catch {
    // Best-effort notification only.
  }
};

const resetResponse = () => {
  responseText.value = "";
  summary.value = "";
  parsedResponse.value = null;
  errorMessage.value = "";
  warningMessages.value = [];
  cancelRequested.value = false;
  lastPromptBuild = undefined;
};

const summarizeExplainResponse = (raw: string) => {
  const normalized = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line.length > 0);

  return normalized ?? "Explanation ready.";
};

const aggregateStructuredResponses = (
  responses: AiDraftResponse[],
  totalBatches: number,
): AiDraftResponse => {
  const mappingByTarget = new Map<
    string,
    NonNullable<AiDraftResponse["mappingFields"]>[number]
  >();

  responses.forEach((response) => {
    response.mappingFields?.forEach((mapping) => {
      mappingByTarget.set(mapping.to, mapping);
    });
  });

  const mappingFields = Array.from(mappingByTarget.values());
  const firstSummary = responses.find((response) => response.summary.trim())?.summary.trim();
  const summaryText =
    totalBatches > 1
      ? firstSummary
        ? `${firstSummary} Completed ${totalBatches} local batches and collected ${mappingFields.length} mapping suggestions.`
        : `Completed ${totalBatches} local batches and collected ${mappingFields.length} mapping suggestions.`
      : firstSummary ?? "Draft ready.";

  return {
    summary: summaryText,
    pipelineDescription: responses.find(
      (response) => response.pipelineDescription?.trim(),
    )?.pipelineDescription,
    targetSchema: responses.find((response) => response.targetSchema)?.targetSchema,
    mappingFields,
  };
};

const runGenerationBatch = async (options: {
  prompt: string;
  maxTokens: number;
  batchIndex: number;
  totalBatches: number;
  responseSchema?: string;
  structuredRequest?: boolean;
  systemPrompt?: string;
  stream?: boolean;
  retrying?: boolean;
}) => {
  if (!engine) {
    throw new Error("The local model is not loaded.");
  }

  const {
    prompt,
    maxTokens,
    batchIndex,
    totalBatches,
    responseSchema = structuredAiResponseSchema,
    structuredRequest = isStructuredMode.value,
    systemPrompt = structuredRequest
      ? "You are PipeWeaver Studio AI. Produce practical mapping drafts for ETL operators. Return exactly one JSON object that follows the provided schema. Do not include markdown fences or commentary."
      : "You are PipeWeaver Studio AI. Explain ETL pipelines for operators in concise markdown. Do not return JSON unless the user explicitly asks for it.",
    stream = true,
    retrying = false,
  } = options;
  const batchLabel =
    totalBatches > 1 ? `batch ${batchIndex} of ${totalBatches}` : "request";
  const shouldStreamBatch =
    stream && (!structuredRequest || totalBatches === 1) && !retrying;

  requestPreview.value = prompt;
  updateProgress(
    "Generating",
    retrying
      ? totalBatches > 1
        ? `Retrying batch ${batchIndex} of ${totalBatches}`
        : "Retrying prompt"
      : totalBatches > 1
        ? `Submitting batch ${batchIndex} of ${totalBatches}`
        : "Submitting prompt",
    retrying
      ? `Retrying ${batchLabel} with a non-streaming structured request.`
      : `Sending ${batchLabel} to the local model.`,
  );

  const completion = await engine.instance.chat.completions.create({
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: maxTokens,
    stream: shouldStreamBatch,
    temperature: 0.2,
    ...(structuredRequest
      ? {
          response_format: {
            type: "json_object" as const,
            schema: responseSchema,
          },
        }
      : {}),
  });

  let batchResponseText = "";
  let wasCancelled = false;
  responseText.value = "";

  if (shouldStreamBatch && isAsyncIterable(completion)) {
    updateProgress(
      "Generating",
      totalBatches > 1
        ? `Streaming batch ${batchIndex} of ${totalBatches}`
        : "Streaming partial response",
      `Receiving partial output for ${batchLabel}.`,
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

      batchResponseText += delta;
      responseText.value = batchResponseText;
      updateProgress(
        "Generating",
        totalBatches > 1
          ? `Streaming batch ${batchIndex} of ${totalBatches}`
          : "Streaming partial response",
        `Received ${batchResponseText.length.toLocaleString()} response characters for ${batchLabel} so far.`,
      );

      if (wasCancelled || cancelRequested.value) {
        break;
      }
    }
  } else {
    updateProgress(
      "Generating",
      retrying
        ? totalBatches > 1
          ? `Retrying batch ${batchIndex} of ${totalBatches}`
          : "Retrying prompt"
        : totalBatches > 1
          ? `Waiting for batch ${batchIndex} of ${totalBatches}`
          : "Waiting for model response",
      retrying
        ? `Waiting for the non-streaming structured retry for ${batchLabel}.`
        : shouldStreamBatch
          ? `Finalizing ${batchLabel}.`
          : `Waiting for the local model to finish ${batchLabel} before parsing the structured JSON.`,
    );
    const nonStreamingCompletion = completion as {
      choices: { message: { content?: string | null } }[];
    };
    batchResponseText =
      nonStreamingCompletion.choices[0]?.message.content ?? "";
    responseText.value = batchResponseText;
  }

  return {
    wasCancelled: wasCancelled || cancelRequested.value,
    responseText: batchResponseText.trim(),
  };
};

const shouldRetryStructuredBatch = (
  error: unknown,
  responseText: string,
  structuredRequest = isStructuredMode.value,
) => {
  if (!structuredRequest) {
    return false;
  }

  if (!responseText.trim()) {
    return true;
  }

  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  return (
    error instanceof SyntaxError ||
    /Unexpected end of JSON input/i.test(message) ||
    /unterminated string/i.test(message) ||
    /expected ',' or '}'/i.test(message) ||
    /JSON/i.test(message) ||
    /valid summary/i.test(message)
  );
};

const parseStructuredBatchWithRetry = async <T>(options: {
  batchIndex: number;
  totalBatches: number;
  prompt: string;
  maxTokens: number;
  responseText: string;
  responseSchema?: string;
  warningPrefix?: string;
  parseResponse: (raw: string) => T;
}) => {
  const {
    batchIndex,
    totalBatches,
    prompt,
    maxTokens,
    responseText,
    responseSchema = structuredAiResponseSchema,
    warningPrefix = "structured AI response",
    parseResponse,
  } = options;

  try {
    return {
      parsed: parseResponse(responseText),
      responseText: normalizeStructuredAiResponseText(responseText),
      warning: "",
      wasCancelled: false,
    };
  } catch (error) {
    if (!shouldRetryStructuredBatch(error, responseText, true)) {
      throw error;
    }

    const retryResult = await runGenerationBatch({
      prompt,
      maxTokens,
      batchIndex,
      totalBatches,
      responseSchema,
      structuredRequest: true,
      stream: false,
      retrying: true,
    });

    if (retryResult.wasCancelled) {
      return {
        parsed: null,
        responseText,
        warning: "",
        wasCancelled: true,
      };
    }

    try {
      return {
        parsed: parseResponse(retryResult.responseText),
        responseText: normalizeStructuredAiResponseText(retryResult.responseText),
        warning: "",
        wasCancelled: false,
      };
    } catch (retryError) {
      const retryMessage =
        retryError instanceof Error
          ? retryError.message
          : String(retryError ?? "Unknown error");
      return {
        parsed: null,
        responseText: normalizeStructuredAiResponseText(
          retryResult.responseText || responseText,
        ),
        warning:
          totalBatches > 1
            ? `Skipped batch ${batchIndex} of ${totalBatches}: ${retryMessage}`
            : `Skipped the ${warningPrefix}: ${retryMessage}`,
        wasCancelled: false,
      };
    }
  }
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
  () => props.defaultModelId,
  (modelId) => {
    if (!modelId || selectedModel.value === modelId || isBusy.value) {
      return;
    }

    selectedModel.value = modelId;
  },
);

watch(
  () => props.forcedMode,
  (mode) => {
    if (!mode || selectedMode.value === mode) {
      return;
    }
    selectedMode.value = mode;
  },
  { immediate: true },
);

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

watch(
  assistantProgress,
  (progress) => {
    emit("progress", progress);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopElapsedTimer();
  void completionAudioContext?.close();
  completionAudioContext = null;
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

const generateDraft = async (options?: {
  mode?: AiDraftMode;
  targetScope?: string[];
}) => {
  if (isBusy.value) {
    return;
  }

  const normalizedTargetScope = Array.from(
    new Set(
      (options?.targetScope ?? [])
        .map((targetPath) => targetPath.trim())
        .filter((targetPath) => targetPath.length > 0),
    ),
  );
  const runMode = normalizedTargetScope.length
    ? "mapping"
    : options?.mode ?? props.forcedMode ?? selectedMode.value;
  const authorPrompt =
    runMode !== selectedMode.value &&
    instructionText.value === defaultAiInstruction(selectedMode.value, pipeline.value)
      ? defaultAiInstruction(runMode, pipeline.value)
      : instructionText.value;

  resetResponse();
  elapsedSeconds.value = 0;
  currentRunMode.value = runMode;
  scopedTargetPaths.value = normalizedTargetScope;
  updateProgress(
    "Preparing request",
    "Building request payload",
    normalizedTargetScope.length
      ? `Collecting the current pipeline, sample payload, and operator prompt for ${normalizedTargetScope.length === 1 ? normalizedTargetScope[0] : `${normalizedTargetScope.length} selected targets`}.`
      : "Collecting the current pipeline, sample payload, and operator prompt.",
  );

  try {
    lastPromptBuild = buildAiRequest({
      mode: runMode,
      pipeline: pipeline.value,
      samplePayload: props.samplePayload,
      sampleOutput: props.sampleOutput,
      authorPrompt,
      targetScope: normalizedTargetScope,
      requestedMaxTokens: normalizedMaxTokens.value,
      contextWindowSize: selectedModelOption.value.contextWindowSize,
    });
    requestPreview.value = lastPromptBuild.prompt;

    updateProgress(
      "Preparing request",
      "Request payload ready",
      `${lastPromptBuild.statusNote} Built a ${requestPreview.value.length.toLocaleString()} character ${lastPromptBuild.promptMode} request with an estimated ${lastPromptBuild.estimatedPromptTokens.toLocaleString()} prompt tokens and a ${lastPromptBuild.effectiveMaxTokens.toLocaleString()} token response budget.`,
    );

    if (lastPromptBuild.promptMode === "unfit") {
      summary.value = lastPromptBuild.statusNote;
      emit("generated", {
        mode: runMode,
        structured: isStructuredAiMode(runMode),
        summary: summary.value,
        responseText: "",
        parsedResponse: null,
      });
      updateProgress("Ready", "AI skipped", lastPromptBuild.statusNote);
      return;
    }

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
      normalizedTargetScope.length
        ? `Sending the scoped request for ${normalizedTargetScope.length === 1 ? normalizedTargetScope[0] : `${normalizedTargetScope.length} targets`} to the local model.`
        : "Sending the request payload to the local model.",
    );
    startElapsedTimer();

    const promptBatches = lastPromptBuild.batches;
    const totalBatches = promptBatches.length;
    const structuredResponses: AiDraftResponse[] = [];
    const explainResponses: string[] = [];

    updateProgress(
      "Generating",
      "Running local inference",
      totalBatches > 1
        ? `The local model is resolving ${totalBatches} compact batches for this draft.`
        : isStructuredMode.value
          ? "The local model is decoding a structured JSON draft. Larger prompts and models can take a while."
          : "The local model is drafting an operator-facing explanation. Larger prompts and models can take a while.",
    );

    for (const batch of promptBatches) {
      if (cancelRequested.value) {
        break;
      }

      const batchResult = await runGenerationBatch({
        prompt: batch.prompt,
        maxTokens: batch.effectiveMaxTokens,
        batchIndex: batch.batchIndex,
        totalBatches: batch.totalBatches,
      });

      if (batchResult.wasCancelled) {
        updateProgress(
          "Generation cancelled",
          "Generation cancelled",
          `Stopped after ${formatElapsedDuration(elapsedSeconds.value)}. Partial output remains in the response editor.`,
        );
        return;
      }

      updateProgress(
        "Generating",
        isStructuredMode.value
          ? totalBatches > 1
            ? `Parsing batch ${batch.batchIndex} of ${batch.totalBatches}`
            : "Parsing model response"
          : "Finalizing explanation",
        isStructuredMode.value
          ? totalBatches > 1
            ? `Validating and parsing the JSON draft for batch ${batch.batchIndex} of ${batch.totalBatches}.`
            : "The raw response is back. Validating and parsing the JSON draft now."
          : "The raw explanation is back. Tidying the final markdown output now.",
      );

      if (isStructuredMode.value) {
        const parsedBatch = await parseStructuredBatchWithRetry({
          batchIndex: batch.batchIndex,
          totalBatches: batch.totalBatches,
          prompt: batch.prompt,
          maxTokens: batch.effectiveMaxTokens,
          responseText: batchResult.responseText,
          parseResponse: parseAiResponse,
        });

        if (parsedBatch.wasCancelled) {
          updateProgress(
            "Generation cancelled",
            "Generation cancelled",
            `Stopped after ${formatElapsedDuration(elapsedSeconds.value)}. Partial output remains in the response editor.`,
          );
          return;
        }

        responseText.value = parsedBatch.responseText;
        if (parsedBatch.warning) {
          warningMessages.value.push(parsedBatch.warning);
          continue;
        }

        if (parsedBatch.parsed) {
          structuredResponses.push(parsedBatch.parsed);
        }
      } else {
        explainResponses.push(batchResult.responseText);
      }
    }

    if (cancelRequested.value) {
      updateProgress(
        "Generation cancelled",
        "Generation cancelled",
        `Stopped after ${formatElapsedDuration(elapsedSeconds.value)}. Partial output remains in the response editor.`,
      );
      return;
    }

    if (isStructuredMode.value) {
      if (structuredResponses.length > 0) {
        parsedResponse.value = aggregateStructuredResponses(
          structuredResponses,
          totalBatches,
        );
        responseText.value = JSON.stringify(parsedResponse.value, null, 2);
        summary.value = parsedResponse.value.summary;
      } else {
        parsedResponse.value = null;
        summary.value =
          warningMessages.value.length > 0
            ? "Local matching applied. The structured AI fallback returned incomplete JSON and was skipped."
            : "Draft ready.";
      }

      if (warningMessages.value.length > 0) {
        summary.value = `${summary.value} ${warningMessages.value.join(" ")}`.trim();
      }

      if (props.autoApplyStructured && parsedResponse.value) {
        applyAll();
      }
    } else {
      parsedResponse.value = null;
      responseText.value = explainResponses.join("\n\n").trim();
      summary.value = summarizeExplainResponse(responseText.value);
    }
    emit("generated", {
      mode: runMode,
      structured: isStructuredMode.value,
      summary: summary.value,
      responseText: responseText.value,
      parsedResponse: parsedResponse.value,
    });
    void playCompletionDing();
    updateProgress(
      isStructuredMode.value
        ? warningMessages.value.length > 0
          ? "Draft ready with warnings"
          : "Draft ready"
        : "Explanation ready",
      isStructuredMode.value
        ? warningMessages.value.length > 0
          ? "Draft ready with warnings"
          : "Draft ready"
        : "Explanation ready",
      `${isStructuredMode.value ? "Draft" : "Explanation"} generated locally in ${formatElapsedDuration(elapsedSeconds.value)}${totalBatches > 1 ? ` across ${totalBatches} batches` : ""}.${warningMessages.value.length > 0 ? ` ${warningMessages.value.join(" ")}` : ""}`,
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
    currentRunMode.value = null;
    scopedTargetPaths.value = [];
  }
};

const generateForTargets = async (targetPaths: string[]) => {
  await generateDraft({
    mode: "mapping",
    targetScope: targetPaths,
  });
};

const reviewSuggestedMatch = async (
  options: LikelyMatchReviewRequest,
): Promise<AiLikelyMatchReview | null> => {
  if (isBusy.value) {
    return null;
  }

  const targetPath = options.targetPath.trim();
  if (!targetPath) {
    return null;
  }

  resetResponse();
  elapsedSeconds.value = 0;
  currentRunMode.value = "mapping";
  scopedTargetPaths.value = [targetPath];
  updateProgress(
    "Preparing review",
    "Building field review prompt",
    `Collecting the displayed best local candidate for ${targetPath}.`,
  );

  try {
    const reviewMaxTokens = Math.min(normalizedMaxTokens.value, 160);
    const prompt = buildLikelyMatchReviewPrompt({
      pipeline: pipeline.value,
      targetPath,
      candidateSource: options.candidateSource,
      sourceSamplePreview: options.sourceSamplePreview,
      targetSamplePreview: options.targetSamplePreview,
    });
    requestPreview.value = prompt;

    updateProgress(
      "Preparing review",
      "Review prompt ready",
      `Built a ${prompt.length.toLocaleString()} character field review prompt for ${targetPath}.`,
    );

    if (!isModelReady.value) {
      updateProgress(
        "Preparing review",
        "Ensuring model is loaded",
        "The selected model is not ready yet, so the browser is loading it first.",
      );
      await loadModel();
    }

    if (!engine) {
      return null;
    }

    isBusy.value = true;
    updateProgress(
      "Generating",
      "Submitting prompt",
      `Asking the local model whether ${options.candidateSource || "the displayed candidate"} is a reasonable match for ${targetPath}.`,
    );
    startElapsedTimer();

    const batchResult = await runGenerationBatch({
      prompt,
      maxTokens: reviewMaxTokens,
      batchIndex: 1,
      totalBatches: 1,
      responseSchema: likelyMatchReviewResponseSchema,
      structuredRequest: true,
      systemPrompt:
        "You are PipeWeaver Studio AI. Review one displayed target-to-source candidate and return only a structured approval verdict with confidence and rationale. Do not invent alternate source paths or emit mappingFields.",
    });

    if (batchResult.wasCancelled) {
      updateProgress(
        "Generation cancelled",
        "Generation cancelled",
        `Stopped after ${formatElapsedDuration(elapsedSeconds.value)}. Partial output remains in the response editor.`,
      );
      return null;
    }

    updateProgress(
      "Generating",
      "Parsing model response",
      "Validating the structured review response for the displayed candidate.",
    );

    const parsedReview = await parseStructuredBatchWithRetry({
      batchIndex: 1,
      totalBatches: 1,
      prompt,
      maxTokens: reviewMaxTokens,
      responseText: batchResult.responseText,
      responseSchema: likelyMatchReviewResponseSchema,
      warningPrefix: "likely-match review",
      parseResponse: parseLikelyMatchReview,
    });

    if (parsedReview.wasCancelled) {
      updateProgress(
        "Generation cancelled",
        "Generation cancelled",
        `Stopped after ${formatElapsedDuration(elapsedSeconds.value)}. Partial output remains in the response editor.`,
      );
      return null;
    }

    responseText.value = parsedReview.responseText;
    if (parsedReview.warning || !parsedReview.parsed) {
      throw new Error(parsedReview.warning || "The likely-match review was empty.");
    }

    summary.value = parsedReview.parsed.summary;
    void playCompletionDing();
    updateProgress(
      parsedReview.parsed.approved ? "Review approved" : "Review rejected",
      parsedReview.parsed.approved ? "Review approved" : "Review rejected",
      `${parsedReview.parsed.summary} Confidence: ${parsedReview.parsed.confidence}. ${parsedReview.parsed.rationale}`.trim(),
    );

    return parsedReview.parsed;
  } catch (error) {
    updateProgress(
      "Review failed",
      "Review failed",
      "The local model did not return a usable verdict for the displayed best local candidate.",
    );
    errorMessage.value =
      error instanceof Error
        ? `Likely-match review failed: ${error.message}`
        : "Likely-match review failed.";
    return null;
  } finally {
    stopElapsedTimer();
    isBusy.value = false;
    currentRunMode.value = null;
    scopedTargetPaths.value = [];
  }
};

const handleGenerateClick = () => {
  void generateDraft();
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

const mergeDraftMappings = (nextMappings: AiDraftResponse["mappingFields"]) => {
  if (!nextMappings?.length) {
    return;
  }

  const lockedTargets = new Set(lastPromptBuild?.lockedMappingTargets ?? []);
  const mergedMappings = pipeline.value.mapping.fields.map((mapping) => ({
    ...mapping,
    transforms: [...mapping.transforms],
  }));

  nextMappings.forEach((mapping) => {
    if (lockedTargets.has(mapping.to)) {
      return;
    }

    const existingIndex = mergedMappings.findIndex(
      (existing) => existing.to === mapping.to,
    );
    if (existingIndex === -1) {
      mergedMappings.push(mapping);
      return;
    }

    mergedMappings.splice(existingIndex, 1, mapping);
  });

  pipeline.value.mapping.fields = mergedMappings;
};

const applyMappings = () => {
  if (parsedResponse.value?.mappingFields?.length) {
    if (lastPromptBuild?.shouldMergeMappings) {
      mergeDraftMappings(parsedResponse.value.mappingFields);
      return;
    }

    pipeline.value.mapping.fields = parsedResponse.value.mappingFields;
  }
};

const applyAll = () => {
  applyDescription();
  applySchema();
  applyMappings();
};

defineExpose({
  generateForTargets,
  reviewSuggestedMatch,
  cancelGeneration,
  isBusy: exposedBusy,
  scopedTargetPaths,
});
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
      <div
        v-if="scopedTargetPaths.length"
        data-testid="ai-target-scope"
        class="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 shadow-sm"
      >
        <p class="font-semibold">Scoped target</p>
        <p class="mt-1 break-all">
          {{ scopedTargetLabel }}
        </p>
      </div>
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-[1fr,1fr,0.8fr,auto]">
      <label class="space-y-2 text-sm font-medium text-slate-700">
        <span>Local model</span>
        <AppSelect
          v-model="selectedModel"
          data-testid="ai-model-select"
          :options="modelSelectOptions"
        />
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
        <AppSelect
          v-model="selectedMode"
          :options="modeSelectOptions"
          :disabled="Boolean(forcedMode)"
        />
        <p
          v-if="forcedMode"
          class="text-xs leading-5 text-slate-500"
        >
          Locked for this flow to keep the local fallback focused.
        </p>
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
          @click="handleGenerateClick"
        >
          {{ generateButtonLabel }}
        </button>
      </div>
    </div>

    <label class="mt-6 block space-y-2 text-sm font-medium text-slate-700">
      <span>Data context for AI</span>
      <textarea
        v-model="pipeline.pipeline.aiContext"
        data-testid="ai-data-context-input"
        class="input min-h-28"
        placeholder="Optional domain context for acronyms, row meaning, code systems, units, or business rules."
      />
      <p class="text-xs leading-5 text-slate-500">
        Keep this focused on domain meaning. It is added to AI prompts as a
        separate context block and does not affect deterministic matching.
      </p>
    </label>

    <div
      v-if="!props.hideStatusPanel"
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
