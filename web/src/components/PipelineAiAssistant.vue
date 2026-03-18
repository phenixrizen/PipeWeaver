<script setup lang="ts">
import { computed, ref, watch } from "vue";
import MonacoCodeEditor from "./MonacoCodeEditor.vue";
import {
  aiModeLabels,
  aiModelOptions,
  buildAiPrompt,
  defaultAiInstruction,
  parseAiResponse,
  type AiDraftMode,
  type AiDraftResponse,
} from "../lib/ai";
import type { PipelineDefinition } from "../types/pipeline";

const pipeline = defineModel<PipelineDefinition>("pipeline", {
  required: true,
});
const props = defineProps<{ samplePayload: string }>();

const selectedModel = ref(aiModelOptions[0].id);
const selectedMode = ref<AiDraftMode>("studio");
const instructionText = ref(defaultAiInstruction(selectedMode.value));
const requestPreview = ref("");
const responseText = ref("");
const summary = ref("");
const loadStatus = ref("Idle");
const progressText = ref("");
const errorMessage = ref("");
const isModelReady = ref(false);
const isBusy = ref(false);
const parsedResponse = ref<AiDraftResponse | null>(null);

let engine:
  | {
      modelId: string;
      instance: {
        chat: {
          completions: {
            create: (request: {
              messages: { role: "system" | "user"; content: string }[];
              temperature: number;
              max_tokens: number;
              response_format: { type: "json_object" };
            }) => Promise<{
              choices: { message: { content?: string | null } }[];
            }>;
          };
        };
      };
    }
  | undefined;

const canUseWebGpu = computed(
  () => typeof navigator !== "undefined" && "gpu" in navigator,
);

const resetResponse = () => {
  responseText.value = "";
  summary.value = "";
  parsedResponse.value = null;
  errorMessage.value = "";
};

watch(selectedMode, (mode) => {
  instructionText.value = defaultAiInstruction(mode);
  resetResponse();
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
    loadStatus.value = "Ready";
    return;
  }

  isBusy.value = true;
  loadStatus.value = "Loading model";
  progressText.value = "Preparing local inference engine…";

  try {
    const webllm = await import("@mlc-ai/web-llm");
    const instance = await webllm.CreateMLCEngine(selectedModel.value, {
      initProgressCallback(progress) {
        progressText.value =
          typeof progress.text === "string" && progress.text.length > 0
            ? progress.text
            : `Loading ${(progress.progress ?? 0) * 100}%`;
      },
    });

    engine = { modelId: selectedModel.value, instance };
    isModelReady.value = true;
    loadStatus.value = "Ready";
    progressText.value = "Model cached in this browser session.";
  } catch (error) {
    isModelReady.value = false;
    loadStatus.value = "Load failed";
    errorMessage.value =
      error instanceof Error ? error.message : "Failed to load WebLLM model.";
  } finally {
    isBusy.value = false;
  }
};

const generateDraft = async () => {
  resetResponse();
  requestPreview.value = buildAiPrompt({
    mode: selectedMode.value,
    pipeline: pipeline.value,
    samplePayload: props.samplePayload,
    authorPrompt: instructionText.value,
  });

  if (!isModelReady.value) {
    await loadModel();
  }

  if (!engine) {
    return;
  }

  isBusy.value = true;
  loadStatus.value = "Generating";

  try {
    const completion = await engine.instance.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are PipeWeaver Studio AI. Produce practical mapping drafts for ETL operators and always return valid JSON.",
        },
        {
          role: "user",
          content: requestPreview.value,
        },
      ],
      max_tokens: 1200,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    responseText.value = completion.choices[0]?.message.content?.trim() ?? "";
    parsedResponse.value = parseAiResponse(responseText.value);
    summary.value = parsedResponse.value.summary;
    loadStatus.value = "Draft ready";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "AI generation failed.";
    loadStatus.value = "Generation failed";
  } finally {
    isBusy.value = false;
  }
};

const applyDescription = () => {
  if (parsedResponse.value?.pipelineDescription) {
    pipeline.value.pipeline.description =
      parsedResponse.value.pipelineDescription;
  }
};

const applySchema = () => {
  if (parsedResponse.value?.targetSchema) {
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
          Run a WebLLM model entirely in the UI, review the generated JSON in
          Monaco, and selectively apply the description, schema, or mappings.
        </p>
      </div>
      <div
        class="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900 shadow-sm"
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

    <div class="mt-5 grid gap-4 lg:grid-cols-[1fr,1fr,auto]">
      <label class="space-y-2 text-sm font-medium text-slate-700">
        <span>Local model</span>
        <select v-model="selectedModel" class="input">
          <option
            v-for="option in aiModelOptions"
            :key="option.id"
            :value="option.id"
          >
            {{ option.label }}
          </option>
        </select>
        <p class="text-xs leading-5 text-slate-500">
          {{
            aiModelOptions.find((option) => option.id === selectedModel)?.note
          }}
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
          class="button-primary"
          type="button"
          :disabled="isBusy"
          @click="generateDraft"
        >
          {{ isBusy ? "Working…" : "Generate draft" }}
        </button>
      </div>
    </div>

    <div
      class="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-3"
    >
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
        >
          Status
        </p>
        <p class="mt-2 text-sm font-medium text-slate-900">{{ loadStatus }}</p>
      </div>
      <div class="md:col-span-2">
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
        >
          Progress
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

    <div class="mt-6 grid gap-6 xl:grid-cols-[1fr,1fr]">
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
      class="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div
        class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
      >
        <div>
          <p
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
          >
            AI summary
          </p>
          <p class="mt-2 text-sm leading-6 text-slate-700">
            {{
              summary || "Generate a draft to see a structured summary here."
            }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
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

    <div class="mt-6">
      <MonacoCodeEditor
        v-model="responseText"
        label="AI JSON response"
        language="json"
        height="360px"
        readonly
      />
    </div>
  </section>
</template>
