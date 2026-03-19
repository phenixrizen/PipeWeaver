<script setup lang="ts">
import pipeWeaverMark from "../assets/pipeweaver-mark.png";

defineProps<{ compact?: boolean }>();
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      class="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-sky-100 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.30),_rgba(255,255,255,0.98))] shadow-sm shadow-sky-500/10"
      :class="compact ? 'h-10 w-10 rounded-xl' : ''"
    >
      <img
        :src="pipeWeaverMark"
        alt=""
        aria-hidden="true"
        class="h-8 w-8 object-contain"
        :class="compact ? 'h-7 w-7' : ''"
      />
    </div>
    <div>
      <p
        class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-500"
      >
        PipeWeaver
      </p>
      <p class="text-sm font-semibold text-slate-900">Dataflow studio</p>
    </div>
  </div>
</template>
