<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppSelect from "./AppSelect.vue";
import GenerationProgressModal from "./GenerationProgressModal.vue";
import PipelineAiAssistant from "./PipelineAiAssistant.vue";
import SamplePayloadEditor from "./SamplePayloadEditor.vue";
import {
  applyResolutionMapping,
  applyHighConfidenceSuggestedMappings,
  applyDeterministicMappings,
  createSamplePreviewResolver,
  createEmptySchema,
  flattenSchemaLeafOptions,
  flattenSchemaLeafPaths,
  inferRepeatModesFromSamples,
  inferRowDriverPathFromSamples,
  inferSchemaFromSample,
  inferSourceFields,
  isTabularFormat,
  rankTargetMatches,
  type TargetMatchResolution,
} from "../lib/schema";
import type {
  AiAssistantProgress,
  AiDraftMode,
  AiDraftResponse,
  AiLikelyMatchReview,
} from "../lib/ai";
import type { FieldMapping, PipelineDefinition } from "../types/pipeline";

const pipeline = defineModel<PipelineDefinition>("pipeline", {
  required: true,
});
const samplePayload = defineModel<string>("samplePayload", {
  required: true,
});
const sampleOutput = defineModel<string>("sampleOutput", {
  required: true,
});
const emit = defineEmits<{ complete: [] }>();

const connectorTypes = ["http", "file", "stdout", "postgres", "kafka"];
const formatOptions = ["json", "csv", "tsv", "pipe", "xml"];
const wizardDefaultModelId = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
const xmlRepeatModeOptions = [
  { value: "preserve", label: "Preserve arrays" },
  { value: "explode", label: "Explode rows" },
];
const currentStep = ref(0);
const furthestVisitedStep = ref(0);
const idEditedManually = ref(false);
const detectedTargetFormat = ref("");
const lastPreparedSignature = ref("");
const aiSummary = ref("");
const aiRawDraft = ref("");
const showRawAiDraft = ref(false);
const isPreparingDraft = ref(false);
const localMatchResolutions = ref<TargetMatchResolution[]>([]);
const draftPreparationStep = ref("");
const suggestedSearch = ref("");
const suggestedMatchReviews = ref<Record<string, AiLikelyMatchReview>>({});

type WizardAiAssistantHandle = {
  generateForTargets: (targetPaths: string[]) => Promise<void>;
  reviewSuggestedMatch?: (options: {
    targetPath: string;
    candidateSource: string;
    sourceSamplePreview: string;
    targetSamplePreview: string;
  }) => Promise<AiLikelyMatchReview | null>;
  cancelGeneration?: () => Promise<void>;
  isBusy: boolean;
};

type WizardProgressModalState = {
  title: string;
  status: string;
  step: string;
  elapsedLabel: string;
  detail: string;
  responseText: string;
  wordsReceived: number;
  modelLabel: string;
  scopeLabel: string;
  errorMessage: string;
  canCancel: boolean;
};

const aiAssistantRef = ref<WizardAiAssistantHandle | null>(null);
const aiAssistantProgress = ref<AiAssistantProgress | null>(null);
const showAiErrorModal = ref(false);
const showProgressModal = ref(false);
const localCrunchStatus = ref("Idle");
const localCrunchStep = ref("Queued");
const localCrunchDetail = ref("");
const localCrunchElapsedSeconds = ref(0);

let prepareDraftRequestId = 0;
let activePreparePromise: Promise<void> | null = null;
let localCrunchTimer: number | undefined;

const steps = [
  {
    label: "Basics",
    heading: "Name the pipeline",
    detail: "Start with the business label, persisted pipeline ID, and a short operator-facing description.",
  },
  {
    label: "Source",
    heading: "Configure the source",
    detail: "Choose the incoming connector and format, add a realistic source sample, and decide how repeated XML elements should behave.",
  },
  {
    label: "Target",
    heading: "Configure the target",
    detail: "Choose the output connector and format, then add a target sample if you want the schema grounded by a real output contract.",
  },
  {
    label: "Generate",
    heading: "Generate from samples",
    detail: "PipeWeaver resolves deterministic and high-confidence fuzzy matches locally first. It only uses the local copilot for targets that still need help.",
  },
] as const;

const formatElapsedDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0s";
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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const ensureConfig = (side: "source" | "target") => {
  const connector = pipeline.value[side];
  if (!connector.config || typeof connector.config !== "object") {
    connector.config = {};
  }
  return connector.config as Record<string, unknown>;
};

const sourceConfig = computed(() => ensureConfig("source"));
const targetConfig = computed(() => ensureConfig("target"));

watch(
  () => pipeline.value.pipeline.name,
  (name) => {
    if (idEditedManually.value) {
      return;
    }
    pipeline.value.pipeline.id = slugify(name);
  },
  { immediate: true },
);

const currentDefinition = computed(() => steps[currentStep.value]);

const xmlRepeatMode = computed({
  get: () => String(sourceConfig.value.xmlRepeatedElementsMode ?? "preserve"),
  set: (value: string) => {
    sourceConfig.value.xmlRepeatedElementsMode = value;
  },
});

const replyInlineEnabled = computed({
  get: () => pipeline.value.target.config?.responseMode === "reply",
  set: (enabled: boolean) => {
    if (enabled) {
      targetConfig.value.responseMode = "reply";
      return;
    }
    delete targetConfig.value.responseMode;
  },
});

const omitNullValuesEnabled = computed({
  get: () => targetConfig.value.omitNullValues === true,
  set: (enabled: boolean) => {
    targetConfig.value.omitNullValues = enabled;
  },
});

