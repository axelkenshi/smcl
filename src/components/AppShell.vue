<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import Navbar from './Navbar.vue';
import PassphraseModal from './PassphraseModal.vue';
import VaultManager from './VaultManager.vue';
import ChatManager from './ChatManager.vue';
import { isUnlocked, isVaultNew, accountName, unlock, lock, logout } from '../composables/useVault';
import { openDeleteDialog } from '../composables/useAccountDialog';

type Tab = 'links' | 'notes' | 'chat';

const props = defineProps<{ initialTab: Tab }>();

const PATHS: Record<Tab, string> = { links: '/links', notes: '/notes', chat: '/chat' };
const TITLES: Record<Tab, string> = { links: 'Brankas Link', notes: 'Catatan', chat: 'Chat' };

const tab = ref<Tab>(props.initialTab);
const isNew = ref(false);
const ready = ref(false);       // modal baru tampil setelah status brankas diketahui (tanpa kedip judul)
const loading = ref(false);
const error = ref('');

function tabFromPath(path: string): Tab {
  const clean = path.replace(/\/+$/, '');
  return (Object.keys(PATHS) as Tab[]).find((t) => PATHS[t] === clean) ?? 'links';
}

function setTab(next: Tab, push = true) {
  if (next === tab.value) return;
  tab.value = next;
  document.title = `${TITLES[next]} | SMCL`;
  if (push) history.pushState({}, '', PATHS[next]);
}

const onPop = () => setTab(tabFromPath(location.pathname), false);

onMounted(async () => {
  window.addEventListener('popstate', onPop);
  try {
    isNew.value = await isVaultNew();      // sekaligus mengisi accountName
  } catch (e: any) {
    error.value = e.message;
  } finally {
    ready.value = true;
  }
});
onUnmounted(() => window.removeEventListener('popstate', onPop));

async function handleUnlock(passphrase: string) {
  loading.value = true;
  error.value = '';
  try {
    await unlock(passphrase);
  } catch (e: any) {
    lock();
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="h-dvh flex flex-col">
    <Navbar :active="tab" :wide="tab === 'chat'" @navigate="setTab" />

    <PassphraseModal v-if="ready && !isUnlocked" :is-new="isNew" :error="error" :loading="loading"
      :username="accountName" @submit="handleUnlock" @forgot="openDeleteDialog" @logout="logout" />

    <main v-if="isUnlocked" class="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <VaultManager v-if="tab === 'links'" key="links" type="link" />
      <VaultManager v-else-if="tab === 'notes'" key="notes" type="note" />
      <ChatManager v-else key="chat" />
    </main>
  </div>
</template>
