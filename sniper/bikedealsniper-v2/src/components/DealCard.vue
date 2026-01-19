<script setup lang="ts">
type Deal = {
  title: string;
  price: number;
  oldPrice?: number;
  discountPercent: number;
  token?: string;
  coupon_code?: string;
  imageUrl?: string | null;
};

defineProps<{ deal: Deal }>();
</script>

<template>
  <article
    class="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:shadow-md"
  >
    <div class="relative aspect-[16/10] bg-slate-100">
      <div
        class="absolute left-3 top-3 rounded-xl bg-orange-500 px-2 py-1 text-xs font-bold text-black"
      >
        -{{ deal.discountPercent }}%
      </div>
      <div
        class="absolute inset-0 flex items-center justify-center text-slate-400"
      >
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
    </div>

    <div class="p-4">
      <div class="line-clamp-2 text-sm font-semibold text-slate-900">
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