const targetSampleLocksSchema = computed(() => sampleOutput.value.trim().length > 0);

const targetFormatMismatch = computed(
  () =>
    Boolean(
      detectedTargetFormat.value &&
        pipeline.value.target.format &&
        detectedTargetFormat.value !== pipeline.value.target.format,
    ),
);

const generationSignature = computed(() =>
  JSON.stringify({
    sourceFormat: pipeline.value.source.format,
    targetFormat: pipeline.value.target.format,
    samplePayload: samplePayload.value,
    sampleOutput: sampleOutput.value,
  }),
);

const targetPaths = computed(() =>
  flattenSchemaLeafPaths(pipeline.value.targetSchema?.fields),
);

const suggestedResolutions = computed(() =>
  localMatchResolutions.value.filter(
    (resolution) =>
      resolution.bucket === "suggested" &&
      !pipeline.value.mapping.fields.some((mapping) => mapping.to === resolution.target),
  ),
);

const suggestedResolutionCards = computed(() => {
  const sourcePreview = createSamplePreviewResolver(
    pipeline.value.source.format,
    samplePayload.value,
  );
  const targetPreview = createSamplePreviewResolver(
    pipeline.value.target.format,
    sampleOutput.value,
  );

  return suggestedResolutions.value.map((resolution) => {
    const suggestedSource =
      resolution.suggestedSource ?? resolution.candidates[0]?.source ?? "";

    return {
      resolution,
      suggestedSource,
      sourceSamplePreview: sourcePreview(suggestedSource) || "No sample value",
      targetSamplePreview: targetPreview(resolution.target) || "No sample value",
    };
  });
});

