<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { Download } from '@lucide/vue';
import { makeQr, qrToPngDataUrl, type QrData } from '../composables/useQr';

const props = defineProps<{ title: string; url: string }>();
const emit = defineEmits<{ close: [] }>();

const qr = computed<QrData | null>(() => {
  try { return makeQr(props.url); } catch { return null; }
});

function download() {
  if (!qr.value) return;
  const name = props.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'link';
  const a = document.createElement('a');
  a.href = qrToPngDataUrl(qr.value);
  a.download = `qr-${name}.png`;
  a.click();
}

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="fixed inset-0 bg-corporate-dark/60 flex items-center justify-center p-4 z-40"
    @click.self="emit('close')">
    <div role="dialog" aria-modal="true" aria-label="Kode QR"
      class="bg-corporate-surface border border-corporate-border rounded-md p-6 w-full max-w-sm space-y-3">
      <h2 class="text-lg font-bold text-corporate-primary truncate">{{ title }}</h2>

      <div v-if="qr" class="bg-white border border-corporate-border rounded-md p-2 mx-auto w-full max-w-64">
        <svg :viewBox="`0 0 ${qr.size} ${qr.size}`" class="w-full h-auto block" role="img"
          :aria-label="`Kode QR untuk ${url}`">
          <rect :width="qr.size" :height="qr.size" fill="#fff" />
          <path :d="qr.path" fill="#000" shape-rendering="crispEdges" />
        </svg>
      </div>
      <p v-else class="text-sm text-red-600">URL terlalu panjang untuk dijadikan kode QR.</p>

      <p class="text-xs text-slate-500 break-all">{{ url }}</p>
      <p class="text-xs text-slate-500">
        Dibuat di browser Anda, tidak ada data yang dikirim ke server.
        File PNG yang diunduh menyimpan tautan <b>tanpa enkripsi</b>.
      </p>

      <div class="flex justify-end gap-2">
        <button type="button" @click="emit('close')"
          class="px-4 py-2 rounded-md border border-corporate-border">Tutup</button>
        <button v-if="qr" type="button" @click="download"
          class="flex items-center gap-1 px-4 py-2 rounded-md bg-corporate-primary text-white font-bold">
          <Download :size="16" /> Unduh PNG
        </button>
      </div>
    </div>
  </div>
</template>
