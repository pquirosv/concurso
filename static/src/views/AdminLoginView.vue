<script setup lang="ts">
import axios from 'axios';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { ADMIN_REDIRECT_KEY } from '../router';

type LoginError = '' | 'invalid-password' | 'rate-limited' | 'cookie-blocked' | 'unknown';

const router = useRouter();

const password = ref('');
const remember = ref(true);
const isSubmitting = ref(false);
const loginError = ref<LoginError>('');
const cooldownUntilMs = ref(0);
const nowMs = ref(Date.now());
const cooldownStorageKey = 'admin_login_cooldown_until_ms';
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

// Parse Retry-After header values as seconds, including HTTP-date fallback parsing.
const parseRetryAfterSeconds = (retryAfterHeader: string | undefined) => {
  if (!retryAfterHeader) {
    return 0;
  }

  const parsedSeconds = Number.parseInt(retryAfterHeader, 10);
  if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
    return parsedSeconds;
  }

  const retryAfterDateMs = Date.parse(retryAfterHeader);
  if (Number.isNaN(retryAfterDateMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((retryAfterDateMs - Date.now()) / 1000));
};

// Stop the active cooldown interval ticker if one is running.
const stopCooldownTicker = () => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
};

// Persist a cooldown deadline in localStorage, or clear it when no cooldown is active.
const persistCooldownUntilMs = (cooldownUntil: number) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (cooldownUntil <= 0) {
    window.localStorage.removeItem(cooldownStorageKey);
    return;
  }

  window.localStorage.setItem(cooldownStorageKey, String(cooldownUntil));
};

// Read and sanitize any persisted cooldown timestamp from localStorage.
const readPersistedCooldownUntilMs = () => {
  if (typeof window === 'undefined') {
    return 0;
  }

  const rawValue = window.localStorage.getItem(cooldownStorageKey);
  if (!rawValue) {
    return 0;
  }

  const cooldownUntilMs = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(cooldownUntilMs)) {
    persistCooldownUntilMs(0);
    return 0;
  }

  return cooldownUntilMs;
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

const cooldownRemainingSeconds = computed(() =>
  Math.max(0, Math.ceil((cooldownUntilMs.value - nowMs.value) / 1000))
);

const isCooldownActive = computed(() => cooldownRemainingSeconds.value > 0);

const errorMessage = computed(() => {
  switch (loginError.value) {
    case 'invalid-password':
      return 'Invalid password.';
    case 'rate-limited':
      return isCooldownActive.value
        ? `Too many attempts. Please wait ${cooldownRemainingSeconds.value}s and retry.`
        : 'Too many attempts. Please wait and retry.';
    case 'cookie-blocked':
      return 'Login succeeded but session cookies were blocked. Enable cookies and try again.';
    case 'unknown':
      return 'Unable to sign in right now.';
    default:
      return '';
  }
});

// Reset invalid password feedback when the user edits the password field.
watch(password, () => {
  if (loginError.value === 'invalid-password') {
    loginError.value = '';
  }
});

// Run a single interval lifecycle that powers live cooldown countdown updates.
watch(
  cooldownUntilMs,
  (cooldownUntil) => {
    stopCooldownTicker();
    nowMs.value = Date.now();
    persistCooldownUntilMs(cooldownUntil);

    if (cooldownUntil <= nowMs.value) {
      if (cooldownUntil > 0 && loginError.value === 'rate-limited') {
        loginError.value = '';
      }
      if (cooldownUntil > 0) {
        cooldownUntilMs.value = 0;
      }
      return;
    }

    cooldownTimer = setInterval(() => {
      nowMs.value = Date.now();
      if (nowMs.value >= cooldownUntilMs.value) {
        stopCooldownTicker();
        cooldownUntilMs.value = 0;
        if (loginError.value === 'rate-limited') {
          loginError.value = '';
        }
      }
    }, 1000);
  }
);

// Submit admin login credentials and navigate to the protected admin route.
const submitLogin = async () => {
  if (!password.value || isSubmitting.value || isCooldownActive.value) {
    return;
  }

  isSubmitting.value = true;
  loginError.value = '';

  try {
    await axios.post(
      '/api/admin/login',
      { password: password.value, remember: remember.value },
      { withCredentials: true }
    );

    const authenticated = await verifySession();
    if (!authenticated) {
      loginError.value = 'cookie-blocked';
      return;
    }

    const redirectPath = consumeRedirectPath();
    await router.push(redirectPath);
  } catch (error: unknown) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401) {
      loginError.value = 'invalid-password';
    } else if (status === 429) {
      const retryAfterHeader = axios.isAxiosError(error)
        ? (error.response?.headers?.['retry-after'] as string | string[] | undefined)
        : undefined;
      const retryAfterValue = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
      const retryAfterSeconds = parseRetryAfterSeconds(retryAfterValue);
      loginError.value = 'rate-limited';
      nowMs.value = Date.now();
      cooldownUntilMs.value = retryAfterSeconds > 0 ? nowMs.value + retryAfterSeconds * 1000 : 0;
    } else {
      loginError.value = 'unknown';
    }
  } finally {
    isSubmitting.value = false;
  }
};

// Recover persisted cooldown state after the login page is mounted.
onMounted(() => {
  const persistedCooldownUntilMs = readPersistedCooldownUntilMs();
  if (persistedCooldownUntilMs <= Date.now()) {
    persistCooldownUntilMs(0);
    return;
  }

  cooldownUntilMs.value = persistedCooldownUntilMs;
  loginError.value = 'rate-limited';
});

// Dispose cooldown timers when leaving the login page.
onBeforeUnmount(() => {
  stopCooldownTicker();
});
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
          {{ isSubmitting ? 'Signing in...' : isCooldownActive ? `Try again in ${cooldownRemainingSeconds}s` : 'Sign in' }}
        </button>
      </form>

      <p v-if="errorMessage" class="admin-error">{{ errorMessage }}</p>
    </section>
  </main>
</template>
