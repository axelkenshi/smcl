<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ArrowLeft, Send, ShieldCheck, MessageSquare } from '@lucide/vue';
import Navbar from './Navbar.vue';
import PassphraseModal from './PassphraseModal.vue';
import { isUnlocked, isVaultNew, unlock, lock, identity } from '../composables/useVault';
import { openDeleteDialog } from '../composables/useAccountDialog';
import {
  listUsers, listConversations, fetchMessages, sendMessage, getSafetyCode,
  type Peer, type ChatMessage, type Conversation,
} from '../composables/useChat';
import { MESSAGE_TTL_MS } from '../lib/chat';

const isNew = ref(false);
const loading = ref(false);
const error = ref('');
const users = ref<Peer[]>([]);
const conversations = ref<Conversation[]>([]);
const convLoaded = ref(false);
const peerId = ref('');
const messages = ref<ChatMessage[]>([]);
const text = ref('');
const sending = ref(false);
const chatError = ref('');
const code = ref('');
const showCode = ref(false);
const listEl = ref<HTMLElement | null>(null);
let timer: number | undefined;

// ---------- tampilan ----------
const PALETTE = ['bg-sky-600', 'bg-blue-700', 'bg-indigo-600', 'bg-teal-600', 'bg-emerald-600', 'bg-violet-600'];
const colorOf = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
const initials = (name: string) =>
  name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';

function listTime(t: number) {
  if (!t) return '';
  const d = new Date(t);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (diff <= 0) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
const fmt = (t: number) =>
  new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ---------- data turunan ----------
const peer = computed<Peer | null>(
  () =>
    users.value.find((u) => u.id === peerId.value) ??
    conversations.value.find((c) => c.peer.id === peerId.value)?.peer ??
    null,
);

const sidebarItems = computed(() => {
  const list = conversations.value.map((c) => ({
    id: c.peer.id,
    name: c.peer.username,
    preview: (c.mine ? 'Anda: ' : '') + c.preview,
    at: c.at,
  }));
  // Percakapan baru belum punya pesan, jadi belum ada di server: tampilkan sebagai draf
  if (peer.value && !list.some((i) => i.id === peer.value!.id)) {
    list.unshift({ id: peer.value.id, name: peer.value.username, preview: 'Percakapan baru', at: 0 });
  }
  return list;
});

// ---------- polling ----------
async function scrollDown() {
  await nextTick();
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight });
}

async function refreshUsers() {
  try { users.value = await listUsers(); } catch { /* biarkan daftar lama */ }
}

async function refreshConversations() {
  try {
    conversations.value = await listConversations();
  } catch (e) {
    console.error('Gagal memuat percakapan:', e);
  } finally {
    convLoaded.value = true;
  }
}

async function poll(initial = false) {
  const p = peer.value;
  if (!p || !isUnlocked.value || !identity.value) return;
  const pid = p.id;
  const after = messages.value.length ? messages.value[messages.value.length - 1].at : 0;
  try {
    const fresh = await fetchMessages(p, after);
    if (peerId.value !== pid) return; // pengguna sudah pindah percakapan
    const seen = new Set(messages.value.map((m) => m.id));
    const added = fresh.filter((m) => !seen.has(m.id));
    const cutoff = Date.now() - MESSAGE_TTL_MS; // pesan yang lewat 3 hari ikut hilang dari layar
    messages.value = [...messages.value, ...added].filter((m) => m.at > cutoff);
    if (added.length || initial) scrollDown();
  } catch (e: any) {
    chatError.value = e.message;
  }
}

const tick = (initial = false) => Promise.all([refreshConversations(), poll(initial)]);

function startPolling() {
  stopPolling();
  if (!document.hidden) timer = window.setInterval(() => tick(), 5000);
}
function stopPolling() {
  clearInterval(timer);
  timer = undefined;
}
function onVisibility() {
  if (document.hidden) stopPolling();
  else if (isUnlocked.value) { tick(); startPolling(); }
}

watch(peerId, async () => {
  messages.value = [];
  code.value = '';
  showCode.value = false;
  chatError.value = '';
  if (peer.value) await poll(true);
});

watch(isUnlocked, (unlocked) => {
  if (!unlocked) {
    stopPolling();
    peerId.value = '';
    users.value = [];
    conversations.value = [];
    convLoaded.value = false;
  }
});

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibility);
  try { isNew.value = await isVaultNew(); } catch (e: any) { error.value = e.message; }
});
onUnmounted(() => {
  stopPolling();
  document.removeEventListener('visibilitychange', onVisibility);
});

