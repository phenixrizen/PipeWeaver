<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { PipelineDefinition } from "../types/pipeline";

const props = defineProps<{
  pipeline: PipelineDefinition;
  samplePayload: string;
  isSaved: boolean;
}>();

const endpointIdentifier = computed(
  () => props.pipeline.pipeline.id.trim() || "<pipeline-id>",
);
const endpointPath = computed(() => `/api/http/${endpointIdentifier.value}`);
const canCopyCurl = computed(
  () => props.isSaved && props.pipeline.pipeline.id.trim().length > 0,
);

const shouldReplyInline = computed(
  () => props.pipeline.target.config?.responseMode === "reply",
);
const copyState = ref<"idle" | "copied" | "error">("idle");

let copyResetTimer: number | undefined;

const contentType = computed(() => {
  switch (props.pipeline.source.format) {
    case "json":
      return "application/json";
    case "xml":
      return "application/xml";
    case "tsv":
      return "text/tab-separated-values";
    case "pipe":
      return "text/plain";
    default:
      return "text/csv";
  }
});

const sampleCurl = computed(() => {
  const payload =
    props.samplePayload || "customer_id,full_name\n1001,Ada Lovelace";
  return [
    `curl -X POST http://localhost:8080${endpointPath.value} \\\n  -H 'Content-Type: ${contentType.value}' \\\n  --data-binary '${payload.replace(/'/g, "'\\''")}'`,
  ].join("\n");
});

const resetCopyStateLater = () => {
  if (typeof window === "undefined") {
    return;
  }
  if (copyResetTimer !== undefined) {
    window.clearTimeout(copyResetTimer);
  }
  copyResetTimer = window.setTimeout(() => {
    copyState.value = "idle";
    copyResetTimer = undefined;
  }, 2000);
};

const copyCurlCommand = async () => {
  if (!canCopyCurl.value) {
    copyState.value = "idle";
    return;
  }

  try {
    await navigator.clipboard.writeText(sampleCurl.value);
    copyState.value = "copied";
  } catch {
    copyState.value = "error";
  }
  resetCopyStateLater();
};

onBeforeUnmount(() => {
  if (typeof window !== "undefined" && copyResetTimer !== undefined) {
    window.clearTimeout(copyResetTimer);
  }
});

watch(canCopyCurl, (enabled) => {
  if (enabled) {
    return;
  }

  copyState.value = "idle";
  if (typeof window !== "undefined" && copyResetTimer !== undefined) {
    window.clearTimeout(copyResetTimer);
    copyResetTimer = undefined;
  }
});
</script>

<template>
  <section v-if="pipeline.source.type === 'http'" class="panel overflow-hidden">
    <div
      class="border-b border-slate-200 bg-[linear-gradient(135deg,_rgba(14,165,233,0.14),_rgba(59,130,246,0.10))] p-5"
    >
      <div
        class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <p class="panel-title">HTTP pipeline endpoint</p>
          <p class="mt-2 text-sm leading-6 text-slate-600">
            Post a raw payload to this endpoint to run the saved mapping. Enable
            reply mode on the target connector to stream the transformed output
            directly back to the caller.
          </p>
        </div>
        <code class="rounded-2xl bg-slate-950 px-4 py-2 text-xs text-cyan-200">
          {{ endpointPath }}
        </code>
      </div>
    </div>

    <div class="grid gap-5 p-5 xl:grid-cols-[1fr,1.2fr]">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm font-semibold text-slate-900">Connector behavior</p>
        <dl class="mt-4 space-y-3 text-sm text-slate-600">
          <div class="flex items-center justify-between gap-4">
            <dt>HTTP source</dt>
            <dd class="font-medium text-slate-900">Enabled</dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt>Response mode</dt>
            <dd
              class="rounded-full px-3 py-1 text-xs font-semibold"
              :class="
                shouldReplyInline
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              "
            >
              {{
                shouldReplyInline
                  ? "Reply with transformed payload"
                  : "Return preview envelope"
              }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt>Payload format</dt>
            <dd class="font-medium text-slate-900">
              {{ pipeline.source.format }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt>Response format</dt>
            <dd class="font-medium text-slate-900">
              {{ pipeline.target.format }}
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <div class="mb-3 flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-slate-900">
            Sample curl command
          </p>
          <div class="flex items-center gap-2">
            <span
              class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
            >
              localhost:8080
            </span>
            <button
              data-testid="copy-curl-button"
              class="button-secondary px-3 py-2 text-xs"
              type="button"
              :disabled="!canCopyCurl"
              :class="!canCopyCurl ? 'cursor-not-allowed opacity-60' : ''"
              @click="copyCurlCommand"
            >
              {{
                copyState === "copied"
                  ? "Copied"
                  : copyState === "error"
                    ? "Copy failed"
                    : "Copy"
              }}
            </button>
          </div>
        </div>
        <p
          v-if="!canCopyCurl"
          class="mb-3 text-xs font-medium text-amber-700"
        >
          Save pipeline to copy a stable endpoint command.
        </p>
        <pre
          class="min-h-48 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-cyan-100"
          >{{ sampleCurl }}</pre
        >
      </div>
    </div>
  </section>
</template>
