<script setup lang="ts">
import { computed } from "vue";

type CategoryOption = {
  key: string;
  label: string;
  count: number;
};

const props = defineProps<{
  inStockOnly: boolean;
  hideSold: boolean;
  search: string;
  categories: CategoryOption[];
  selectedCategories: string[];
}>();

const emit = defineEmits<{
  (e: "update:inStockOnly", v: boolean): void;
  (e: "update:hideSold", v: boolean): void;
  (e: "update:search", v: string): void;
  (e: "update:selectedCategories", v: string[]): void;
  (e: "reset"): void;
}>();

const inStockOnlyModel = computed({
  get: () => props.inStockOnly,
  set: (v: boolean) => emit("update:inStockOnly", v),
});
const hideSoldModel = computed({
  get: () => props.hideSold,
  set: (v: boolean) => emit("update:hideSold", v),
});
const searchModel = computed({
  get: () => props.search,
  set: (v: string) => emit("update:search", v),
});

function toggleCategory(key: string) {
  const set = new Set(props.selectedCategories);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  emit("update:selectedCategories", Array.from(set));
}
</script>

<template>
  <aside class="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
    <div class="text-sm font-semibold text-slate-900">Filtres</div>

    <!-- Catégories dynamiques -->
    <div class="mt-4 space-y-2">
      <div class="text-xs font-semibold text-slate-500">Catégories</div>

      <button
        v-for="c in categories"
        :key="c.key"
        type="button"
        @click="toggleCategory(c.key)"
        class="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left hover:bg-slate-50"
      >
        <span class="flex items-center gap-2">
          <input
            type="checkbox"
            class="h-4 w-4 pointer-events-none"
            :checked="selectedCategories.includes(c.key)"
          />
          <span class="text-sm text-slate-800">{{ c.label }}</span>
        </span>

        <span class="text-xs text-slate-500">{{ c.count }}</span>
      </button>

      <div v-if="categories.length === 0" class="text-sm text-slate-400">
        Aucune catégorie.
      </div>
    </div>

    <!-- autres filtres -->
    <div class="mt-4 space-y-3">
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="inStockOnlyModel" type="checkbox" class="h-4 w-4" />
        En stock
      </label>

      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="hideSoldModel" type="checkbox" class="h-4 w-4" />
        Masquer vendus
      </label>
    </div>

    <div class="mt-4">
      <div class="text-xs font-semibold text-slate-500">Rechercher</div>
      <input
        v-model="searchModel"
        class="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500"
        placeholder="Shimano, Marzocchi..."
      />
    </div>

    <div class="mt-4">
      <button
        @click="emit('reset')"
        class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Reset
      </button>
    </div>
  </aside>
</template>
