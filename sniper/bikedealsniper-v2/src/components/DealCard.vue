<script setup lang="ts">
import type { DealUi } from "@/lib/mappers/dealMapper";

defineProps<{ deal: DealUi }>();
</script>

<template>
  <article
    class="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:shadow-md"
  >
    <div class="relative aspect-[16/10] bg-slate-100">
      <!-- ✅ Overlay gauche : discount -->
      <div class="absolute left-3 top-3 z-10">
        <span
          v-if="deal.discountPercent != null"
          class="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-xs font-extrabold text-white"
        >
          -{{ Math.round(deal.discountPercent) }}%
        </span>
      </div>

      <!-- ✅ Overlay droite : stock + vendu -->
      <div class="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
        <span
          v-if="deal.stock_delay === 0"
          class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
        >
          En stock
        </span>

        <span
          v-else-if="deal.stock_delay != null && deal.stock_delay > 0"
          class="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700"
        >
          ⏳ {{ deal.stock_delay }} j ouvrés
        </span>
      </div>
      <!-- 🔴 Bandeau diagonal VENDU (plein cadre) -->
      <div
        v-if="deal.available === false"
        class="absolute inset-0 z-20 pointer-events-none overflow-hidden"
      >
        <div
          class="absolute left-1/2 top-1/2 w-[240%] -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] bg-red-600 text-white text-sm font-extrabold tracking-wider text-center py-3 shadow-lg antialiased subpixel-antialiased transform-gpu"
        >
          VENDU
        </div>
      </div>

      <!-- ✅ Image / fallback -->
      <img
        v-if="deal.imageUrl"
        :src="deal.imageUrl"
        :alt="deal.title"
        class="h-full w-full object-contain p-4 transition group-hover:scale-[1.02]"
        loading="lazy"
      />
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center text-slate-400"
      >
        Pas d’image
      </div>
    </div>

    <div class="p-4">
      <div
        class="line-clamp-2 text-sm font-semibold text-slate-900"
        :title="deal.title"
      >
        {{ deal.title }}
      </div>

      <div class="mt-3 flex items-baseline gap-2">
        <div class="text-lg font-bold text-slate-900">
          {{ deal.price.toFixed(2) }}€
        </div>
        <div v-if="deal.oldPrice" class="text-sm text-slate-400 line-through">
          {{ deal.oldPrice.toFixed(2) }}€
        </div>
      </div>

      <div class="mt-4">
        <button
          class="w-full rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          Voir l’offre →
        </button>
      </div>
    </div>
  </article>
</template>
