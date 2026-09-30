<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus, Pencil, Trash2, ExternalLink } from '@lucide/vue';
import Navbar from './Navbar.vue';
import PassphraseModal from './PassphraseModal.vue';
import {
  isUnlocked, isVaultNew, unlock, lock, listItems, createItem, updateItem, deleteItem,
  type VaultItem, type Entry,
} from '../composables/useVault';
import { openDeleteDialog } from '../composables/useAccountDialog';

const props = defineProps<{ type: 'link' | 'note' }>();
const isLink = props.type === 'link';

const isNew = ref(false);
const loading = ref(false);
const error = ref('');
const items = ref<VaultItem[]>([]);
const query = ref('');
const showForm = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({ title: '', url: '', body: '' });

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter((i) =>
    [i.data.title, i.data.url, i.data.body].some((v) => v?.toLowerCase().includes(q)),
  );
});

onMounted(async () => {
  try { isNew.value = await isVaultNew(); } catch (e: any) { error.value = e.message; }
});

async function load() {
  items.value = await listItems(props.type);
}

async function handleUnlock(passphrase: string) {
  loading.value = true;
  error.value = '';
  try {
    await unlock(passphrase);
    await load();
  } catch (e: any) {
    lock();
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

// Hanya izinkan http/https agar tidak ada href "javascript:..."
function normalizeUrl(raw: string) {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch { return ''; }
}

function openForm(item?: VaultItem) {
  error.value = '';
  editingId.value = item?.id ?? null;
  form.title = item?.data.title ?? '';
  form.url = item?.data.url ?? '';
  form.body = item?.data.body ?? '';
  showForm.value = true;
}

async function save() {
  error.value = '';
  const data: Entry = { title: form.title.trim(), body: form.body };
  if (isLink) {
    data.url = normalizeUrl(form.url.trim());
    if (!data.url) { error.value = 'URL tidak valid (harus http/https).'; return; }
  }
  try {
    if (editingId.value) await updateItem(editingId.value, data);
    else await createItem(props.type, data);
    showForm.value = false;
    await load();
  } catch (e: any) { error.value = e.message; }
}

async function remove(id: string) {
  if (!confirm('Hapus item ini?')) return;
  await deleteItem(id);
  await load();
}
</script>

<template>
  <div>
    <Navbar :active="isLink ? 'links' : 'notes'" />
    <PassphraseModal v-if="!isUnlocked" :is-new="isNew" :error="error" :loading="loading"
      @submit="handleUnlock" @forgot="openDeleteDialog" />

    <main v-if="isUnlocked" class="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div class="flex gap-2">
        <input v-model="query" placeholder="Cari..."
          class="flex-1 border border-corporate-border rounded-md px-3 py-2 bg-corporate-surface" />
        <button @click="openForm()"
          class="flex items-center gap-1 bg-corporate-primary text-white rounded-md px-4 font-bold">
          <Plus :size="16" /> Tambah
        </button>
      </div>

      <p v-if="!filtered.length" class="text-center text-slate-500 py-12">
        {{ items.length ? 'Tidak ada hasil.' : 'Belum ada data.' }}
      </p>

      <ul class="space-y-2">
        <li v-for="item in filtered" :key="item.id"
          class="bg-corporate-surface border border-corporate-border rounded-md p-4 flex gap-3">
          <div class="flex-1 min-w-0">
            <h3 class="font-bold truncate">{{ item.data.title }}</h3>
            <a v-if="isLink" :href="item.data.url" target="_blank" rel="noopener noreferrer"
              class="text-sm text-corporate-accent flex items-center gap-1 truncate">
              <ExternalLink :size="14" /> {{ item.data.url }}
            </a>
            <p v-if="item.data.body" class="text-sm text-slate-600 whitespace-pre-wrap mt-1">{{ item.data.body }}</p>
          </div>
          <div class="flex gap-1 shrink-0">
            <button @click="openForm(item)" class="p-2 rounded-md hover:bg-corporate-light" title="Edit"><Pencil :size="16" /></button>
            <button @click="remove(item.id)" class="p-2 rounded-md hover:bg-red-50 text-red-600" title="Hapus"><Trash2 :size="16" /></button>
          </div>
        </li>
      </ul>
    </main>

    <div v-if="showForm" class="fixed inset-0 bg-corporate-dark/60 flex items-center justify-center p-4 z-40">
      <form @submit.prevent="save"
        class="bg-corporate-surface border border-corporate-border rounded-md p-6 w-full max-w-lg space-y-3">
        <h2 class="text-lg font-bold text-corporate-primary">
          {{ editingId ? 'Edit' : 'Tambah' }} {{ isLink ? 'link' : 'catatan' }}
        </h2>
        <input v-model="form.title" placeholder="Judul" required
          class="w-full border border-corporate-border rounded-md px-3 py-2" />
        <input v-if="isLink" v-model="form.url" placeholder="https://..." required
          class="w-full border border-corporate-border rounded-md px-3 py-2" />
        <textarea v-model="form.body" :rows="isLink ? 3 : 10"
          :placeholder="isLink ? 'Keterangan (opsional)' : 'Isi catatan...'" :required="!isLink"
          class="w-full border border-corporate-border rounded-md px-3 py-2"></textarea>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" @click="showForm = false" class="px-4 py-2 rounded-md border border-corporate-border">Batal</button>
          <button class="px-4 py-2 rounded-md bg-corporate-primary text-white font-bold">Simpan</button>
        </div>
      </form>
    </div>
  </div>
</template>
