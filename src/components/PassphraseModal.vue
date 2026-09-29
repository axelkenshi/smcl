<script setup lang="ts">
import { computed, ref } from 'vue';
import { Lock } from '@lucide/vue';

const props = defineProps<{ isNew: boolean; error: string; loading: boolean }>();
const emit = defineEmits<{ submit: [passphrase: string]; forgot: [] }>();
const pass = ref('');
const pass2 = ref('');
const localError = ref('');

// hitung minimal passPhrase
const MIN_LENGTH = 12;

const strength = computed(() => {
  const n = pass.value.length;
  if (!n) return null;
  if (n < MIN_LENGTH) return { text: `Terlalu pendek (${n}/${MIN_LENGTH} karakter)`, cls: 'text-red-600' };
  if (n < 16) return { text: 'Cukup. Lebih panjang lebih aman.', cls: 'text-amber-600' };
  return { text: 'Panjang, bagus.', cls: 'text-green-600' };
});

function onSubmit() {
  localError.value = '';
  if (props.isNew) {
    if (pass.value.length < MIN_LENGTH) {
      return (localError.value = `Passphrase minimal ${MIN_LENGTH} karakter.`);
    }
    if (new Set(pass.value).size < 6) {
      return (localError.value = 'Passphrase terlalu monoton. Gunakan kalimat atau beberapa kata berbeda.');
    }
    if (pass.value !== pass2.value) return (localError.value = 'Konfirmasi passphrase tidak sama.');
  }
  emit('submit', pass.value);
}
</script>

<template>
  <div class="fixed inset-0 bg-corporate-dark/60 flex items-center justify-center p-4 z-50">
    <form @submit.prevent="onSubmit"
      class="bg-corporate-surface border border-corporate-border rounded-md p-6 w-full max-w-sm space-y-4">
      <div class="flex items-center gap-2 text-corporate-primary">
        <Lock :size="20" />
        <h2 class="text-lg font-bold">{{ isNew ? 'Buat passphrase brankas' : 'Buka brankas' }}</h2>
      </div>

      <p v-if="isNew" class="text-sm text-slate-600">
        Passphrase ini tidak dikirim ke server dan <b>tidak bisa dipulihkan</b> jika lupa, karena ia bersifat sebagai kunci dekriptor hanya anda yang tahu. <br/>
        Wajib <b>berbeda dari password login demi keamanan</b>. <br/> Saran: rangkai 4 kata acak atau lebih
        menjadi kalimat yang mudah Anda ingat tetapi tidak umum.
      </p>


      <input v-model="pass" type="password" placeholder="Passphrase brankas" autofocus required
        class="w-full border border-corporate-border rounded-md px-3 py-2" />
      <p v-if="isNew && strength" class="text-xs" :class="strength.cls">{{ strength.text }}</p>
      
      <input v-if="isNew" v-model="pass2" type="password" placeholder="Ulangi passphrase" required
        class="w-full border border-corporate-border rounded-md px-3 py-2" />

      <p v-if="localError || error" class="text-sm text-red-600">{{ localError || error }}</p>

      <button :disabled="loading"
        class="w-full bg-corporate-primary text-white rounded-md py-2 font-bold disabled:opacity-60">
        {{ loading ? 'Memproses...' : isNew ? 'Buat & buka' : 'Buka' }}
      </button>

      <!-- taruh setelah tombol submit (Mode lupa akun)-->
      <button v-if="!isNew" type="button" @click="emit('forgot')"
        class="w-full text-center text-sm text-corporate-accent">
        Lupa passphrase? Hapus akun
      </button>
    </form>
  </div>
</template>
