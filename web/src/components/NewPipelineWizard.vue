<script setup lang="ts">
import { computed, ref, watch } from "vue";
import PipelineAiAssistant from "./PipelineAiAssistant.vue";
import SamplePayloadEditor from "./SamplePayloadEditor.vue";
import {
  applyHighConfidenceSuggestedMappings,
  applyDeterministicMappings,
  createEmptySchema,
  flattenSchemaLeafOptions,
  flattenSchemaLeafPaths,
  inferRepeatModesFromSamples,
  inferSchemaFromSample,
  inferSourceFields,
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
    detail: "PipeWeaver will pre-wire deterministic matches first, then use the local copilot to finish the obvious mappings and polish the description.",
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

const unresolvedTargets = computed(() =>
  targetPaths.value.filter(
    (path) => !pipeline.value.mapping.fields.some((mapping) => mapping.to === path),
  ),
);

const explodedMappings = computed(() =>
  pipeline.value.mapping.fields.filter((mapping) => mapping.repeatMode === "explode"),
);

const wizardSummaryText = computed(() => {
  if (aiSummary.value.trim()) {
    return aiSummary.value;
  }

  return targetSampleLocksSchema.value
    ? "The target schema is already grounded by the sample output. Generate from samples to let the local copilot fill unresolved mappings and polish the description."
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

const prepareDraftFromSamples = (force = false) => {
  const signature = generationSignature.value;
  if (!force && lastPreparedSignature.value === signature) {
    return;
  }
  lastPreparedSignature.value = signature;
  resetAiSummary();

  if (!pipeline.value.target.format) {
    return;
  }

  pipeline.value.targetSchema = sampleOutput.value.trim()
    ? (inferSchemaFromSample(
        pipeline.value.target.format,
        sampleOutput.value,
      ) ?? createEmptySchema(pipeline.value.target.format))
    : createEmptySchema(pipeline.value.target.format);

  const sourceFields = inferSourceFields(
    pipeline.value.source.format,
    samplePayload.value,
  );
  const targetPaths = flattenSchemaLeafPaths(pipeline.value.targetSchema?.fields);
  const targetFieldOptions = flattenSchemaLeafOptions(
    pipeline.value.targetSchema?.fields,
  );
  const nextMappings: FieldMapping[] = [];

  applyDeterministicMappings(nextMappings, sourceFields, targetPaths);
  applyHighConfidenceSuggestedMappings(
    nextMappings,
    sourceFields,
    targetFieldOptions,
  );
  inferRepeatModesFromSamples({
    mappings: nextMappings,
    sourceFields,
    sourceFormat: pipeline.value.source.format,
    samplePayload: samplePayload.value,
    targetFormat: pipeline.value.target.format,
    sampleOutput: sampleOutput.value,
  });
  pipeline.value.mapping.fields = nextMappings;
};

watch(
  () => currentStep.value,
  (step) => {
    if (step === 3) {
      prepareDraftFromSamples();
    }
  },
);

watch(
  generationSignature,
  () => {
    if (currentStep.value === 3) {
      prepareDraftFromSamples(true);
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

const completeWizard = () => {
  if (!pipeline.value.source.type || !pipeline.value.source.format) {
    currentStep.value = 1;
    return;
  }
  if (!pipeline.value.target.type || !pipeline.value.target.format) {
    currentStep.value = 2;
    return;
  }

  prepareDraftFromSamples();

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
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Deterministic matches</p>
                  <p class="mt-2 font-semibold text-slate-900">
                    {{ pipeline.mapping.fields.length }} mapping{{ pipeline.mapping.fields.length === 1 ? '' : 's' }} pre-wired
                  </p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Unresolved targets</p>
                  <p class="mt-2 font-semibold text-slate-900">
                    {{ unresolvedTargets.length }}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Exploded fields</p>
                  <p class="mt-2 font-semibold text-slate-900">
                    {{ explodedMappings.length ? explodedMappings.map((mapping) => mapping.to).join(', ') : 'None' }}
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
                    : "Generate from samples to let the local model refine the deterministic draft. The wizard will apply the usable result automatically."
                }}
              </p>
            </div>
          </div>

          <PipelineAiAssistant
            v-model:pipeline="pipeline"
            :sample-payload="samplePayload"
            :sample-output="sampleOutput"
            :auto-apply-structured="true"
            :hide-apply-actions="true"
            :lock-target-schema="targetSampleLocksSchema"
            :hide-prompt-editors="true"
            :hide-summary-panel="true"
            :hide-response-editor="true"
            generate-label="Generate from samples"
            @generated="handleAiGenerated"
          />
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
            @click="completeWizard"
          >
            Open full editor
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
