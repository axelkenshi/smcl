<script setup lang="ts">
import { ref } from 'vue';
import { deleteAccount } from '../composables/useVault';

const emit = defineEmits<{ close: [] }>();
const password = ref('');
const error = ref('');
const loading = ref(false);

async function confirm() {
  loading.value = true;
  error.value = '';
  try {
    await deleteAccount(password.value); // sukses = otomatis pindah ke /login
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-corporate-dark/60 flex items-center justify-center p-4 z-[60] text-corporate-dark">
    <form @submit.prevent="confirm"
      class="bg-corporate-surface border border-corporate-border rounded-md p-6 w-full max-w-sm space-y-3">
      <h2 class="text-lg font-bold text-red-600">Hapus akun</h2>
      <p class="text-sm text-slate-600">
        Seluruh link, catatan, dan pesan Anda akan dihapus <b>permanen</b> dan tidak bisa dipulihkan.
        Masukkan password login untuk melanjutkan.
      </p>
      <input v-model="password" type="password" placeholder="Password login" required
        autocomplete="current-password"
        class="w-full border border-corporate-border rounded-md px-3 py-2" />
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" @click="emit('close')"
          class="px-4 py-2 rounded-md border border-corporate-border">Batal</button>
        <button :disabled="loading"
          class="px-4 py-2 rounded-md bg-red-600 text-white font-bold disabled:opacity-60">
          {{ loading ? 'Menghapus...' : 'Hapus permanen' }}
        </button>
      </div>
    </form>
  </div>
</template>