<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "../components/AppHeader.vue";
import SidebarNav from "../components/SidebarNav.vue";

const sidebarOpen = ref(false);
const route = useRoute();
const isWideContent = computed(() => route.meta.wideContent === true);
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-100 text-gray-900">
    <SidebarNav :open="sidebarOpen" @close="sidebarOpen = false" />

    <div
      class="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden"
    >
      <AppHeader
        :sidebar-open="sidebarOpen"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
      />
      <main class="grow">
        <div
          class="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          :class="isWideContent ? 'max-w-[1800px]' : 'max-w-[1440px]'"
        >
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
