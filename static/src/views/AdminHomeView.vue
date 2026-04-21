<script setup lang="ts">
import axios from 'axios';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import EasyDataTable from 'vue3-easy-data-table';
import type { Header } from 'vue3-easy-data-table';
import 'vue3-easy-data-table/dist/style.css';

type AdminPhoto = {
  _id: string;
  name?: string;
  fileName?: string;
  year?: number;
  city?: string;
  isPublic?: boolean;
};

const tableHeaders: Header[] = [
  { text: 'Nombre', value: 'name', sortable: true },
  { text: 'Año', value: 'year', sortable: true },
  { text: 'Ciudad', value: 'city', sortable: true },
  { text: 'Pública', value: 'isPublic', sortable: true },
  { text: 'Editar', value: 'edit' },
  { text: 'Borrar', value: 'delete' },
];

const rowsPerPage = 10;
const rowsPerPageOptions = [5, 10, 25, 50];

const router = useRouter();
const isLoading = ref(true);
const errorMessage = ref('');
const photos = ref<AdminPhoto[]>([]);
const savingId = ref('');
const deletingId = ref('');
const editingId = ref('');
const publishingId = ref('');
const editForm = ref({ year: '', city: '' });

// Return the displayable file key used for links and table identity.
const getPhotoFileKey = (photo: AdminPhoto) => photo.fileName || photo.name || '';

// Return an encoded public photo URL for the selected record.
const getPhotoLink = (photo: AdminPhoto) => `/api/photos/file/${encodeURIComponent(getPhotoFileKey(photo))}`;

// Ensure the current browser session is still authenticated as admin.
const ensureAuthenticated = async () => {
  const response = await axios.get('/api/admin/session', { withCredentials: true });
  if (!response.data?.authenticated) {
    await router.push({ name: 'admin-login', query: { reason: 'auth' } });
    return false;
  }
  return true;
};

// Convert unknown API payload into a normalized admin photo list.
const normalizePhotos = (payload: unknown): AdminPhoto[] => {
  if (Array.isArray(payload)) {
    return payload as AdminPhoto[];
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)) {
    return (payload as { items: AdminPhoto[] }).items;
  }

  return [];
};

// Fetch the admin photo list from the protected backend endpoint.
const loadPhotos = async () => {
  errorMessage.value = '';
  const response = await axios.get('/api/admin/photos', { withCredentials: true });
  photos.value = normalizePhotos(response.data);
};

// Fill the inline edit form from the selected photo row values.
const openEditForm = (photo: AdminPhoto) => {
  editingId.value = photo._id;
  editForm.value = {
    year: photo.year != null ? String(photo.year) : '',
    city: photo.city || '',
  };
};

// Cancel the active edit session and clear temporary form state.
const cancelEditForm = () => {
  editingId.value = '';
  editForm.value = { year: '', city: '' };
};

// Submit a metadata update request for the currently selected photo.
const submitEdit = async (photoId: string) => {
  savingId.value = photoId;
  errorMessage.value = '';

  try {
    const payload = {
      year: editForm.value.year === '' ? '' : Number(editForm.value.year),
      city: editForm.value.city.trim(),
    };

    const response = await axios.patch(`/api/admin/photos/${photoId}`, payload, { withCredentials: true });
    photos.value = photos.value.map((photo) => (photo._id === photoId ? { ...photo, ...response.data } : photo));
    cancelEditForm();
  } catch (error) {
    console.error(error);
    errorMessage.value = 'Fallo al guardar los cambios.';
  } finally {
    savingId.value = '';
  }
};

// Update whether a photo is visible to public quiz users.
const updatePublicVisibility = async (photo: AdminPhoto, isPublic: boolean) => {
  publishingId.value = photo._id;
  errorMessage.value = '';

  try {
    const response = await axios.patch(`/api/admin/photos/${photo._id}`, { isPublic }, { withCredentials: true });
    photos.value = photos.value.map((item) => (item._id === photo._id ? { ...item, ...response.data } : item));
  } catch (error) {
    console.error(error);
    errorMessage.value = 'Fallo al cambiar la visibilidad pública.';
  } finally {
    publishingId.value = '';
  }
};

