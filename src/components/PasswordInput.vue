<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Eye, EyeOff } from '@lucide/vue';

defineOptions({ inheritAttrs: false });   // atribut (required, placeholder, dll.) diteruskan ke <input>, bukan ke pembungkus

const props = withDefaults(defineProps<{ autofocus?: boolean; label?: string }>(), { label: 'password' });
const model = defineModel<string>({ required: true });

const AUTO_HIDE_MS = 20_000;   // otomatis disembunyikan lagi setelah 20 detik
const visible = ref(false);
const input = ref<HTMLInputElement | null>(null);
let timer: number | undefined;

const hide = () => { visible.value = false; };

watch(visible, (v) => {
  clearTimeout(timer);
  if (v) timer = window.setTimeout(hide, AUTO_HIDE_MS);
});

const onVisibility = () => { if (document.hidden) hide(); };

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  if (props.autofocus) input.value?.focus();
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', onVisibility);
});

function toggle() {
  visible.value = !visible.value;
  input.value?.focus();
}
</script>

<template>
  <div class="relative">
    <input ref="input" v-bind="$attrs" v-model="model" :type="visible ? 'text' : 'password'"
      autocapitalize="off" autocorrect="off" spellcheck="false"
      class="w-full border border-corporate-border rounded-md pl-3 pr-11 py-2" />
    <button type="button" @mousedown.prevent @click="toggle"
      :aria-label="`${visible ? 'Sembunyikan' : 'Tampilkan'} ${label}`" :aria-pressed="visible"
      :title="`${visible ? 'Sembunyikan' : 'Tampilkan'} ${label}`"
      class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-500 hover:text-corporate-primary">
      <EyeOff v-if="visible" :size="18" />
      <Eye v-else :size="18" />
    </button>
  </div>
</template>