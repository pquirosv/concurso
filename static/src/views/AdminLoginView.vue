<script setup lang="ts">
import axios from 'axios';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { ADMIN_REDIRECT_KEY } from '../router';

const router = useRouter();

const password = ref('');
const remember = ref(true);
const isSubmitting = ref(false);
const isCooldownActive = ref(false);
const errorMessage = ref('');
let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

// Prevent additional login attempts until cooldown expires.
const startCooldown = (retryAfterSeconds: number) => {
  isCooldownActive.value = true;

  if (cooldownTimer) {
    clearTimeout(cooldownTimer);
  }

  cooldownTimer = setTimeout(() => {
    isCooldownActive.value = false;
    cooldownTimer = null;
  }, Math.max(0, retryAfterSeconds) * 1000);
};

// Return the saved post-login route and clear it from session storage.
const consumeRedirectPath = () => {
  const savedPath = sessionStorage.getItem(ADMIN_REDIRECT_KEY);
  sessionStorage.removeItem(ADMIN_REDIRECT_KEY);
  return savedPath || '/admin';
};

// Verify that the authenticated session is visible after login.
const verifySession = async () => {
  const response = await axios.get('/api/admin/session', { withCredentials: true });
  return Boolean(response.data?.authenticated);
};

// Submit admin login credentials and navigate to the protected admin route.
const submitLogin = async () => {
  if (!password.value || isSubmitting.value || isCooldownActive.value) {
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
      const retryAfterRaw = axios.isAxiosError(error) ? error.response?.headers?.['retry-after'] : undefined;
      const retryAfterSeconds = Number.parseInt(String(retryAfterRaw || ''), 10);
      startCooldown(Number.isNaN(retryAfterSeconds) ? 0 : retryAfterSeconds);
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
      <h2>Panel de administración</h2>
      <form class="admin-form" @submit.prevent="submitLogin">
        <label class="admin-label" for="admin-password">Contraseña</label>
        <input
          id="admin-password"
          v-model="password"
          class="admin-input"
          type="password"
          name="password"
          required
        />

        <label class="admin-checkbox">
          <input v-model="remember" type="checkbox" />
          <span>Recordar sesión durante 7 días</span>
        </label>

        <button class="admin-btn" type="submit" :disabled="isSubmitting || isCooldownActive || !password">
          {{ isSubmitting ? 'Signing in...' : 'Sign in' }}
        </button>
      </form>

      <p v-if="errorMessage" class="admin-error">{{ errorMessage }}</p>
    </section>
  </main>
</template>
