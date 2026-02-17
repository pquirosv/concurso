<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { RouterLink, RouterView } from 'vue-router';

const route = useRoute();
const inAdminRoute = computed(() => String(route.name || '').startsWith('admin'));
</script>

<template>
  <div class="shell">
    <header class="top-nav">
      <RouterLink v-if="inAdminRoute" class="top-link" to="/">Return to Quiz</RouterLink>
      <RouterLink v-else class="top-link" to="/admin">Admin</RouterLink>
    </header>
    <RouterView />
  </div>
</template>
