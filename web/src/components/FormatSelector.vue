<script setup lang="ts">
defineProps<{ label: string; modelValue: string; options: string[] }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <label class="space-y-2 text-sm text-slate-300">
    <span>{{ label }}</span>
    <select
      class="input"
      :value="modelValue"
      @change="
        emit('update:modelValue', ($event.target as HTMLSelectElement).value)
      "
    >
      <option v-for="option in options" :key="option" :value="option">
        {{ option }}
      </option>
    </select>
  </label>
</template>
