<script setup lang="ts">
import SidebarNav from "@/components/SidebarNav.vue";
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <div class="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-6">
      <SidebarNav />
      <main class="flex-1">
        <slot />
      </main>
    </div>
  </div>
</template>
