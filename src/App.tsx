/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Fuel,
  ShoppingCart,
  Columns,
  RefreshCw,
} from 'lucide-react';

type ActiveTab = 'abastecimentos' | 'compras' | 'split';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('compras');
  const [fuelKey, setFuelKey] = useState(0);
  const [comprasKey, setComprasKey] = useState(0);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-slate-950 overflow-hidden select-none pt-12">
      {/* FIXED TOP BAR */}
      <header className="fixed top-0 left-0 right-0 h-12 px-3 sm:px-5 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 flex items-center justify-between gap-3 sm:gap-6 z-40 shadow-sm">
        {/* Zone 1: Brand Title */}
        <button
          onClick={() => setActiveTab('compras')}
          className="text-xs sm:text-sm font-bold tracking-tight text-white whitespace-nowrap shrink-0 transition-transform active:scale-95"
        >
          Central 2-em-1
        </button>

        {/* Zone 2: Navigation Switcher */}
        <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('abastecimentos')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95 whitespace-nowrap shrink-0 ${
              activeTab === 'abastecimentos'
                ? 'bg-[#E30613] text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Fuel className="w-3.5 h-3.5" />
            <span>Abastecimentos</span>
          </button>

          <button
            onClick={() => setActiveTab('compras')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95 whitespace-nowrap shrink-0 ${
              activeTab === 'compras'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Compras Supermercado</span>
          </button>

          <button
            onClick={() => setActiveTab('split')}
            className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95 whitespace-nowrap shrink-0 ${
              activeTab === 'split'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Lado a Lado</span>
          </button>
        </nav>

        {/* Zone 3: Reload Action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => {
              if (activeTab === 'abastecimentos') setFuelKey((k) => k + 1);
              if (activeTab === 'compras') setComprasKey((k) => k + 1);
              if (activeTab === 'split') {
                setFuelKey((k) => k + 1);
                setComprasKey((k) => k + 1);
              }
            }}
            title="Recarregar aplicação"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-700 active:scale-95 transition-all whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Recarregar</span>
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 relative w-full h-full bg-slate-50 overflow-hidden">
        {/* APP 1 ORIGINAL: ABASTECIMENTOS */}
        <div
          className={`transition-opacity duration-200 ${
            activeTab === 'abastecimentos'
              ? 'w-full h-full block opacity-100'
              : activeTab === 'split'
              ? 'w-full lg:w-1/2 h-1/2 lg:h-full inline-block align-top border-b lg:border-b-0 lg:border-r border-slate-300 opacity-100'
              : 'hidden opacity-0'
          }`}
        >
          <iframe
            key={fuelKey}
            src="/app-abastecimentos/index.html?v=10"
            title="Abastecimentos Original"
            className="w-full h-full border-0 bg-white"
            allow="geolocation; camera; microphone; clipboard-write"
          />
        </div>

        {/* APP 2 ORIGINAL: COMPRAS SUPERMERCADO */}
        <div
          className={`transition-opacity duration-200 ${
            activeTab === 'compras'
              ? 'w-full h-full block opacity-100'
              : activeTab === 'split'
              ? 'w-full lg:w-1/2 h-1/2 lg:h-full inline-block align-top opacity-100'
              : 'hidden opacity-0'
          }`}
        >
          <iframe
            key={comprasKey}
            src="/app-compras/index.html?v=10"
            title="Compras Supermercado Original"
            className="w-full h-full border-0 bg-[#F8F9FF]"
            allow="geolocation; camera; microphone; clipboard-write"
          />
        </div>
      </main>
    </div>
  );
}
