<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
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
  rankTargetMatches,
  type TargetMatchResolution,
} from "../lib/schema";
import type { AiDraftMode, AiDraftResponse } from "../lib/ai";
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
const currentStep = ref(0);
const idEditedManually = ref(false);
const detectedTargetFormat = ref("");
const lastPreparedSignature = ref("");
const aiSummary = ref("");
const aiRawDraft = ref("");
const showRawAiDraft = ref(false);
const isPreparingDraft = ref(false);
const localMatchResolutions = ref<TargetMatchResolution[]>([]);
const draftPreparationStep = ref("");

let prepareDraftRequestId = 0;
let activePreparePromise: Promise<void> | null = null;

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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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

const suggestedResolutionCards = computed(() =>
  {
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
  },
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

const rowDriverPath = computed(() => pipeline.value.mapping.rowDriverPath);

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
};

const applyAllSuggestedResolutions = () => {
  suggestedResolutions.value.forEach((resolution) => {
    applySuggestedResolution(resolution);
  });
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

const setDraftPreparationStep = (value: string) => {
  draftPreparationStep.value = value;
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
  const sourceFields = inferSourceFields(
    pipeline.value.source.format,
    samplePayload.value,
  );
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
  const nextResolutions = rankTargetMatches(sourceFields, targetFieldOptions);

  applyDeterministicMappings(nextMappings, sourceFields, targetPaths);
  applyHighConfidenceSuggestedMappings(
    nextMappings,
    sourceFields,
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
    sourceFields,
    sourceFormat: pipeline.value.source.format,
    samplePayload: samplePayload.value,
    targetFormat: pipeline.value.target.format,
    sampleOutput: sampleOutput.value,
  });
  pipeline.value.mapping.rowDriverPath = inferRowDriverPathFromSamples({
    mappings: nextMappings,
    sourceFields,
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

  const promise = (async () => {
    await yieldToBrowser();
    if (requestId !== prepareDraftRequestId || currentStep.value !== 3) {
      return;
    }
    await prepareDraftFromSamples(force, requestId);
  })().finally(() => {
    if (requestId === prepareDraftRequestId) {
      isPreparingDraft.value = false;
      draftPreparationStep.value = "";
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
    if (step === 3) {
      void scheduleDraftPreparation();
      return;
    }

    prepareDraftRequestId += 1;
    isPreparingDraft.value = false;
    draftPreparationStep.value = "";
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
          class="rounded-2xl border px-4 py-3 text-left transition"
          :class="
            index === currentStep
              ? 'border-sky-500 bg-sky-500 text-white shadow-lg shadow-sky-500/20'
              : index < currentStep
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white/80 text-slate-700'
          "
          type="button"
          @click="currentStep = index"
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
            <select v-model="pipeline.source.type" class="input">
              <option value="" disabled>Select a source connector</option>
              <option v-for="option in connectorTypes" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </label>
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Source format</span>
            <select v-model="pipeline.source.format" class="input">
              <option value="" disabled>Select a source format</option>
              <option v-for="option in formatOptions" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </label>
        </div>

        <div
          v-if="pipeline.source.format === 'xml'"
          class="rounded-3xl border border-sky-100 bg-sky-50/70 p-5"
        >
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Repeated XML elements default</span>
            <select v-model="xmlRepeatMode" class="input">
              <option value="preserve">Preserve arrays</option>
              <option value="explode">Explode rows</option>
            </select>
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
            <select v-model="pipeline.target.type" class="input">
              <option value="" disabled>Select a target connector</option>
              <option v-for="option in connectorTypes" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </label>
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Target format</span>
            <select v-model="pipeline.target.format" class="input">
              <option value="" disabled>Select a target format</option>
              <option v-for="option in formatOptions" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
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
                  <p class="mt-2 break-all font-semibold text-slate-900">
                    {{ rowDriverPath || 'None' }}
                  </p>
                </div>
              </div>
              <p class="mt-4 text-sm leading-6 text-slate-600">
                {{ wizardSummaryText }}
              </p>
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
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="panel-title text-sky-700">Likely local matches</p>
                  <p class="mt-2 text-sm leading-6 text-slate-600">
                    PipeWeaver found strong structural candidates for these targets, but left them for review instead of auto-applying them.
                  </p>
                </div>
                <button
                  type="button"
                  class="button-secondary"
                  data-testid="wizard-apply-likely-button"
                  @click="applyAllSuggestedResolutions"
                >
                  Apply likely matches
                </button>
              </div>

              <div class="mt-4 max-h-96 space-y-3 overflow-auto pr-1">
                <div
                  v-for="card in suggestedResolutionCards"
                  :key="card.resolution.target"
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
                    </div>
                    <button
                      type="button"
                      class="button-secondary whitespace-nowrap"
                      data-testid="wizard-apply-suggested-button"
                      @click="applySuggestedResolution(card.resolution)"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
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

          <div
            v-if="isPreparingDraft"
            class="rounded-3xl border border-sky-200 bg-sky-50/80 p-6 text-sm leading-6 text-sky-950 shadow-sm"
          >
            <p class="panel-title text-sky-700">Preparing local draft</p>
            <p class="mt-3">
              PipeWeaver is analyzing the dropped source and target samples before deciding whether the AI fallback is needed.
            </p>
            <p class="mt-3 text-sm font-medium text-sky-900">
              Matching status:
              <span class="font-semibold">
                {{ draftPreparationStep || "Queued" }}
              </span>
            </p>
          </div>
          <PipelineAiAssistant
            v-else-if="showAiFallback"
            v-model:pipeline="pipeline"
            :sample-payload="samplePayload"
            :sample-output="sampleOutput"
            :auto-apply-structured="true"
            :hide-apply-actions="true"
            :lock-target-schema="targetSampleLocksSchema"
            :forced-mode="targetSampleLocksSchema ? 'mapping' : undefined"
            :hide-prompt-editors="true"
            :hide-summary-panel="true"
            :hide-response-editor="true"
            generate-label="Generate from samples"
            @generated="handleAiGenerated"
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
            :disabled="isPreparingDraft"
            @click="completeWizard"
          >
            Open full editor
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
