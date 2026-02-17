<script setup>
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="shell">
    <header class="top-nav">
      <RouterLink class="top-link" to="/">Quiz</RouterLink>
      <RouterLink class="top-link" to="/admin">Admin</RouterLink>
    </header>
    <RouterView />
  </div>
</template>
