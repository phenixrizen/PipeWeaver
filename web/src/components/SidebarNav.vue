<template>
  <aside
    class="hidden w-72 border-r border-slate-800 bg-slate-900/70 px-6 py-8 lg:block"
  >
    <div class="space-y-6">
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400"
        >
          PipeWeaver
        </p>
        <h1 class="mt-3 text-2xl font-semibold text-white">
          Data mapping, made explicit.
        </h1>
        <p class="mt-2 text-sm text-slate-400">
          Build configurable transformation pipelines with a backend-first
          workflow that can grow into a visual mapper.
        </p>
      </div>
      <nav class="space-y-2 text-sm text-slate-300">
        <RouterLink class="block rounded-xl px-3 py-2 hover:bg-slate-800" to="/"
          >Pipelines</RouterLink
        >
        <RouterLink
          class="block rounded-xl px-3 py-2 hover:bg-slate-800"
          to="/pipelines/new"
          >New pipeline</RouterLink
        >
      </nav>
    </div>
  </aside>
</template>
