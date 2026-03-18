<script setup lang="ts">
import { computed } from "vue";
import type { PipelineDefinition } from "../types/pipeline";

const props = defineProps<{
  pipeline: PipelineDefinition;
  samplePayload: string;
}>();

const endpointPath = computed(
  () => `/api/http/${props.pipeline.pipeline.id || "draft-pipeline"}`,
);

const shouldReplyInline = computed(
  () => props.pipeline.target.config?.responseMode === "reply",
);

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
</script>

<template>
  <section v-if="pipeline.source.type === 'http'" class="panel overflow-hidden">
    <div
      class="border-b border-slate-200 bg-[linear-gradient(135deg,_rgba(139,92,246,0.12),_rgba(6,182,212,0.10))] p-5"
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
          <span
            class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
          >
            localhost:8080
          </span>
        </div>
        <pre
          class="min-h-48 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-cyan-100"
          >{{ sampleCurl }}</pre
        >
      </div>
    </div>
  </section>
</template>