const filteredSuggestedResolutionCards = computed(() => {
  const query = normalizeSearch(suggestedSearch.value);
  if (!query) {
    return suggestedResolutionCards.value;
  }

  return suggestedResolutionCards.value.filter((card) =>
    [
      card.resolution.target,
      card.suggestedSource,
      card.sourceSamplePreview,
      card.targetSamplePreview,
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  );
});

const suggestedResolutionCardByTarget = computed(() =>
  Object.fromEntries(
    suggestedResolutionCards.value.map((card) => [card.resolution.target, card]),
  ),
);

const unsupportedResolutions = computed(() =>
  localMatchResolutions.value.filter(
    (resolution) =>
      resolution.bucket === "unsupported" &&
      !pipeline.value.mapping.fields.some((mapping) => mapping.to === resolution.target),
  ),
);

const canSkipAiFallback = computed(
  () =>
    targetSampleLocksSchema.value &&
    targetPaths.value.length > 0 &&
    suggestedResolutions.value.length === 0,
);

const showAiFallback = computed(
  () => !targetSampleLocksSchema.value || suggestedResolutions.value.length > 0,
);

const aiAssistantBusy = computed(() => Boolean(aiAssistantRef.value?.isBusy));

const rowDriverPath = computed({
  get: () => pipeline.value.mapping.rowDriverPath,
  set: (value: string | undefined) => {
    pipeline.value.mapping.rowDriverPath = value?.trim() ? value : undefined;
  },
});

const rowDriverSelection = computed({
  get: () => rowDriverPath.value ?? "",
  set: (value: string) => {
    rowDriverPath.value = value || undefined;
  },
});

const sourceFields = computed(() =>
  inferSourceFields(pipeline.value.source.format, samplePayload.value),
);

const supportsRowDriverSelection = computed(
  () =>
    pipeline.value.source.format === "xml" &&
    isTabularFormat(pipeline.value.target.format),
);

const rowDriverOptions = computed(() => {
  if (!supportsRowDriverSelection.value) {
    return [];
  }

  const mappedBranchCounts = new Map<string, number>();
  pipeline.value.mapping.fields.forEach((mapping) => {
    if (!mapping.from) {
      return;
    }

    const branchPath = sourceFields.value.find(
      (field) => field.path === mapping.from,
    )?.repeatBranchPath;
    if (!branchPath) {
      return;
    }

    mappedBranchCounts.set(branchPath, (mappedBranchCounts.get(branchPath) ?? 0) + 1);
  });

  return Array.from(
    new Set(
      sourceFields.value
        .map((field) => field.repeatBranchPath)
        .filter((path): path is string => Boolean(path)),
    ),
  )
    .map((path) => {
      const mappedCount = mappedBranchCounts.get(path) ?? 0;

      return {
        path,
        mappedCount,
        label: mappedCount
          ? `${path} (${mappedCount} mapped field${mappedCount === 1 ? "" : "s"})`
          : `${path} (no mapped fields yet)`,
      };
    })
    .sort((left, right) => {
      if (right.mappedCount !== left.mappedCount) {
        return right.mappedCount - left.mappedCount;
      }

      return left.path.localeCompare(right.path);
    });
});

const rowDriverSelectOptions = computed(() => [
  { value: "", label: "None" },
  ...rowDriverOptions.value.map((option) => ({
    value: option.path,
    label: option.label,
  })),
]);

const wizardSummaryText = computed(() => {
  if (isPreparingDraft.value) {
    return draftPreparationStep.value
      ? `${draftPreparationStep.value}. Large XML and CSV contracts can take a moment in the browser.`
      : "Preparing the local draft from your source and target samples now. Large XML and CSV contracts can take a moment in the browser.";
  }

  if (aiSummary.value.trim()) {
    return aiSummary.value;
  }

  if (canSkipAiFallback.value) {
    if (unsupportedResolutions.value.length > 0) {
      return `Applied ${pipeline.value.mapping.fields.length} safe local mappings and found ${unsupportedResolutions.value.length} targets with weak or missing source evidence. The local copilot is skipped because those unsupported targets are not good AI candidates.`;
    }

    return `Resolved the usable target fields locally with deterministic and structural matching. The local copilot is not needed for this sample pair.`;
  }

  return targetSampleLocksSchema.value
    ? `The target schema is already grounded by the sample output. PipeWeaver will only call the local copilot for the ${suggestedResolutions.value.length} plausible targets that still need help.`
    : "Without a target sample, the local copilot can still draft the target schema, first-pass mappings, and a stronger operator-facing description.";
});

const activeProgressModalState = computed<WizardProgressModalState | null>(() => {
  if (isPreparingDraft.value) {
    return {
      title: "Preparing local draft",
      status: localCrunchStatus.value,
      step: localCrunchStep.value,
      elapsedLabel: formatElapsedDuration(localCrunchElapsedSeconds.value),
      detail: localCrunchDetail.value,
      responseText: "",
      wordsReceived: 0,
      modelLabel: "",
      scopeLabel: "",
      errorMessage: "",
      canCancel: false,
    };
  }

  if (!showProgressModal.value && !showAiErrorModal.value) {
    return null;
  }

  const progress = aiAssistantProgress.value;
  if (!progress) {
    return null;
  }

  return {
    title: progress.scopedTargetLabel
      ? "Resolving suggested target"
      : "Generating from samples",
    status: progress.status,
    step: progress.step,
    elapsedLabel: progress.elapsedLabel || formatElapsedDuration(progress.elapsedSeconds),
    detail: progress.detail,
    responseText: progress.responseText,
    wordsReceived: progress.wordsReceived,
    modelLabel: progress.modelLabel,
    scopeLabel: progress.scopedTargetLabel,
    errorMessage: showAiErrorModal.value ? progress.errorMessage : "",
    canCancel: progress.canCancel,
  };
});

const isStepValid = computed(() => {
  switch (currentStep.value) {
    case 0:
      return Boolean(
        pipeline.value.pipeline.name.trim() && pipeline.value.pipeline.id.trim(),
      );
    case 1:
      return Boolean(
        pipeline.value.source.type.trim() && pipeline.value.source.format.trim(),
      );
    case 2:
      return Boolean(
        pipeline.value.target.type.trim() && pipeline.value.target.format.trim(),
      );
    default:
      return true;
  }
});

const canVisitStep = (index: number) => index <= furthestVisitedStep.value;

const goToStep = (index: number) => {
  if (!canVisitStep(index)) {
    return;
  }

  currentStep.value = index;
};

watch(
  () => suggestedResolutions.value.map((resolution) => resolution.target),
  (targetPaths) => {
    const activeTargets = new Set(targetPaths);
    suggestedMatchReviews.value = Object.fromEntries(
      Object.entries(suggestedMatchReviews.value).filter(([targetPath]) =>
        activeTargets.has(targetPath),
      ),
    );
  },
  { immediate: true },
);

watch(
  () => rowDriverOptions.value.map((option) => option.path),
  (paths) => {
    if (rowDriverPath.value && !paths.includes(rowDriverPath.value)) {
      rowDriverPath.value = undefined;
    }
  },
  { immediate: true },
);

const handleIdInput = (event: Event) => {
  idEditedManually.value = true;
  pipeline.value.pipeline.id = (event.target as HTMLInputElement).value;
};

const handleDetectedSourceFormat = (format: string) => {
  if (!format) {
    return;
  }

  pipeline.value.source.format = format;
};

const handleDetectedTargetFormat = (format: string) => {
  if (!format) {
    return;
  }

  detectedTargetFormat.value = format;
  pipeline.value.target.format = format;
};

const resetAiSummary = () => {
  aiSummary.value = "";
  aiRawDraft.value = "";
  showRawAiDraft.value = false;
};

const applySuggestedResolution = (resolution: TargetMatchResolution) => {
  applyResolutionMapping(pipeline.value.mapping.fields, resolution);
  const nextReviews = { ...suggestedMatchReviews.value };
  delete nextReviews[resolution.target];
  suggestedMatchReviews.value = nextReviews;
};

const applyAllSuggestedResolutions = () => {
  filteredSuggestedResolutionCards.value.forEach((card) => {
    applySuggestedResolution(card.resolution);
  });
};

const requestAiSuggestedResolution = async (targetPath: string) => {
  if (!aiAssistantRef.value || aiAssistantBusy.value) {
    return;
  }

  const card = suggestedResolutionCardByTarget.value[targetPath];
  if (!card || !aiAssistantRef.value.reviewSuggestedMatch) {
    return;
  }

  showProgressModal.value = true;
  showAiErrorModal.value = false;
  const review = await aiAssistantRef.value.reviewSuggestedMatch({
    targetPath,
    candidateSource: card.suggestedSource,
    sourceSamplePreview: card.sourceSamplePreview,
    targetSamplePreview: card.targetSamplePreview,
  });
  if (review) {
    suggestedMatchReviews.value = {
      ...suggestedMatchReviews.value,
      [targetPath]: review,
    };
  }
  if (!showAiErrorModal.value) {
    showProgressModal.value = false;
  }
};

const askAiSuggestedLabel = (targetPath: string) =>
  suggestedMatchReviews.value[targetPath] ? "Re-run AI" : "Ask AI";

const applySuggestedLabel = (targetPath: string) => {
  const review = suggestedMatchReviews.value[targetPath];
  if (!review) {
    return "Apply";
  }

  return review.approved ? "Apply vetted match" : "Apply anyway";
};

const handleAiGenerated = (result: {
  mode: AiDraftMode;
  structured: boolean;
  summary: string;
  responseText: string;
  parsedResponse: AiDraftResponse | null;
}) => {
  if (!result.structured) {
    return;
  }

  aiSummary.value = result.summary;
  aiRawDraft.value = result.responseText;
  showRawAiDraft.value = false;
};

const draftPreparationDetail = (step: string) => {
  switch (step) {
    case "Inferring target schema":
      return "Building the output contract from the selected target format and sample output.";
    case "Inferring source fields":
      return "Parsing the sample payload to discover source fields and repeated branches.";
    case "Ranking local matches":
      return "Scoring deterministic and structural matches before deciding whether the model is needed.";
    case "Inferring repeat behavior":
      return "Checking repeated XML branches and row-driver behavior from the current samples.";
    case "Finalizing draft":
      return "Applying the safe local draft and preparing the Generate step.";
    default:
      return "Opening the Generate step and queuing local analysis.";
  }
};

const stopLocalCrunchTimer = () => {
  if (typeof window === "undefined" || localCrunchTimer === undefined) {
    return;
  }

  window.clearInterval(localCrunchTimer);
  localCrunchTimer = undefined;
};

const startLocalCrunchTimer = () => {
  if (typeof window === "undefined") {
    return;
  }

  stopLocalCrunchTimer();
  localCrunchElapsedSeconds.value = 0;
  localCrunchTimer = window.setInterval(() => {
    localCrunchElapsedSeconds.value += 1;
  }, 1000);
};

const resetLocalCrunchState = () => {
  stopLocalCrunchTimer();
  localCrunchStatus.value = "Idle";
  localCrunchStep.value = "Queued";
  localCrunchDetail.value = "";
  localCrunchElapsedSeconds.value = 0;
};

const handleAiProgress = (progress: AiAssistantProgress) => {
  aiAssistantProgress.value = progress;

  if (progress.busy) {
    showProgressModal.value = true;
    showAiErrorModal.value = false;
    return;
  }

  if (progress.errorMessage.trim()) {
    showProgressModal.value = true;
    showAiErrorModal.value = true;
    return;
  }

  if (!isPreparingDraft.value) {
    showProgressModal.value = false;
    showAiErrorModal.value = false;
  }
};

const handleProgressModalCancel = async () => {
  if (!activeProgressModalState.value?.canCancel) {
    return;
  }

  await aiAssistantRef.value?.cancelGeneration?.();
};

const handleProgressModalClose = () => {
  showProgressModal.value = false;
  showAiErrorModal.value = false;
};

const setDraftPreparationStep = (value: string) => {
  draftPreparationStep.value = value;
  localCrunchStatus.value = "Crunching samples";
  localCrunchStep.value = value || "Queued";
  localCrunchDetail.value = draftPreparationDetail(value);
};

const seedTargetSchemaPreview = () => {
  if (!pipeline.value.target.format) {
    pipeline.value.targetSchema = undefined;
    return;
  }

  pipeline.value.targetSchema = sampleOutput.value.trim()
    ? (inferSchemaFromSample(
        pipeline.value.target.format,
        sampleOutput.value,
      ) ?? createEmptySchema(pipeline.value.target.format))
    : createEmptySchema(pipeline.value.target.format);
};

const prepareDraftFromSamples = async (
  force = false,
  requestId = prepareDraftRequestId,
) => {
  const isStale = () => requestId !== prepareDraftRequestId || currentStep.value !== 3;
  const signature = generationSignature.value;
  if (!force && lastPreparedSignature.value === signature) {
    return;
  }
  lastPreparedSignature.value = signature;
  resetAiSummary();

  if (!pipeline.value.target.format) {
    localMatchResolutions.value = [];
    pipeline.value.mapping.rowDriverPath = undefined;
    return;
  }

  seedTargetSchemaPreview();

  setDraftPreparationStep("Inferring target schema");
  await yieldToBrowser();
  if (isStale()) {
    return;
  }

  setDraftPreparationStep("Inferring source fields");
  await yieldToBrowser();
  if (isStale()) {
    return;
  }
  const currentSourceFields = sourceFields.value;
  const targetPaths = flattenSchemaLeafPaths(pipeline.value.targetSchema?.fields);
  const targetFieldOptions = flattenSchemaLeafOptions(
    pipeline.value.targetSchema?.fields,
  );
  const nextMappings: FieldMapping[] = [];

  setDraftPreparationStep("Ranking local matches");
  await yieldToBrowser();
  if (isStale()) {
    return;
  }
  const nextResolutions = rankTargetMatches(currentSourceFields, targetFieldOptions);

  applyDeterministicMappings(nextMappings, currentSourceFields, targetPaths);
  applyHighConfidenceSuggestedMappings(
    nextMappings,
    currentSourceFields,
    targetFieldOptions,
  );
  localMatchResolutions.value = nextResolutions;

  setDraftPreparationStep("Inferring repeat behavior");
  await yieldToBrowser();
  if (isStale()) {
    return;
  }
  inferRepeatModesFromSamples({
    mappings: nextMappings,
    sourceFields: currentSourceFields,
    sourceFormat: pipeline.value.source.format,
    samplePayload: samplePayload.value,
    targetFormat: pipeline.value.target.format,
    sampleOutput: sampleOutput.value,
  });
  pipeline.value.mapping.rowDriverPath = inferRowDriverPathFromSamples({
    mappings: nextMappings,
    sourceFields: currentSourceFields,
    sourceFormat: pipeline.value.source.format,
    samplePayload: samplePayload.value,
    targetFormat: pipeline.value.target.format,
    sampleOutput: sampleOutput.value,
  });
  pipeline.value.mapping.fields = nextMappings;

  setDraftPreparationStep("Finalizing draft");
  await yieldToBrowser();
  if (isStale()) {
    return;
  }
  const nextSuggestedTargets = nextResolutions.filter(
    (resolution) =>
      resolution.bucket === "suggested" &&
      !nextMappings.some((mapping) => mapping.to === resolution.target),
  );
  const nextUnsupportedTargets = nextResolutions.filter(
    (resolution) =>
      resolution.bucket === "unsupported" &&
      !nextMappings.some((mapping) => mapping.to === resolution.target),
  );
  if (
    sampleOutput.value.trim() &&
    targetPaths.length > 0 &&
    nextSuggestedTargets.length === 0
  ) {
    aiSummary.value =
      nextUnsupportedTargets.length === 0
        ? `Resolved all ${targetPaths.length} target fields locally with deterministic and structural matching.`
        : `Applied ${nextMappings.length} safe local mappings and left ${nextUnsupportedTargets.length} unsupported targets out of the AI fallback.`;
  }
};

const yieldToBrowser = async () => {
  await nextTick();
  await Promise.resolve();
  if (
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function" &&
    !/jsdom/i.test(window.navigator.userAgent)
  ) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }
};

