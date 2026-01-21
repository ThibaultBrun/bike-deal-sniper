<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import HeroBanner from "@/components/HeroBanner.vue";
import FiltersSidebar from "@/components/FiltersSidebar.vue";
import DealCard from "@/components/DealCard.vue";

import { getAllDealsPublic } from "@/lib/dealsApi";
import type { DealRow } from "@/lib/types/DealRow";
import { mapDealRowToUi, type DealUi } from "@/lib/mappers/dealMapper";

// -------------------- data loading --------------------
const loading = ref(true);
const errorMsg = ref<string>("");

const rows = ref<DealRow[]>([]);
type SortKey = "price_asc" | "price_desc" | "discount_asc" | "discount_desc";
const sortKey = ref<SortKey>("discount_desc");

onMounted(async () => {
  loading.value = true;
  errorMsg.value = "";
  try {
    rows.value = (await getAllDealsPublic()) as DealRow[];
  } catch (e: any) {
    console.error(e);
    errorMsg.value = e?.message || "Erreur chargement deals.";
  } finally {
    loading.value = false;
  }
});

// -------------------- mapper central --------------------
const deals = computed<DealUi[]>(() => rows.value.map(mapDealRowToUi));

// -------------------- filters (instant) --------------------
const inStockOnly = ref(false);
const hideSold = ref(false); // <-- change à true si tu veux masquer les vendus par défaut
const search = ref("");

/**
 * On filtre d'abord par (vendus / stock / search)
 * Ensuite on calcule les options item_type sur cette base (compteurs cohérents)
 * Puis on applique le filtre item_type sélectionné.
 */
const baseFilteredDeals = computed<DealUi[]>(() => {
  const q = search.value.trim().toLowerCase();

  return deals.value.filter((d) => {
    if (hideSold.value && d.available === false) return false;
    if (inStockOnly.value && d.stock_delay !== 0) return false;

    if (q) {
      const hay =
        `${d.title ?? ""} ${d.item_type ?? ""} ${d.category ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

const sortedDeals = computed<DealUi[]>(() => {
  const arr = [...filteredDeals.value];

  switch (sortKey.value) {
    case "price_asc":
      arr.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      break;

    case "price_desc":
      arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      break;

    case "discount_asc":
      arr.sort(
        (a, b) =>
          (a.discountPercent ?? -Infinity) - (b.discountPercent ?? -Infinity),
      );
      break;

    case "discount_desc":
      arr.sort(
        (a, b) =>
          (b.discountPercent ?? -Infinity) - (a.discountPercent ?? -Infinity),
      );
      break;

    default:
      // pas de tri: on garde l'ordre reçu (souvent déjà pertinent / récent côté RPC)
      break;
  }

  return arr;
});

// ---- item_type dynamique ----
type Option = { key: string; label: string; count: number };

const selectedItemTypes = ref<string[]>([]);

// 1) Liste stable de tous les item_type (ordre stable)
const allItemTypes = computed<string[]>(() => {
  const set = new Set<string>();
  for (const d of deals.value) {
    const key = (d.item_type ?? "").trim();
    if (key) set.add(key);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

// 2) Compteurs calculés sur la base filtrée (masquer vendus / stock / search etc.)
const itemTypeCounts = computed(() => {
  const map = new Map<string, number>();
  for (const d of baseFilteredDeals.value) {
    const key = (d.item_type ?? "").trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
});

// 3) Options finales: toutes les clés, count = 0 si absent
const itemTypeOptions = computed<Option[]>(() => {
  const counts = itemTypeCounts.value;
  return allItemTypes.value.map((key) => ({
    key,
    label: key,
    count: counts.get(key) ?? 0,
  }));
});

const filteredDeals = computed<DealUi[]>(() => {
  if (selectedItemTypes.value.length === 0) return baseFilteredDeals.value;

  const set = new Set(selectedItemTypes.value.map((s) => s.trim()));
  return baseFilteredDeals.value.filter((d) =>
    set.has((d.item_type ?? "").trim()),
  );
});

function resetFilters() {
  inStockOnly.value = false;
  hideSold.value = false; // ou true si tu préfères
  search.value = "";
  selectedItemTypes.value = [];
}
</script>

<template>
  <HeroBanner :shown="sortedDeals.length" :total="deals.length" />

  <main class="bg-slate-50">
    <div
      class="mx-auto grid max-w-screen-2xl grid-cols-1 gap-6 px-1 py-8 md:grid-cols-[220px_1fr]"
    >
      <!-- Sidebar filtres -->
      <FiltersSidebar
        v-model:inStockOnly="inStockOnly"
        v-model:hideSold="hideSold"
        v-model:search="search"
        v-model:selectedCategories="selectedItemTypes"
        :categories="itemTypeOptions"
        @reset="resetFilters"
      />

      <!-- Liste -->
      <section>
        <div class="mb-4 flex items-center justify-between gap-3">
          <div class="text-sm text-slate-600">
            <span class="font-semibold text-slate-900">
              {{ loading ? "…" : filteredDeals.length }}
            </span>
            bons plans
          </div>

          <div class="mb-4 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <select
                v-model="sortKey"
                class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="discount_desc">Top remises</option>
                <option value="price_asc">Prix mini</option>
                <option value="price_desc">Prix maxi</option>
              </select>
            </div>
          </div>
        </div>

        <div
          v-if="errorMsg"
          class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {{ errorMsg }}
        </div>

        <div
          v-else-if="loading"
          class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div
            v-for="i in 9"
            :key="i"
            class="h-72 rounded-2xl bg-white shadow-sm"
          ></div>
        </div>

        <div
          v-else-if="filteredDeals.length === 0"
          class="rounded-2xl border border-black/5 bg-white p-6 text-sm text-slate-700"
        >
          Aucun deal ne correspond aux filtres.
        </div>

        <div
          v-else
          class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        >
          <RouterLink
            v-for="d in sortedDeals"
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