// ---------- aksi ----------
async function handleUnlock(passphrase: string) {
  loading.value = true;
  error.value = '';
  try {
    await unlock(passphrase);
    users.value = await listUsers();
    await refreshConversations();
    startPolling();
  } catch (e: any) {
    lock();
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function onPick(e: Event) {
  const el = e.target as HTMLSelectElement;
  const id = el.value;
  el.value = ''; // kembalikan ke placeholder agar dropdown bisa dipakai lagi
  if (id) peerId.value = id;
}

async function send() {
  const p = peer.value;
  const t = text.value.trim();
  if (!p || !t || sending.value) return;
  sending.value = true;
  chatError.value = '';
  try {
    await sendMessage(p, t);
    text.value = '';
    await tick();
    scrollDown();
  } catch (e: any) {
    chatError.value = e.message;
  } finally {
    sending.value = false;
  }
}

async function toggleCode() {
  showCode.value = !showCode.value;
  if (showCode.value && peer.value && !code.value) code.value = await getSafetyCode(peer.value);
}
</script>

<template>
  <div class="h-dvh flex flex-col">
    <Navbar active="chat" wide />
    <PassphraseModal v-if="!isUnlocked" :is-new="isNew" :error="error" :loading="loading"
      @submit="handleUnlock" @forgot="openDeleteDialog" />

    <div v-if="isUnlocked" class="flex flex-1 min-h-0">
      <p v-if="!identity" class="p-6 text-sm text-red-600">
        Kunci chat belum siap. Kunci lalu buka brankas lagi. Jika berulang, cek Console browser.
      </p>

      <template v-else>
        <!-- Sidebar -->
        <aside :class="[peerId ? 'hidden md:flex' : 'flex',
          'w-full md:w-[300px] lg:w-[30%] lg:min-w-[300px] lg:max-w-[400px] shrink-0 flex-col border-r border-corporate-border bg-corporate-surface']">
          <div class="p-3 border-b border-corporate-border space-y-2">
            <h2 class="font-bold text-corporate-primary">Percakapan</h2>
            <select :value="''" @change="onPick" @focus="refreshUsers"
              class="w-full border border-corporate-border rounded-md px-3 py-2 bg-corporate-surface text-sm">
              <option value="">+ Mulai chat baru...</option>
              <option v-for="u in users" :key="u.id" :value="u.id" :disabled="!u.public_key">
                {{ u.username }}{{ u.public_key ? '' : ' (belum aktif)' }}
              </option>
            </select>
          </div>

          <ul class="flex-1 overflow-y-auto">
            <li v-if="!convLoaded" class="p-6 text-center text-sm text-slate-500">Memuat...</li>
            <li v-else-if="!sidebarItems.length" class="p-6 text-center text-sm text-slate-500">
              Belum ada percakapan. Pilih pengguna di atas untuk memulai.
            </li>
            <li v-for="it in sidebarItems" :key="it.id">
              <button @click="peerId = it.id"
                :class="['w-full flex items-center gap-3 px-3 py-3 text-left border-b border-corporate-border/60 hover:bg-corporate-bg',
                  it.id === peerId && 'bg-corporate-light']">
                <span :class="['w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-bold', colorOf(it.name)]">
                  {{ initials(it.name) }}
                </span>
                <span class="flex-1 min-w-0">
                  <span class="flex items-baseline justify-between gap-2">
                    <span class="font-bold truncate">{{ it.name }}</span>
                    <span class="text-xs text-slate-500 shrink-0">{{ listTime(it.at) }}</span>
                  </span>
                  <span class="block text-sm text-slate-600 truncate">{{ it.preview }}</span>
                </span>
              </button>
            </li>
          </ul>
        </aside>

        <!-- Panel chat -->
        <section :class="[peerId ? 'flex' : 'hidden md:flex', 'flex-1 min-w-0 flex-col bg-corporate-bg']">
          <template v-if="peer">
            <div class="flex items-center gap-3 px-3 py-2 bg-corporate-surface border-b border-corporate-border">
              <button @click="peerId = ''" aria-label="Kembali"
                class="md:hidden p-2 -ml-1 rounded-md hover:bg-corporate-light">
                <ArrowLeft :size="20" />
              </button>
              <span :class="['w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold', colorOf(peer.username)]">
                {{ initials(peer.username) }}
              </span>
              <span class="font-bold truncate">{{ peer.username }}</span>
              <button @click="toggleCode" class="ml-auto flex items-center gap-1 text-sm text-corporate-accent shrink-0">
                <ShieldCheck :size="16" /> <span class="hidden sm:inline">Kode keamanan</span>
              </button>
            </div>

            <div v-if="showCode" class="px-4 py-2 text-xs bg-corporate-light">
              <p class="font-mono break-words">{{ code }}</p>
              <p class="mt-1">
                Cocokkan kode ini dengan {{ peer.username }} lewat kanal lain (tatap muka atau telepon).
                Jika sama, server tidak menyadap percakapan ini.
              </p>
            </div>

            <div ref="listEl" class="flex-1 overflow-y-auto p-4 space-y-2">
              <p v-if="!messages.length" class="text-center text-sm text-slate-500 py-8">
                Belum ada pesan. Pesan dihapus otomatis setelah 3 hari.
              </p>
              <div v-for="m in messages" :key="m.id" :class="['flex', m.mine ? 'justify-end' : 'justify-start']">
                <div :class="['max-w-[80%] rounded-md px-3 py-2 text-sm',
                  m.mine ? 'bg-corporate-primary text-white' : 'bg-corporate-surface border border-corporate-border',
                  !m.ok && 'italic opacity-70']">
                  <p class="whitespace-pre-wrap break-words">{{ m.text }}</p>
                  <p class="text-[10px] opacity-70 mt-1 text-right">{{ fmt(m.at) }}</p>
                </div>
              </div>
            </div>

            <p v-if="chatError" class="px-4 pb-1 text-sm text-red-600">{{ chatError }}</p>
            <div class="flex gap-2 p-3 bg-corporate-surface border-t border-corporate-border">
              <textarea v-model="text" rows="1" maxlength="2000" placeholder="Tulis pesan..."
                @keydown.enter.exact.prevent="send"
                class="flex-1 resize-none max-h-32 border border-corporate-border rounded-md px-3 py-2"></textarea>
              <button @click="send" :disabled="sending || !text.trim()" title="Kirim" aria-label="Kirim"
                class="bg-corporate-primary text-white rounded-md px-4 disabled:opacity-60">
                <Send :size="16" />
              </button>
            </div>
          </template>

          <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-500 text-center p-6">
            <MessageSquare :size="40" class="mb-3" />
            <p class="font-bold text-corporate-dark">Pilih percakapan atau mulai chat baru</p>
            <p class="text-sm mt-1 max-w-xs">
              Pesan terenkripsi end-to-end dan dihapus otomatis setelah 3 hari.
            </p>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
