<script setup lang="ts">
import axios from 'axios';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const LOCAL_STORAGE_TABLE_SORT_KEY = 'admin_table_sort_order';

const router = useRouter();
const isLoading = ref(true);
const apiStatus = ref('Checking protected endpoint...');
const sortOrder = ref<'asc' | 'desc'>('asc');

// Load a non-sensitive UI preference from local storage.
const loadSortPreference = () => {
  const savedOrder = localStorage.getItem(LOCAL_STORAGE_TABLE_SORT_KEY);
  if (savedOrder === 'desc') {
    sortOrder.value = 'desc';
  }
};

// Save a non-sensitive UI preference to local storage.
const saveSortPreference = () => {
  localStorage.setItem(LOCAL_STORAGE_TABLE_SORT_KEY, sortOrder.value);
};

// Ensure the current browser session is still authenticated as admin.
const ensureAuthenticated = async () => {
  const response = await axios.get('/api/admin/session', { withCredentials: true });
  if (!response.data?.authenticated) {
    await router.push({ name: 'admin-login', query: { reason: 'auth' } });
    return false;
  }
  return true;
};

// Request a protected admin endpoint to demonstrate backend route protection.
const loadProtectedHealth = async () => {
  const response = await axios.get('/api/admin/health', { withCredentials: true });
  apiStatus.value = response.data?.status || 'unknown';
};

// Initialize admin dashboard state after the component mounts.
onMounted(async () => {
  loadSortPreference();
  saveSortPreference();
  try {
    const authenticated = await ensureAuthenticated();
    if (!authenticated) {
      return;
    }
    await loadProtectedHealth();
  } catch (error) {
    console.error(error);
    apiStatus.value = 'Failed to load protected endpoint.';
  } finally {
    isLoading.value = false;
  }
});

// Logout the current admin session and redirect to the login page.
const logout = async () => {
  try {
    await axios.post('/api/admin/logout', {}, { withCredentials: true });
  } catch (error) {
    console.error(error);
  } finally {
    await router.push('/admin/login');
  }
};
</script>

<template>
  <main class="app admin-page">
    <section class="admin-card">
      <h1>Admin</h1>
      <p class="admin-note">Authenticated admin route protected by server session middleware.</p>

      <div class="admin-field">
        <label class="admin-label" for="admin-sort">UI sort preference (localStorage):</label>
        <select id="admin-sort" v-model="sortOrder" class="admin-input" @change="saveSortPreference">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      <p class="admin-note" v-if="isLoading">Loading...</p>
      <p class="admin-note" v-else>Protected API status: {{ apiStatus }}</p>

      <button class="admin-btn admin-btn-secondary" type="button" @click="logout">Log out</button>
    </section>
  </main>
</template>
