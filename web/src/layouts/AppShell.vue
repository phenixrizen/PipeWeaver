<script setup lang="ts">
import SidebarNav from "../components/SidebarNav.vue";
</script>

<template>
  <div class="flex min-h-screen bg-slate-950">
    <SidebarNav />
    <main class="flex-1 p-6 lg:p-8">
      <slot />
    </main>
  </div>
</template>
