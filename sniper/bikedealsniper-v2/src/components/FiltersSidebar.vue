<template>
  <aside class="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
    <div class="text-sm font-semibold text-slate-900">Filtres</div>

    <div class="mt-4 space-y-2">
      <div class="text-xs font-semibold text-slate-500">Catégories</div>
      <label class="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-slate-50">
        <span class="text-sm text-slate-800">Fourches</span>
        <span class="text-xs text-slate-500">4</span>
      </label>
      <label class="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-slate-50">
        <span class="text-sm text-slate-800">Freins</span>
        <span class="text-xs text-slate-500">3</span>
      </label>
      <label class="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-slate-50">
        <span class="text-sm text-slate-800">Roues</span>
        <span class="text-xs text-slate-500">5</span>
      </label>
      <label class="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-slate-50">
        <span class="text-sm text-slate-800">Transmission</span>
        <span class="text-xs text-slate-500">19</span>
      </label>
    </div>

    <div class="mt-4 space-y-3">
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" class="h-4 w-4" />
        Prêt à expédier
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" class="h-4 w-4" />
        Masquer vendus
      </label>
    </div>

    <div class="mt-4">
      <div class="text-xs font-semibold text-slate-500">Rechercher</div>
      <input
        class="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500"
        placeholder="Shimano, Marzocchi..."
      />
    </div>

    <div class="mt-4 flex gap-2">
      <button class="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Reset
      </button>
      <button class="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
        Appliquer
      </button>
    </div>
  </aside>
</template>
