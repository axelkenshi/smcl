import { ref } from 'vue';

export const showDeleteDialog = ref(false);
export const openDeleteDialog = () => { showDeleteDialog.value = true; };
export const closeDeleteDialog = () => { showDeleteDialog.value = false; };
