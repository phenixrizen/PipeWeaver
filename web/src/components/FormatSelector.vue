<script setup lang="ts">
const model = defineModel<string>({ required: true });

defineProps<{
  label: string;
}>();

const formats = ["json", "csv", "tsv", "pipe", "xml"];
</script>

<template>
  <label class="block">
    <span class="label">{{ label }}</span>
    <select v-model="model" class="input">
      <option v-for="format in formats" :key="format" :value="format">
        {{ format.toUpperCase() }}
      </option>
    </select>
  </label>
</template>