// Read checkbox state from the visibility toggle change event.
const handlePublicVisibilityChange = (photo: AdminPhoto, event: Event) => {
  updatePublicVisibility(photo, (event.target as HTMLInputElement).checked);
};

// Confirm and delete one photo record from the admin list.
const deletePhoto = async (photo: AdminPhoto) => {
  const confirmed = window.confirm(`Delete ${getPhotoFileKey(photo)}?`);
  if (!confirmed) {
    return;
  }

  deletingId.value = photo._id;
  errorMessage.value = '';

  try {
    await axios.delete(`/api/admin/photos/${photo._id}`, { withCredentials: true });
    photos.value = photos.value.filter((item) => item._id !== photo._id);
    if (editingId.value === photo._id) {
      cancelEditForm();
    }
  } catch (error) {
    console.error(error);
    errorMessage.value = 'Fallo al borrar la foto.';
  } finally {
    deletingId.value = '';
  }
};

// Return true when at least one editable field contains a value.
const isEditFormValid = computed(() => {
  const hasYear = editForm.value.year !== '';
  const hasCity = editForm.value.city.trim().length > 0;
  return hasYear || hasCity;
});

// Initialize admin dashboard data after component mount.
onMounted(async () => {
  try {
    const authenticated = await ensureAuthenticated();
    if (!authenticated) {
      return;
    }
    await loadPhotos();
  } catch (error) {
    console.error(error);
    errorMessage.value = 'Fallo al cargar las fotos. Intenta recargar la página.';
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <main class="app admin-page">
    <section class="admin-card admin-card-table">
      <h1>Tabla de fotos</h1>

      <p v-if="isLoading" class="admin-note">Cargando...</p>
      <p v-else-if="errorMessage" class="admin-error">{{ errorMessage }}</p>

      <div v-if="!isLoading" class="table-wrapper">
        <EasyDataTable
          :headers="tableHeaders"
          :items="photos"
          :rows-per-page="rowsPerPage"
          :rows-items="rowsPerPageOptions"
          header-text-direction="left"
          body-text-direction="left"
          table-class-name="admin-data-table"
          empty-message="No photos found."
          buttons-pagination
        >
          <template #item-name="photo">
            <a :href="getPhotoLink(photo)" class="photo-link">{{ getPhotoFileKey(photo) }}</a>
          </template>
          <template #item-year="photo">
            <template v-if="editingId === photo._id">
              <input v-model="editForm.year" type="number" class="admin-input" />
            </template>
            <template v-else>{{ photo.year }}</template>
          </template>
          <template #item-city="photo">
            <template v-if="editingId === photo._id">
              <input v-model="editForm.city" type="text" class="admin-input" />
            </template>
            <template v-else>{{ photo.city }}</template>
          </template>
          <template #item-isPublic="photo">
            <input
              type="checkbox"
              class="admin-checkbox-input"
              :checked="Boolean(photo.isPublic)"
              :disabled="publishingId === photo._id"
              :aria-label="`Hacer pública ${getPhotoFileKey(photo)}`"
              @change="handlePublicVisibilityChange(photo, $event)"
            />
          </template>
          <template #item-edit="photo">
            <div class="actions">
              <button
                v-if="editingId !== photo._id"
                type="button"
                class="admin-button"
                @click="openEditForm(photo)"
              >
                Editar
              </button>
              <template v-else>
                <button
                  type="button"
                  class="admin-button"
                  :disabled="savingId === photo._id || !isEditFormValid"
                  @click="submitEdit(photo._id)"
                >
                  {{ savingId === photo._id ? 'Guardando...' : 'Guardar' }}
                </button>
                <button type="button" class="admin-button secondary" @click="cancelEditForm">Cancelar</button>
              </template>
            </div>
          </template>
          <template #item-delete="photo">
            <button
              type="button"
              class="admin-button danger"
              :disabled="deletingId === photo._id"
              @click="deletePhoto(photo)"
            >
              {{ deletingId === photo._id ? 'Borrando...' : 'Borrar' }}
            </button>
          </template>
        </EasyDataTable>
      </div>
    </section>
  </main>
</template>
