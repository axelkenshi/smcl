<script setup lang="ts">
import { Link as LinkIcon, StickyNote, MessageSquare, Lock, LogOut, UserX, KeyRound } from '@lucide/vue';
import { isUnlocked, lock, logout } from '../composables/useVault';
import { showDeleteDialog, openDeleteDialog, closeDeleteDialog, showPasswordDialog, openPasswordDialog, closePasswordDialog, } from '../composables/useAccountDialog';
import DeleteAccountModal from './DeleteAccountModal.vue';
import ChangePasswordModal from './ChangePasswordModal.vue';

defineProps<{ active: 'links' | 'notes' | 'chat'; wide?: boolean }>();

const tabs = [
  { id: 'links', href: '/links', label: 'Link', icon: LinkIcon },
  { id: 'notes', href: '/notes', label: 'Catatan', icon: StickyNote },
  { id: 'chat', href: '/chat', label: 'Chat', icon: MessageSquare },
];
const btn = 'flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md hover:bg-white/10';
</script>

<template>
  <div class="shrink-0">
    <header class="bg-corporate-primary text-white">
      <div :class="['mx-auto px-2 sm:px-4 h-14 flex items-center justify-between gap-2', wide ? '' : 'max-w-4xl']">
        <nav class="flex gap-1 font-bold">
          <a v-for="t in tabs" :key="t.id" :href="t.href" :title="t.label"
            :class="['flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md',
              active === t.id ? 'bg-deep-blue' : 'hover:bg-white/10']">
            <component :is="t.icon" :size="16" />
            <span class="hidden sm:inline">{{ t.label }}</span>
          </a>
        </nav>
        <div class="flex items-center gap-1 text-sm">
          <button v-if="isUnlocked" @click="lock" title="Kunci brankas" :class="btn">
            <Lock :size="16" /><span class="hidden sm:inline">Kunci</span>
          </button>
          <button @click="openPasswordDialog" title="Ganti password" :class="btn">
            <KeyRound :size="16" /><span class="hidden sm:inline">Ganti password</span>
          </button>
          <button @click="openDeleteDialog" title="Hapus akun"
            class="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md hover:bg-red-500/30">
            <UserX :size="16" /><span class="hidden sm:inline">Hapus akun</span>
          </button>
          <button @click="logout" title="Keluar" :class="btn">
            <LogOut :size="16" /><span class="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
    <DeleteAccountModal v-if="showDeleteDialog" @close="closeDeleteDialog" />
    <ChangePasswordModal v-if="showPasswordDialog" @close="closePasswordDialog" />
  </div>
</template>
