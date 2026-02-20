<script setup lang="ts">
import axios from 'axios';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ADMIN_REDIRECT_KEY } from '../router';

const route = useRoute();
const router = useRouter();

const password = ref('');
const remember = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');

// Return the saved post-login route and clear it from session storage.
const consumeRedirectPath = () => {
  const savedPath = sessionStorage.getItem(ADMIN_REDIRECT_KEY);
  sessionStorage.removeItem(ADMIN_REDIRECT_KEY);
  return savedPath || '/admin';
};

// Check if a route query indicates access was blocked by missing auth.
const showUnauthorizedHint = computed(() => route.query.reason === 'auth');

// Verify that the authenticated session is visible after login.
const verifySession = async () => {
  const response = await axios.get('/api/admin/session', { withCredentials: true });
  return Boolean(response.data?.authenticated);
};

// Submit admin login credentials and navigate to the protected admin route.
const submitLogin = async () => {
  if (!password.value || isSubmitting.value) {
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    await axios.post(
      '/api/admin/login',
      { password: password.value, remember: remember.value },
      { withCredentials: true }
    );

    const authenticated = await verifySession();
    if (!authenticated) {
      errorMessage.value = 'Login succeeded but session cookies were blocked. Enable cookies and try again.';
      return;
    }

    const redirectPath = consumeRedirectPath();
    await router.push(redirectPath);
  } catch (error: unknown) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401) {
      errorMessage.value = 'Invalid password.';
    } else if (status === 429) {
      errorMessage.value = 'Too many attempts. Please wait and retry.';
    } else {
      errorMessage.value = 'Unable to sign in right now.';
    }
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <main class="app admin-page">
    <section class="admin-card">
      <h1>Admin Login</h1>
      <p v-if="showUnauthorizedHint" class="admin-note">You must sign in to access the admin section.</p>

      <form class="admin-form" @submit.prevent="submitLogin">
        <label class="admin-label" for="admin-password">Password</label>
        <input
          id="admin-password"
          v-model="password"
          class="admin-input"
          type="password"
          name="password"
          autocomplete="current-password"
          required
        />

        <label class="admin-checkbox">
          <input v-model="remember" type="checkbox" />
          <span>Remember this session for 7 days</span>
        </label>

        <button class="admin-btn" type="submit" :disabled="isSubmitting || !password">
          {{ isSubmitting ? 'Signing in...' : 'Sign in' }}
        </button>
      </form>

      <p v-if="errorMessage" class="admin-error">{{ errorMessage }}</p>
    </section>
  </main>
</template>
