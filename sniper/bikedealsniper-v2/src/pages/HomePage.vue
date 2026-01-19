<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import HeroBanner from "@/components/HeroBanner.vue";
import FiltersSidebar from "@/components/FiltersSidebar.vue";
import DealCard from "@/components/DealCard.vue";
import { getAllDealsPublic } from "@/lib/dealsApi";

type DealRow = Record<string, any>;

const loading = ref(true);
const errorMsg = ref<string>("");

const rows = ref<DealRow[]>([]);

onMounted(async () => {
  loading.value = true;
  errorMsg.value = "";
  try {
    rows.value = await getAllDealsPublic();
    console.log("ROW0", rows.value?.[0]);
console.log("desc_ai_fr in row0?", rows.value?.[0]?.desc_ai_fr);

  } catch (e: any) {
    console.error(e);
    errorMsg.value = e?.message || "Erreur Supabase (RPC get_all_deals_public).";
  } finally {
    loading.value = false;
  }
});

/**
 * Mapping: adapte ici si tes noms de colonnes sont différents.
 * (Je pars sur des noms "probables".)
 */
const deals = computed(() =>
  rows.value.map((r) => ({
    token: String(r.token),             
    coupon_code: r.coupon_code ?? null,  
    title: String(r.title),
    price: Number(r.price_current),
    oldPrice: r.price_original != null ? Number(r.price_original) : undefined,
    discountPercent: Number(r.prct_discount),
    imageUrl: r.image ?? null,       
    desc_ai_fr: r.desc_ai_fr ?? null,
  }))
);
</script>

<template>
  <HeroBanner />

  <main class="bg-slate-50">
    <div class="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 md:grid-cols-[280px_1fr]">
      <FiltersSidebar />

      <section>
        <div class="mb-4 flex items-center justify-between gap-3">
          <div class="text-sm text-slate-600">
            <span class="font-semibold text-slate-900">
              {{ loading ? "…" : deals.length }}
            </span>
            bons plans
          </div>

          <div class="flex items-center gap-2">
            <select class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option>Pertinence</option>
              <option>Prix</option>
              <option>Remise</option>
            </select>
          </div>
        </div>

        <div v-if="errorMsg" class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {{ errorMsg }}
        </div>

        <div v-else-if="loading" class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="i in 9" :key="i" class="h-72 rounded-2xl bg-white shadow-sm"></div>
        </div>

        <div v-else-if="deals.length === 0" class="rounded-2xl border border-black/5 bg-white p-6 text-sm text-slate-700">
          Aucun deal disponible.
        </div>

        <div v-else class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="d in deals"
            :key="d.token"
            :to="`/deal/${encodeURIComponent(d.token)}`"
            class="block"
          >
            <DealCard :deal="d" />
          </RouterLink>
        </div>
      </section>
    </div>
  </main>
</template>
