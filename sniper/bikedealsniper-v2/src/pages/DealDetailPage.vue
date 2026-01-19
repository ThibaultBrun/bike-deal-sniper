<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, RouterLink } from "vue-router";
import DealCard from "@/components/DealCard.vue";
import { getDealsSameCoupon } from "@/lib/dealsApi";

/**
 * A RENSEIGNER EXACTEMENT comme dans ton ancienne version.
 * (sinon le deal complet ne remontera pas)
 */
const TABLE_NAME = "deals"; // <-- mets le nom exact
const TOKEN_HEADER_NAME = "x-deal-token"; // <-- mets le header exact

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type DealRowFull = {
  token: string;
  title: string;
  price_current: number;
  price_original: number | null;
  prct_discount: number;
  coupon_code: string | null;
  url: string | null;
  category: string | null;
  desc_ai_fr: string | null;
  desc_rcz: string | null;
  image: string | null;
};

type DealRowSibling = Record<string, any>;

type DealUi = {
  token: string; // identifiant page
  title: string;
  price: number;
  oldPrice?: number;
  discountPercent: number;
  coupon_code: string | null; // code promo
  rczUrl: string | null;
  category: string | null;
  desc_ai_fr: string | null;
  desc_rcz: string | null;
  imageUrl: string | null;
};

const route = useRoute();
const token = computed(() => String(route.params.token || ""));

const loadingDeal = ref(true);
const loadingRelated = ref(true);
const errorMsg = ref<string>("");

const dealRow = ref<DealRowFull | null>(null);
const siblingsRows = ref<DealRowSibling[]>([]);

async function fetchDealFullByTokenHeader(pToken: string) {
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
  return json[0] as DealRowFull;
}

function normalizeDeal(r: DealRowFull): DealUi {
  return {
    token: String(r.token),
    title: String(r.title),
    price: Number(r.price_current),
    oldPrice: r.price_original != null ? Number(r.price_original) : undefined,
    discountPercent: Number(r.prct_discount),
    coupon_code: r.coupon_code ?? null,
    rczUrl: r.url ?? null,
    category: r.category ?? null,
    desc_ai_fr: r.desc_ai_fr ?? null,
    desc_rcz: r.desc_rcz ?? null,
    imageUrl: r.image ?? null,
  };
}

function normalizeSibling(r: any): DealUi {
  // Payload "léger" — on garde la même forme UI.
  // Ici on suppose que tes RPC retournent ces colonnes. Si une manque, tu me donnes son nom exact.
  return {
    token: String(r.token),
    title: String(r.title),
    price: Number(r.price_current),
    oldPrice: r.price_original != null ? Number(r.price_original) : undefined,
    discountPercent: Number(r.prct_discount),
    coupon_code: r.coupon_code ?? null,
    rczUrl: r.url ?? null,
    category: r.category ?? null,
    desc_ai_fr: null,
    desc_rcz: null,
    imageUrl: r.image ?? null,
  };
}

const deal = computed<DealUi | null>(() =>
  dealRow.value ? normalizeDeal(dealRow.value) : null,
);

const related = computed<DealUi[]>(() => {
  if (!deal.value?.coupon_code) return [];
  const c = deal.value.coupon_code;

  return siblingsRows.value
    .map(normalizeSibling)
    .filter((d) => d.token !== deal.value!.token && d.coupon_code === c)
    .slice(0, 8);
});

async function loadAll(pToken: string) {
  if (!pToken) return;

  errorMsg.value = "";

  loadingDeal.value = true;
  loadingRelated.value = true;

  dealRow.value = null;
  siblingsRows.value = [];

  try {
    // A) Deal complet (avec desc_ai_fr)
    dealRow.value = await fetchDealFullByTokenHeader(pToken);
    if (!dealRow.value) {
      errorMsg.value = "Deal introuvable.";
      return;
    }

    // B) Related (même coupon_code)
    try {
      siblingsRows.value = await getDealsSameCoupon(pToken);
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

// Si tu navigues entre deals sans recharger la page
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
          <div class="relative aspect-[4/5] bg-slate-100">
            <div
              class="absolute left-3 top-3 rounded-xl bg-orange-500 px-2 py-1 text-xs font-bold text-black"
            >
              -{{ deal.discountPercent }}%
            </div>

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
              :href="deal.rczUrl || '#'"
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
            <div class="text-sm font-semibold text-slate-900">Description IA :</div>

            <div
              v-if="deal.desc_ai_fr && deal.desc_ai_fr.trim().length"
              class="mt-3 text-sm text-slate-700 whitespace-pre-line"
            >
              {{ deal.desc_ai_fr }}
            </div>
                        <div class="mt-3 text-sm font-semibold text-slate-900">RCZ : </div>

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
