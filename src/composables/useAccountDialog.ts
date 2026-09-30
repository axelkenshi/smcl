import { ref } from 'vue';

export const showDeleteDialog = ref(false);
export const openDeleteDialog = () => { showDeleteDialog.value = true; };
export const closeDeleteDialog = () => { showDeleteDialog.value = false; };

export const showPasswordDialog = ref(false);
export const openPasswordDialog = () => { showPasswordDialog.value = true; };
export const closePasswordDialog = () => { showPasswordDialog.value = false; };