const scheduleDraftPreparation = (force = false) => {
  const requestId = ++prepareDraftRequestId;
  seedTargetSchemaPreview();
  isPreparingDraft.value = true;
  showProgressModal.value = true;
  showAiErrorModal.value = false;
  resetLocalCrunchState();
  localCrunchStatus.value = "Crunching samples";
  localCrunchStep.value = "Queued";
  localCrunchDetail.value = draftPreparationDetail("");
  startLocalCrunchTimer();

  const promise = (async () => {
    await yieldToBrowser();
    if (requestId !== prepareDraftRequestId || currentStep.value !== 3) {
      return;
    }
    await prepareDraftFromSamples(force, requestId);
    if (requestId !== prepareDraftRequestId || currentStep.value !== 3) {
      return;
    }

    isPreparingDraft.value = false;
    draftPreparationStep.value = "";
    stopLocalCrunchTimer();
    showProgressModal.value = false;
  })().finally(() => {
    if (requestId === prepareDraftRequestId) {
      isPreparingDraft.value = false;
      draftPreparationStep.value = "";
      stopLocalCrunchTimer();
    }
    if (activePreparePromise === promise) {
      activePreparePromise = null;
    }
  });

  activePreparePromise = promise;
  return promise;
};

watch(
  () => currentStep.value,
  (step) => {
    furthestVisitedStep.value = Math.max(furthestVisitedStep.value, step);

    if (step === 3) {
      aiAssistantProgress.value = null;
      showAiErrorModal.value = false;
      void scheduleDraftPreparation();
      return;
    }

    prepareDraftRequestId += 1;
    isPreparingDraft.value = false;
    draftPreparationStep.value = "";
    showProgressModal.value = false;
    showAiErrorModal.value = false;
    aiAssistantProgress.value = null;
    resetLocalCrunchState();
  },
);

