<script setup lang="ts">
defineProps<{
  shown: number;
  total: number;
}>();
</script>
<template>
  <section class="relative overflow-hidden bg-slate-950">
    <div class="absolute inset-0 opacity-20">
      <div
        class="h-full w-full bg-gradient-to-br from-orange-500/30 via-slate-900 to-slate-950"
      ></div>
    </div>

    <div class="relative mx-auto max-w-7xl px-4 py-10">
      <h1 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Les bons plans RCZ, en direct.
      </h1>
      <p class="mt-2 max-w-2xl text-white/70">
        Prix cassés, codes promo, lien direct — mis à jour en temps réel.
      </p>

      <div
        class="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm text-white/90"
      >
        <span
          class="inline-flex h-7 items-center rounded-xl bg-orange-500/20 px-2 font-semibold text-orange-200"
        >
          🔥 Deals en temps réel
        </span>
        <span class="text-white/60">
          <template v-if="shown === total">
            {{ total }}
          </template>
          <template v-else> {{ shown }} / {{ total }} </template>
          {{ shown > 1 ? "bons plans disponibles" : "bon plan disponible" }}
        </span>
      </div>
    </div>
  </section>
</template>
