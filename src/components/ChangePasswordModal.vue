<script setup lang="ts">
import { ref } from 'vue';
import { changePassword } from '../composables/useVault';

import PasswordInput from './PasswordInput.vue';

const emit = defineEmits<{ close: [] }>();
const current = ref('');
const next = ref('');
const repeat = ref('');
const error = ref('');
const loading = ref(false);
const done = ref(false);

async function submit() {
  error.value = '';
  if (next.value.length < 8) return (error.value = 'Password baru minimal 8 karakter.');
  if (next.value !== repeat.value) return (error.value = 'Konfirmasi password tidak sama.');
  if (next.value === current.value) return (error.value = 'Password baru harus berbeda dari yang lama.');
  loading.value = true;
  try {
    await changePassword(current.value, next.value);
    done.value = true;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-corporate-dark/60 flex items-center justify-center p-4 z-[60] text-corporate-dark">
    <form @submit.prevent="submit"
      class="bg-corporate-surface border border-corporate-border rounded-md p-6 w-full max-w-sm space-y-3">
      <h2 class="text-lg font-bold text-corporate-primary">Ganti password login</h2>

      <template v-if="done">
        <p class="text-sm text-green-700">
          Password berhasil diganti. Perangkat lain yang sedang login telah dikeluarkan.
        </p>
        <div class="flex justify-end">
          <button type="button" @click="emit('close')"
            class="px-4 py-2 rounded-md bg-corporate-primary text-white font-bold">Tutup</button>
        </div>
      </template>

      <template v-else>
        <p class="text-sm text-slate-600">
          Ini hanya mengganti password untuk masuk. Passphrase brankas dan seluruh datanya tidak berubah.
          Mohon jangan gunakan passphrase Anda sebagai password login.
        </p>
        <PasswordInput v-model="current" label="password saat ini" placeholder="Password saat ini"
          required autocomplete="current-password" />
        <PasswordInput v-model="next" label="password baru" placeholder="Password baru (min. 8 karakter)"
          required autocomplete="new-password" />
        <PasswordInput v-model="repeat" label="password baru" placeholder="Ulangi password baru"
          required autocomplete="new-password" />
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" @click="emit('close')"
            class="px-4 py-2 rounded-md border border-corporate-border">Batal</button>
          <button :disabled="loading"
            class="px-4 py-2 rounded-md bg-corporate-primary text-white font-bold disabled:opacity-60">
            {{ loading ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </template>
    </form>
  </div>
</template>