watch(
  generationSignature,
  () => {
    if (currentStep.value === 3) {
      void scheduleDraftPreparation(true);
    }
  },
);

const nextStep = () => {
  if (!isStepValid.value || currentStep.value >= steps.length - 1) {
    return;
  }
  currentStep.value += 1;
};

const previousStep = () => {
  if (currentStep.value === 0) {
    return;
  }
  currentStep.value -= 1;
};

const completeWizard = async () => {
  if (!pipeline.value.source.type || !pipeline.value.source.format) {
    currentStep.value = 1;
    return;
  }
  if (!pipeline.value.target.type || !pipeline.value.target.format) {
    currentStep.value = 2;
    return;
  }

  if (activePreparePromise) {
    await activePreparePromise;
  } else {
    await prepareDraftFromSamples();
  }

  if (pipeline.value.source.type !== "http") {
    delete targetConfig.value.responseMode;
  }

  emit("complete");
};
</script>

<template>
  <section class="panel overflow-hidden">
    <GenerationProgressModal
      v-if="activeProgressModalState"
      visible
      :title="activeProgressModalState.title"
      :status="activeProgressModalState.status"
      :step="activeProgressModalState.step"
      :elapsed-label="activeProgressModalState.elapsedLabel"
      :detail="activeProgressModalState.detail"
      :response-text="activeProgressModalState.responseText"
      :words-received="activeProgressModalState.wordsReceived"
      :model-label="activeProgressModalState.modelLabel"
      :scope-label="activeProgressModalState.scopeLabel"
      :error-message="activeProgressModalState.errorMessage"
      :can-cancel="activeProgressModalState.canCancel"
      @cancel="handleProgressModalCancel"
      @close="handleProgressModalClose"
    />

    <div
      class="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_34%),linear-gradient(180deg,_#ffffff,_#eff6ff)] p-6"
    >
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="panel-title">New pipeline wizard</p>
          <h3 class="mt-3 text-2xl font-semibold text-slate-900">
            {{ currentDefinition.heading }}
          </h3>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {{ currentDefinition.detail }}
          </p>
        </div>
        <div class="rounded-2xl border border-sky-100 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm">
          Step {{ currentStep + 1 }} of {{ steps.length }}
        </div>
      </div>

      <div class="mt-6 grid gap-3 md:grid-cols-4">
        <button
          v-for="(step, index) in steps"
          :key="step.label"
          :data-testid="`wizard-step-button-${index}`"
          class="rounded-2xl border px-4 py-3 text-left transition"
          :class="
            index === currentStep
              ? 'border-sky-500 bg-sky-500 text-white shadow-lg shadow-sky-500/20'
              : index > furthestVisitedStep
                ? 'cursor-not-allowed border-slate-100 bg-slate-100/80 text-slate-400 opacity-70'
              : index < currentStep
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white'
          "
          type="button"
          :disabled="!canVisitStep(index)"
          @click="goToStep(index)"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.22em]">
            {{ step.label }}
          </p>
          <p class="mt-2 text-sm font-medium">
            {{ step.heading }}
          </p>
        </button>
      </div>
    </div>

    <div class="p-6">
      <div v-if="currentStep === 0" class="grid gap-4 xl:grid-cols-[1fr,1fr,1.3fr]">
        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>Pipeline name</span>
          <input
            v-model="pipeline.pipeline.name"
            data-testid="wizard-name-input"
            class="input"
            placeholder="Claims intake to CSV"
          />
        </label>
        <label class="space-y-2 text-sm font-medium text-slate-700">
          <span>Pipeline ID</span>
          <input
            :value="pipeline.pipeline.id"
            data-testid="wizard-id-input"
            class="input"
            placeholder="claims-intake-to-csv"
            @input="handleIdInput"
          />
        </label>
        <label class="space-y-2 text-sm font-medium text-slate-700 xl:row-span-2">
          <span>Description</span>
          <textarea
            v-model="pipeline.pipeline.description"
            class="input min-h-32"
            placeholder="Optional operator-facing summary of what this flow does."
          />
        </label>
        <div class="rounded-3xl border border-sky-100 bg-sky-50/80 p-4 text-sm leading-6 text-slate-600 xl:col-span-2">
          Give the flow a clear business name first. PipeWeaver keeps the ID editable, but it starts from the name so the saved endpoint and pipeline key are predictable.
        </div>
      </div>

      <div v-else-if="currentStep === 1" class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2">
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Source connector</span>
            <AppSelect
              v-model="pipeline.source.type"
              :options="connectorTypes"
              placeholder="Select a source connector"
            />
          </label>
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Source format</span>
            <AppSelect
              v-model="pipeline.source.format"
              :options="formatOptions"
              placeholder="Select a source format"
            />
          </label>
        </div>

        <div
          v-if="pipeline.source.format === 'xml'"
          class="rounded-3xl border border-sky-100 bg-sky-50/70 p-5"
        >
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Repeated XML elements default</span>
            <AppSelect v-model="xmlRepeatMode" :options="xmlRepeatModeOptions" />
            <p class="text-xs leading-5 text-slate-500">
              Use `Preserve arrays` when tabular outputs should keep one row per
              source record. Use `Explode rows` when repeated XML elements
              should fan out into multiple output rows by default.
            </p>
          </label>
        </div>

        <SamplePayloadEditor
          v-model="samplePayload"
          :format="pipeline.source.format"
          @detected-format="handleDetectedSourceFormat"
        />
      </div>

      <div v-else-if="currentStep === 2" class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2">
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Target connector</span>
            <AppSelect
              v-model="pipeline.target.type"
              :options="connectorTypes"
              placeholder="Select a target connector"
            />
          </label>
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Target format</span>
            <AppSelect
              v-model="pipeline.target.format"
              :options="formatOptions"
              placeholder="Select a target format"
            />
          </label>
        </div>

        <div
          v-if="pipeline.source.type === 'http'"
          class="rounded-3xl border border-sky-100 bg-sky-50/70 p-5"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="panel-title text-sky-700">Inline HTTP reply</p>
              <p class="mt-2 text-sm leading-6 text-sky-900">
                When this pipeline runs through the generated HTTP endpoint, return the transformed payload on the same request instead of only previewing it.
              </p>
            </div>
            <label class="inline-flex items-center gap-2 text-sm font-medium text-sky-900">
              <input
                v-model="replyInlineEnabled"
                type="checkbox"
                class="h-4 w-4 rounded border-sky-300 text-sky-500 focus:ring-sky-200"
              />
              Reply inline
            </label>
          </div>
        </div>

        <div class="rounded-3xl border border-sky-100 bg-sky-50/70 p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="panel-title text-sky-700">Null output handling</p>
              <p class="mt-2 text-sm leading-6 text-sky-900">
                Leave null or missing values blank in CSV, TSV, or pipe output and omit them from JSON or XML output instead of rendering placeholder nil text.
              </p>
            </div>
            <label class="inline-flex items-center gap-2 text-sm font-medium text-sky-900">
              <input
                v-model="omitNullValuesEnabled"
                type="checkbox"
                class="h-4 w-4 rounded border-sky-300 text-sky-500 focus:ring-sky-200"
              />
              Omit nulls
            </label>
          </div>
        </div>

        <SamplePayloadEditor
          v-model="sampleOutput"
          :format="pipeline.target.format"
          title="Sample output"
          description="Use a representative target payload when you want the target schema inferred deterministically before AI fills in the mappings."
          drop-hint="Drag a `.json`, `.xml`, `.csv`, or text file onto this card to load the expected output shape into the wizard."
          idle-badge="Expected response body"
          @detected-format="handleDetectedTargetFormat"
        />

        <div
          v-if="targetFormatMismatch"
          class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          The dropped sample output looks like {{ detectedTargetFormat }}, but the target format is currently set to {{ pipeline.target.format }}. PipeWeaver will use the target format you selected most recently.
        </div>
      </div>

      <div v-else class="space-y-6">
        <div class="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
          <div class="space-y-4">
            <div class="rounded-3xl border border-sky-100 bg-sky-50/70 p-5">
              <p class="panel-title text-sky-700">Prepared draft</p>
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <div class="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Target schema</p>
                  <p class="mt-2 font-semibold text-slate-900">
                    {{ targetSampleLocksSchema ? 'Locked from sample output' : 'AI may draft the schema' }}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Auto-applied</p>
                  <p class="mt-2 font-semibold text-slate-900">
                    {{
                      isPreparingDraft
                        ? "Working..."
                        : `${pipeline.mapping.fields.length} mapping${pipeline.mapping.fields.length === 1 ? '' : 's'} pre-wired`
                    }}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Likely suggestions</p>
                  <p class="mt-2 font-semibold text-slate-900">
                    {{ isPreparingDraft ? "..." : suggestedResolutionCards.length }}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Unsupported targets</p>
                  <p class="mt-2 font-semibold text-slate-900">
                    {{ isPreparingDraft ? "..." : unsupportedResolutions.length }}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Row driver</p>
                  <div
                    v-if="supportsRowDriverSelection && rowDriverOptions.length"
                    class="mt-2 space-y-2"
                  >
                    <AppSelect
                      v-model="rowDriverSelection"
                      data-testid="wizard-row-driver-select"
                      :options="rowDriverSelectOptions"
                    />
                    <p class="text-xs leading-5 text-slate-500">
                      Pick the repeated XML branch that should define one emitted
                      row. Branches already used by the draft mappings are listed
                      first.
                    </p>
                  </div>
                  <p
                    v-else
                    class="mt-2 break-all font-semibold text-slate-900"
                  >
                    {{ rowDriverPath || 'None' }}
                  </p>
                </div>
              </div>
              <p class="mt-4 text-sm leading-6 text-slate-600">
                {{ wizardSummaryText }}
              </p>
            </div>

            <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <label class="space-y-3 text-sm font-medium text-slate-700">
                <span>Data context for AI</span>
                <textarea
                  v-model="pipeline.pipeline.aiContext"
                  data-testid="wizard-ai-context-input"
                  class="input min-h-28"
                  placeholder="Optional domain context for acronyms, row meaning, code systems, units, or business rules."
                />
                <p class="text-xs leading-5 text-slate-500">
                  This only helps the AI reason about the translation. Example:
                  “Source rows are healthcare claims. One output row is one
                  diagnosis line. NPI is provider ID and CPT codes are procedure
                  codes.”
                </p>
              </label>
            </div>

            <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="panel-title">Generation summary</p>
                  <p class="mt-2 text-sm leading-6 text-slate-600">
                    Description:
                    <span class="font-medium text-slate-900">
                      {{
                        pipeline.pipeline.description?.trim()
                          ? "Ready"
                          : "Still blank"
                      }}
                    </span>
                  </p>
                  <p class="mt-2 text-sm leading-6 text-slate-600">
                    Target fields:
                    <span class="font-medium text-slate-900">
                      {{ targetPaths.length }}
                    </span>
                  </p>
                  <p class="mt-2 text-sm leading-6 text-slate-600">
                    Locked schema:
                    <span class="font-medium text-slate-900">
                      {{ targetSampleLocksSchema ? "Yes" : "No" }}
                    </span>
                  </p>
                </div>
                <button
                  v-if="aiRawDraft"
                  type="button"
                  class="button-secondary"
                  @click="showRawAiDraft = !showRawAiDraft"
                >
                  {{ showRawAiDraft ? "Hide raw AI draft" : "Show raw AI draft" }}
                </button>
              </div>

              <div
                v-if="showRawAiDraft && aiRawDraft"
                class="mt-4 overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-sky-100"
              >
                <pre class="whitespace-pre-wrap">{{ aiRawDraft }}</pre>
              </div>

              <p v-else class="mt-4 text-sm leading-6 text-slate-600">
                {{
                  aiRawDraft
                    ? "The structured draft has already been applied to the pipeline. Open the raw AI draft only when you need to inspect the exact generated JSON."
                    : "Generate from samples to let the local model refine only the plausible unresolved targets. Unsupported targets stay out of the AI request."
                }}
              </p>
            </div>

            <div
              v-if="suggestedResolutions.length"
              class="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm"
            >
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p class="panel-title text-sky-700">Likely local matches</p>
                  <p class="mt-2 text-sm leading-6 text-slate-600">
                    PipeWeaver found strong structural candidates for these targets, but left them for review instead of auto-applying them.
                  </p>
                </div>
                <div class="flex w-full max-w-lg flex-col gap-3 lg:items-end">
                  <label class="w-full space-y-2 text-sm font-medium text-slate-700">
                    <span class="sr-only">Search likely local matches</span>
                    <input
                      v-model="suggestedSearch"
                      data-testid="wizard-suggested-search"
                      class="input"
                      placeholder="Search likely matches"
                    />
                  </label>
                  <button
                    type="button"
                    class="button-secondary"
                    data-testid="wizard-apply-likely-button"
                    :disabled="!filteredSuggestedResolutionCards.length"
                    @click="applyAllSuggestedResolutions"
                  >
                    Apply likely matches
                  </button>
                </div>
              </div>

              <div
                v-if="filteredSuggestedResolutionCards.length"
                class="mt-4 max-h-96 space-y-3 overflow-auto pr-1"
              >
                <div
                  v-for="card in filteredSuggestedResolutionCards"
                  :key="card.resolution.target"
                  data-testid="wizard-suggested-card"
                  :data-target-path="card.resolution.target"
                  class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-slate-900">
                        {{ card.resolution.target }}
                      </p>
                      <p class="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                        Best local candidate
                      </p>
                      <p class="mt-1 break-all text-sm text-slate-700">
                        {{ card.suggestedSource || "No candidate" }}
                      </p>
                      <div class="mt-3 grid gap-3 sm:grid-cols-2">
                        <div class="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Source sample
                          </p>
                          <p class="mt-1 text-sm text-slate-700">
                            {{ card.sourceSamplePreview }}
                          </p>
                        </div>
                        <div class="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Target sample
                          </p>
                          <p class="mt-1 text-sm text-slate-700">
                            {{ card.targetSamplePreview }}
                          </p>
                        </div>
                      </div>
                      <div
                        v-if="suggestedMatchReviews[card.resolution.target]"
                        data-testid="wizard-suggested-review"
                        :data-target-path="card.resolution.target"
                        :data-approved="
                          String(suggestedMatchReviews[card.resolution.target].approved)
                        "
                        class="mt-3 rounded-2xl border px-3 py-3"
                        :class="
                          suggestedMatchReviews[card.resolution.target].approved
                            ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
                            : 'border-amber-200 bg-amber-50/90 text-amber-950'
                        "
                      >
                        <div class="flex flex-wrap items-center gap-2">
                          <span
                            class="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                            :class="
                              suggestedMatchReviews[card.resolution.target].approved
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            "
                          >
                            {{
                              suggestedMatchReviews[card.resolution.target].approved
                                ? "AI approved local match"
                                : "AI flagged local match"
                            }}
                          </span>
                          <span class="text-xs font-semibold uppercase tracking-[0.18em]">
                            {{
                              suggestedMatchReviews[
                                card.resolution.target
                              ].confidence
                            }}
                            confidence
                          </span>
                        </div>
                        <p class="mt-2 text-sm font-semibold">
                          {{ suggestedMatchReviews[card.resolution.target].summary }}
                        </p>
                        <p class="mt-2 text-sm leading-6">
                          {{
                            suggestedMatchReviews[card.resolution.target]
                              .rationale
                          }}
                        </p>
                      </div>
                    </div>
                    <div class="flex flex-col gap-2">
                      <button
                        type="button"
                        class="button-secondary whitespace-nowrap"
                        data-testid="wizard-ask-ai-suggested-button"
                        :data-target-path="card.resolution.target"
                        :disabled="aiAssistantBusy"
                        @click="requestAiSuggestedResolution(card.resolution.target)"
                      >
                        {{ askAiSuggestedLabel(card.resolution.target) }}
                      </button>
                      <button
                        type="button"
                        class="button-secondary whitespace-nowrap"
                        data-testid="wizard-apply-suggested-button"
                        :data-target-path="card.resolution.target"
                        @click="applySuggestedResolution(card.resolution)"
                      >
                        {{ applySuggestedLabel(card.resolution.target) }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <p
                v-else
                data-testid="wizard-suggested-empty-state"
                class="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500"
              >
                No likely matches match the current search.
              </p>
            </div>

            <div
              v-if="unsupportedResolutions.length"
              class="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm"
            >
              <p class="panel-title">Weak or Missing Source Evidence</p>
              <p class="mt-2 text-sm leading-6 text-slate-600">
                {{
                  unsupportedResolutions.length
                }}
                target{{ unsupportedResolutions.length === 1 ? "" : "s" }} do not have a strong local source candidate. The wizard keeps them out of the AI fallback instead of asking the model to guess.
              </p>
            </div>
          </div>

          <PipelineAiAssistant
            v-if="showAiFallback"
            ref="aiAssistantRef"
            v-model:pipeline="pipeline"
            :sample-payload="samplePayload"
            :sample-output="sampleOutput"
            :auto-apply-structured="true"
            :hide-apply-actions="true"
            :lock-target-schema="targetSampleLocksSchema"
            :forced-mode="targetSampleLocksSchema ? 'mapping' : undefined"
            :default-model-id="wizardDefaultModelId"
            :hide-prompt-editors="true"
            :hide-summary-panel="true"
            :hide-status-panel="true"
            :hide-response-editor="true"
            generate-label="Generate from samples"
            @generated="handleAiGenerated"
            @progress="handleAiProgress"
          />
          <div
            v-else
            class="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-6 text-sm leading-6 text-emerald-950 shadow-sm"
          >
            <p class="panel-title text-emerald-700">AI fallback not needed</p>
            <p class="mt-3">
              {{
                unsupportedResolutions.length
                  ? "The sample output already defined the target contract. PipeWeaver kept the unsupported targets out of the model request and only used the safe local draft."
                  : "The sample output already defined the target contract, and the local matcher resolved every target field without calling the model."
              }}
            </p>
            <p class="mt-3">
              Open the full editor if you want to inspect or adjust the generated mappings.
            </p>
          </div>
        </div>
      </div>

      <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6">
        <button
          class="button-secondary"
          type="button"
          :disabled="currentStep === 0"
          @click="previousStep"
        >
          Back
        </button>

        <div class="flex flex-wrap gap-3">
          <button
            v-if="currentStep < steps.length - 1"
            data-testid="wizard-next-button"
            class="button-primary"
            type="button"
            :disabled="!isStepValid"
            @click="nextStep"
          >
            Next
          </button>
          <button
            v-else
            data-testid="wizard-complete-button"
            class="button-primary"
            type="button"
            :disabled="isPreparingDraft || aiAssistantBusy"
            @click="completeWizard"
          >
            Open full editor
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
