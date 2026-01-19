<template>
  <header class="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 rounded-xl bg-white/10"></div>
        <div class="leading-tight">
          <div class="text-sm font-semibold text-white">BikeDealSniper</div>
          <div class="text-xs text-white/60">Bons plans RCZ</div>
        </div>
      </div>

      <nav class="hidden items-center gap-6 text-sm text-white/80 md:flex">
        <a class="hover:text-white" href="#">Utilisation</a>
        <a class="hover:text-white" href="#">Freins</a>
        <a class="hover:text-white" href="#">Suspensions</a>
        <a class="hover:text-white" href="#">Roues</a>
        <a class="hover:text-white" href="#">Transmission</a>
        <a class="hover:text-white" href="#">À propos</a>
      </nav>

      <div class="flex items-center gap-3">
        <button class="hidden rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15 md:inline-flex">
          Rechercher
        </button>
        <a
          class="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400"
          href="#"
        >
          Rejoindre Telegram
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  </header>
</template>
