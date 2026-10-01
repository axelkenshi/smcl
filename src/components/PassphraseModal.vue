<script setup lang="ts">
import { computed, ref } from 'vue';
import { Lock, LogOut, User } from '@lucide/vue';
import PasswordInput from './PasswordInput.vue';

const props = defineProps<{ isNew: boolean; error: string; loading: boolean; username: string }>();
const emit = defineEmits<{ submit: [passphrase: string]; forgot: []; logout: [] }>();

const MIN_LENGTH = 12;
const pass = ref('');
const pass2 = ref('');
const localError = ref('');

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
    if (pass.value.length < MIN_LENGTH) return (localError.value = `Passphrase minimal ${MIN_LENGTH} karakter.`);
    if (new Set(pass.value).size < 6) return (localError.value = 'Passphrase terlalu monoton. Gunakan kalimat atau beberapa kata berbeda.');
    if (pass.value !== pass2.value) return (localError.value = 'Konfirmasi passphrase tidak sama.');
  }
  emit('submit', pass.value);
}
</script>

<template>
  <div class="fixed inset-0 bg-corporate-dark/60 flex items-center justify-center p-4 z-50">
    <form @submit.prevent="onSubmit"
      class="bg-corporate-surface border border-corporate-border rounded-md p-6 w-full max-w-sm space-y-4">

      <!-- Akun aktif + keluar tanpa perlu membuka brankas -->
      <div class="flex items-center justify-between gap-2">
        <span :title="username"
          class="inline-flex items-center gap-1.5 min-w-0 rounded-full bg-corporate-light text-corporate-primary px-3 py-1 text-sm font-bold">
          <User :size="14" class="shrink-0" />
          <span class="sr-only">Masuk sebagai</span>
          <span class="truncate">{{ username || 'Memuat...' }}</span>
        </span>
        <button type="button" @click="emit('logout')" title="Keluar dari akun ini" aria-label="Keluar dari akun ini"
          class="p-2 rounded-md shrink-0 text-slate-600 hover:bg-red-50 hover:text-red-600">
          <LogOut :size="18" />
        </button>
      </div>

      <div class="flex items-center gap-2 text-corporate-primary">
        <Lock :size="20" />
        <h2 class="text-lg font-bold">{{ isNew ? 'Buat passphrase brankas' : 'Buka brankas' }}</h2>
      </div>

      <p v-if="isNew" class="text-sm text-slate-600">
        Passphrase ini tidak dikirim ke server dan <b>tidak bisa dipulihkan</b> jika lupa.
        Wajib <b>berbeda dari password login</b>. Saran: rangkai 4 kata acak atau lebih
        menjadi kalimat yang mudah Anda ingat tetapi tidak umum.
      </p>

      <PasswordInput v-model="pass" label="passphrase" placeholder="Passphrase brankas" autofocus required
        :autocomplete="isNew ? 'new-password' : 'off'" />
      <p v-if="isNew && strength" class="text-xs" :class="strength.cls">{{ strength.text }}</p>
      <PasswordInput v-if="isNew" v-model="pass2" label="passphrase" placeholder="Ulangi passphrase" required
        autocomplete="new-password" />

      <p v-if="localError || error" class="text-sm text-red-600">{{ localError || error }}</p>

      <button :disabled="loading"
        class="w-full bg-corporate-primary text-white rounded-md py-2 font-bold disabled:opacity-60">
        {{ loading ? 'Memproses...' : isNew ? 'Buat & buka' : 'Buka' }}
      </button>

      <button v-if="!isNew" type="button" @click="emit('forgot')"
        class="w-full text-center text-sm text-corporate-accent">
        Lupa passphrase? Hapus akun
      </button>
    </form>
  </div>
</template>
