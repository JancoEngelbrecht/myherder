<template>
  <template v-if="authStore.hydrated">
    <RouterView v-slot="{ Component, route }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
    <BottomNav v-if="authStore.isAuthenticated" />
  </template>
</template>

<script setup>
import { useAuthStore } from './stores/auth.js'
import BottomNav from './components/organisms/BottomNav.vue'

const authStore = useAuthStore()
</script>
