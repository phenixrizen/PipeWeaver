<script setup lang="ts">
import AppSelect from "./AppSelect.vue";

defineProps<{ label: string; modelValue: string; options: string[] }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <label class="space-y-2 text-sm font-medium text-gray-700">
    <span>{{ label }}</span>
    <AppSelect
      :model-value="modelValue"
      :options="options"
      @update:modelValue="emit('update:modelValue', String($event))"
    />
  </label>
</template>
