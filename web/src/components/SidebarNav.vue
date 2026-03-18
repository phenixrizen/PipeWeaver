<template>
  <aside class="panel hidden w-72 shrink-0 p-5 lg:block">
    <div class="mb-8">
      <p
        class="text-xs font-semibold uppercase tracking-[0.3em] text-brand-400"
      >
        PipeWeaver
      </p>
      <h1 class="mt-2 text-2xl font-semibold text-white">Pipeline Studio</h1>
      <p class="mt-2 text-sm text-slate-400">
        Design, preview, and persist transformation pipelines.
      </p>
    </div>
    <nav class="space-y-2">
      <RouterLink
        class="block rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
        to="/"
      >
        Pipelines
      </RouterLink>
      <RouterLink
        class="block rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
        to="/pipelines/new"
      >
        New pipeline
      </RouterLink>
    </nav>
  </aside>
</template>
