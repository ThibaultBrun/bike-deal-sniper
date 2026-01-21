<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, RouterLink } from "vue-router";
import DealCard from "@/components/DealCard.vue";
import { getDealsSameCoupon } from "@/lib/dealsApi";

import type { DealRow } from "@/lib/types/DealRow";
import { mapDealRowToUi, type DealUi } from "@/lib/mappers/dealMapper";

const TABLE_NAME = "deals";
const TOKEN_HEADER_NAME = "x-deal-token";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const route = useRoute();
const token = computed(() => String(route.params.token || ""));

const loadingDeal = ref(true);
const loadingRelated = ref(true);
const errorMsg = ref<string>("");

const dealRow = ref<DealRow | null>(null);
const siblingsRows = ref<DealRow[]>([]);

const deal = computed<DealUi | null>(() =>
  dealRow.value ? mapDealRowToUi(dealRow.value) : null,
);

const related = computed<DealUi[]>(() => {
  const current = deal.value;
  if (!current?.coupon_code) return [];
  const c = current.coupon_code;

  return siblingsRows.value
    .map(mapDealRowToUi)
    .filter((d) => d.token !== current.token && d.coupon_code === c)
    .slice(0, 8);
});

async function fetchDealFullByTokenHeader(
  pToken: string,
): Promise<DealRow | null> {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*`;

  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      [TOKEN_HEADER_NAME]: pToken,
    },
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`REST getDeal failed: ${r.status} ${r.statusText} ${txt}`);
  }

  const json = await r.json();
  if (!Array.isArray(json) || json.length < 1) return null;
  return json[0] as DealRow;
}

async function loadAll(pToken: string) {
  if (!pToken) return;

  errorMsg.value = "";
  loadingDeal.value = true;
  loadingRelated.value = true;

  dealRow.value = null;
  siblingsRows.value = [];

  try {
    // A) Deal complet
    dealRow.value = await fetchDealFullByTokenHeader(pToken);
    if (!dealRow.value) {
      errorMsg.value = "Deal introuvable.";
      return;
    }

    // B) Related (même coupon_code)
    try {
      // ⚠️ getDealsSameCoupon doit renvoyer des lignes compatibles (token, title, price_current, etc.)
      siblingsRows.value = (await getDealsSameCoupon(pToken)) as DealRow[];
    } catch (e) {
      console.log("same coupon RPC error:", e);
      siblingsRows.value = [];
    }
  } catch (e: any) {
    console.error(e);
    errorMsg.value = e?.message || "Erreur chargement deal.";
  } finally {
    loadingDeal.value = false;
    loadingRelated.value = false;
  }
}

onMounted(() => {
  loadAll(token.value);
});

watch(token, (t) => loadAll(t));
</script>

<template>
  <main class="bg-slate-50">
    <div class="mx-auto max-w-7xl px-4 py-8">
      <div class="text-sm text-slate-500">
        <RouterLink class="hover:text-slate-700" to="/">Accueil</RouterLink>
        <span class="mx-2">›</span>
        <span class="text-slate-700">Produit</span>
      </div>

      <div
        v-if="errorMsg"
        class="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        {{ errorMsg }}
      </div>

      <div
        v-else-if="loadingDeal"
        class="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]"
      >
        <div class="h-[520px] rounded-2xl bg-white shadow-sm"></div>
        <div class="h-[520px] rounded-2xl bg-white shadow-sm"></div>
      </div>

      <div
        v-else-if="!deal"
        class="mt-4 rounded-2xl border border-black/5 bg-white p-6 text-sm text-slate-700"
      >
        Deal introuvable.
      </div>

      <div v-else class="mt-4 grid gap-6 lg:grid-cols-[420px_1fr]">
        <!-- media -->
        <div
          class="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm"
        >
          <div class="relative aspect-[4/5]">
            <!-- Gauche: Discount -->
            <div class="absolute left-3 top-3 z-10">
              <span
                v-if="deal.discountPercent != null"
                class="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-xs font-extrabold text-white"
              >
                -{{ Math.round(deal.discountPercent) }}%
              </span>
            </div>

            <!-- Droite: Stock + Vendu -->
            <div
              class="absolute right-3 top-3 z-10 flex flex-col items-end gap-2"
            >
              <!-- Stock -->
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

            <!-- image -->
            <img
              v-if="deal.imageUrl"
              :src="deal.imageUrl"
              :alt="deal.title"
              class="h-full w-full object-contain p-6"
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

        <!-- info -->
        <div class="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h1 class="text-2xl font-bold text-slate-900">{{ deal.title }}</h1>

          <div class="mt-4 flex items-baseline gap-3">
            <div class="text-3xl font-extrabold text-slate-900">
              {{ deal.price.toFixed(2) }}€
            </div>
            <div v-if="deal.oldPrice" class="text-slate-400 line-through">
              {{ deal.oldPrice.toFixed(2) }}€
            </div>
          </div>

          <!-- Coupon -->
          <div
            v-if="deal.coupon_code"
            class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div class="text-sm font-semibold text-slate-700">Code promo</div>
            <div class="mt-2 flex items-center justify-between gap-3">
              <div
                class="rounded-xl bg-white px-3 py-2 font-mono text-sm text-slate-900"
              >
                {{ deal.coupon_code }}
              </div>
              <button
                class="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Copier
              </button>
            </div>
            <div class="mt-2 text-xs text-slate-500">
              À appliquer au paiement après “Commander”.
            </div>
          </div>

          <!-- CTA -->
          <div class="mt-5">
            <a
              class="inline-flex w-full items-center justify-center rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400"
              :href="deal.url || '#'"
              target="_blank"
              rel="noreferrer"
            >
              Voir l’offre sur RCZ →
            </a>
            <div class="mt-2 text-xs text-slate-500">
              Ouverture dans un nouvel onglet
            </div>
          </div>

          <!-- AI -->
          <div class="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <div class="text-sm font-semibold text-slate-900">
              Description IA :
            </div>

            <div
              v-if="deal.desc_ai_fr && deal.desc_ai_fr.trim().length"
              class="mt-3 text-sm text-slate-700 whitespace-pre-line"
            >
              {{ deal.desc_ai_fr }}
            </div>
            <div class="mt-3 text-sm font-semibold text-slate-900">RCZ :</div>

            <div
              v-if="deal.desc_rcz && deal.desc_rcz.trim().length"
              class="mt-3 text-sm text-slate-700 whitespace-pre-line"
            >
              {{ deal.desc_rcz }}
            </div>

            <div v-else class="mt-3 text-sm text-slate-500">
              Génération en cours…
            </div>
          </div>
        </div>
      </div>

      <!-- related -->
      <div v-if="!loadingRelated && deal && related.length" class="mt-10">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900">
              Autres produits avec le code {{ deal.coupon_code }}
            </h2>
            <p class="mt-1 text-sm text-slate-600">
              Même promo, catégories différentes.
            </p>
          </div>
          <RouterLink
            to="/"
            class="text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            Retour aux deals →
          </RouterLink>
        </div>

        <div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <RouterLink
            v-for="r in related"
            :key="r.token"
            :to="`/deal/${encodeURIComponent(r.token)}`"
            class="block"
          >
            <DealCard :deal="r" />
          </RouterLink>
        </div>
      </div>
    </div>
  </main>
</template>
