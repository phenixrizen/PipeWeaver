<script setup lang="ts">
defineProps<{ compact?: boolean }>();
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      class="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-cyan-400 text-white shadow-lg shadow-violet-500/20"
      :class="compact ? 'h-10 w-10 rounded-xl' : ''"
    >
      <svg
        class="h-7 w-7"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="pipeweaver-mark" x1="10" y1="10" x2="54" y2="54">
            <stop offset="0%" stop-color="white" stop-opacity="0.96" />
            <stop offset="100%" stop-color="white" stop-opacity="0.7" />
          </linearGradient>
        </defs>
        <path
          d="M16 20C16 15.5817 19.5817 12 24 12H31V20H24V27H16V20Z"
          fill="url(#pipeweaver-mark)"
        />
        <path
          d="M48 44C48 48.4183 44.4183 52 40 52H33V44H40V37H48V44Z"
          fill="url(#pipeweaver-mark)"
        />
        <path
          d="M16 37H24V44H31C35.4183 44 39 40.4183 39 36V28H31V36H24V29H16V37Z"
          fill="url(#pipeweaver-mark)"
        />
        <path
          d="M48 27H40V20H33C28.5817 20 25 23.5817 25 28V36H33V28H40V35H48V27Z"
          fill="url(#pipeweaver-mark)"
        />
      </svg>
      <div class="absolute inset-x-2 bottom-1 h-px bg-white/40" />
    </div>
    <div>
      <p
        class="text-xs font-semibold uppercase tracking-[0.28em] text-violet-500"
      >
        PipeWeaver
      </p>
      <p class="text-sm font-semibold text-slate-900">Dataflow studio</p>
    </div>
  </div>
</template>
