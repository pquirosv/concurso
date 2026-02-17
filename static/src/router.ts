import axios from 'axios';
import { createRouter, createWebHistory } from 'vue-router';

import AdminHomeView from './views/AdminHomeView.vue';
import AdminLoginView from './views/AdminLoginView.vue';
import QuizView from './views/QuizView.vue';

const ADMIN_REDIRECT_KEY = 'admin_redirect_path';

// Save the pending admin path so login can redirect back after success.
const saveAdminRedirectPath = (path: string) => {
  sessionStorage.setItem(ADMIN_REDIRECT_KEY, path);
};

// Return true if the backend reports an authenticated admin session.
const fetchAdminSessionStatus = async (): Promise<boolean> => {
  try {
    const response = await axios.get('/api/admin/session', { withCredentials: true });
    return Boolean(response.data?.authenticated);
  } catch (error) {
    console.error(error);
    return false;
  }
};

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'quiz', component: QuizView },
    { path: '/admin/login', name: 'admin-login', component: AdminLoginView },
    {
      path: '/admin',
      name: 'admin-home',
      component: AdminHomeView,
      meta: { requiresAdmin: true },
    },
  ],
});

// Gate admin routes by validating server-side session state on navigation.
router.beforeEach(async (to) => {
  if (to.meta.requiresAdmin !== true) {
    return true;
  }

  const authenticated = await fetchAdminSessionStatus();
  if (authenticated) {
    return true;
  }

  saveAdminRedirectPath(to.fullPath);
  return {
    name: 'admin-login',
    query: { reason: 'auth' },
  };
});

// Redirect authenticated admins away from the login page.
router.beforeEach(async (to) => {
  if (to.name !== 'admin-login') {
    return true;
  }

  const authenticated = await fetchAdminSessionStatus();
  if (!authenticated) {
    return true;
  }

  return { name: 'admin-home' };
});

export default router;
export { ADMIN_REDIRECT_KEY };
