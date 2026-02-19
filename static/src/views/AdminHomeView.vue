<script setup lang="ts">
import axios from 'axios';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Page from 'v-page';
import 'v-page/lib/v-page.css';

type AdminPhoto = {
  _id: string;
  name?: string;
  fileName?: string;
  year?: number;
  city?: string;
};

const router = useRouter();
const isLoading = ref(true);
const errorMessage = ref('');
const photos = ref<AdminPhoto[]>([]);
const totalPhotos = ref(0);
const currentPage = ref(1);
const defaultPageSize = 25;
const pageSize = ref(defaultPageSize);
const savingId = ref('');
const deletingId = ref('');
const editingId = ref('');
const editForm = ref({ year: '', city: '' });

// Return the displayable file key used for links and table identity.
const getPhotoFileKey = (photo: AdminPhoto) => photo.fileName || photo.name || '';

// Return an encoded public photo URL for the selected record.
const getPhotoLink = (photo: AdminPhoto) => `/fotos/${encodeURIComponent(getPhotoFileKey(photo))}`;

// Ensure the current browser session is still authenticated as admin.
const ensureAuthenticated = async () => {
  const response = await axios.get('/api/admin/session', { withCredentials: true });
  if (!response.data?.authenticated) {
    await router.push({ name: 'admin-login', query: { reason: 'auth' } });
    return false;
  }
  return true;
};

// Convert unknown API payload into the paginated admin photo items list.
const normalizePhotos = (payload: unknown): AdminPhoto[] => {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)) {
    return (payload as { items: AdminPhoto[] }).items;
  }

  return [];
};

// Fetch the admin photo list from the protected backend endpoint.
const loadPhotos = async (page = currentPage.value) => {
  currentPage.value = page;
  errorMessage.value = '';
  const response = await axios.get('/api/admin/photos', {
    params: { page },
    withCredentials: true,
  });
  photos.value = normalizePhotos(response.data);
  totalPhotos.value = Number((response.data as { total?: number })?.total ?? photos.value.length);
  pageSize.value = Number((response.data as { limit?: number })?.limit ?? defaultPageSize);
};

// Load a selected page when the admin interacts with pagination controls.
const onPageChange = async (page: number) => {
  isLoading.value = true;
  try {
    await loadPhotos(page);
  } catch (error) {
    console.error(error);
    errorMessage.value = 'Failed to load admin photos.';
  } finally {
    isLoading.value = false;
  }
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
    errorMessage.value = 'Failed to update photo.';
  } finally {
    savingId.value = '';
  }
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
    const nextPage = photos.value.length === 1 && currentPage.value > 1 ? currentPage.value - 1 : currentPage.value;
    await loadPhotos(nextPage);
    if (editingId.value === photo._id) {
      cancelEditForm();
    }
  } catch (error) {
    console.error(error);
    errorMessage.value = 'Failed to delete photo.';
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
    errorMessage.value = 'Failed to load admin photos.';
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <main class="app admin-page">
    <section class="admin-card">
      <h1>Admin Photos</h1>
      <p class="admin-note">Manage photo metadata records.</p>

      <p v-if="isLoading" class="admin-note">Loading...</p>
      <p v-else-if="errorMessage" class="admin-error">{{ errorMessage }}</p>

      <div v-if="!isLoading" class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>name</th>
              <th>year</th>
              <th>city</th>
              <th>edit</th>
              <th>delete</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="photo in photos" :key="photo._id">
              <td>
                <a :href="getPhotoLink(photo)" class="photo-link">{{ getPhotoFileKey(photo) }}</a>
              </td>
              <td>
                <template v-if="editingId === photo._id">
                  <input v-model="editForm.year" type="number" class="admin-input" />
                </template>
                <template v-else>{{ photo.year }}</template>
              </td>
              <td>
                <template v-if="editingId === photo._id">
                  <input v-model="editForm.city" type="text" class="admin-input" />
                </template>
                <template v-else>{{ photo.city }}</template>
              </td>
              <td>
                <div class="actions">
                  <button
                    v-if="editingId !== photo._id"
                    type="button"
                    class="admin-button"
                    @click="openEditForm(photo)"
                  >
                    Edit
                  </button>
                  <template v-else>
                    <button
                      type="button"
                      class="admin-button"
                      :disabled="savingId === photo._id || !isEditFormValid"
                      @click="submitEdit(photo._id)"
                    >
                      {{ savingId === photo._id ? 'Saving...' : 'Save' }}
                    </button>
                    <button type="button" class="admin-button secondary" @click="cancelEditForm">Cancel</button>
                  </template>
                </div>
              </td>
              <td>
                <button
                  type="button"
                  class="admin-button danger"
                  :disabled="deletingId === photo._id"
                  @click="deletePhoto(photo)"
                >
                  {{ deletingId === photo._id ? 'Deleting...' : 'Delete' }}
                </button>
              </td>
            </tr>
            <tr v-if="photos.length === 0">
              <td colspan="5" class="admin-note">No photos found.</td>
            </tr>
          </tbody>
        </table>

        <Page
          v-if="totalPhotos > pageSize"
          v-model="currentPage"
          :total-row="totalPhotos"
          :page-size="pageSize"
          @change="onPageChange"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  padding: 1.5rem;
}

.admin-card {
  width: min(96vw, 78rem);
  min-height: calc(100vh - 3rem);
  max-width: none;
}

.table-wrapper {
  overflow-x: auto;
}

.photo-link {
  color: var(--color-muted);
  text-decoration: none;
}

.photo-link:hover,
.photo-link:focus-visible {
  text-decoration: underline;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th,
.admin-table td {
  border: 1px solid #dedede;
  padding: 0.5rem;
  text-align: left;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.admin-error {
  color: #a11;
}

.admin-button {
  cursor: pointer;
}

.admin-button.secondary {
  opacity: 0.9;
}

.admin-button.danger {
  color: #a11;
}
</style>
