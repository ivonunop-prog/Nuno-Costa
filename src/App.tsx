/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import {
  Fuel,
  ShoppingCart,
  Columns,
  RefreshCw,
  Maximize2,
  Minimize2,
} from 'lucide-react';

type ActiveTab = 'abastecimentos' | 'compras' | 'split';

interface ReceiptPayload {
  base64Data?: string;
  mimeType?: string;
  textContent?: string;
  preferredModel?: string;
}

interface SubAppWindow extends Window {
  __handleSubAppBack?: () => boolean;
}

declare global {
  interface Window {
    __analyzeReceiptWithGemini?: (payload: ReceiptPayload) => Promise<{ data: Record<string, unknown> }>;
  }
}

export default function App() {
  const [activeTab, setActiveTabRaw] = useState<ActiveTab>(() => {
    try {
      const saved = sessionStorage.getItem('central_active_tab');
      if (saved === 'abastecimentos' || saved === 'compras' || saved === 'split') {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    return 'abastecimentos';
  });
  const [fuelKey, setFuelKey] = useState(0);
  const [comprasKey, setComprasKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fuelIframeRef = useRef<HTMLIFrameElement | null>(null);
  const comprasIframeRef = useRef<HTMLIFrameElement | null>(null);
  const tabStackRef = useRef<ActiveTab[]>([]);
  const activeTabRef = useRef<ActiveTab>(activeTab);
  activeTabRef.current = activeTab;

  const setActiveTab = (nextTab: ActiveTab) => {
    const current = activeTabRef.current;
    if (nextTab !== current) {
      tabStackRef.current.push(current);
      if (tabStackRef.current.length > 20) {
        tabStackRef.current.shift();
      }
      try {
        window.history.pushState({ centralGuard: true, tab: nextTab }, '');
      } catch {
        // Ignore history errors
      }
    }
    try {
      sessionStorage.setItem('central_active_tab', nextTab);
    } catch {
      // Ignore storage errors
    }
    setActiveTabRaw(nextTab);
  };

  useEffect(() => {
    try {
      window.history.replaceState({ centralGuard: true }, '');
      window.history.pushState({ centralGuard: true }, '');
    } catch {
      // Ignore history errors
    }

    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SUBAPP_HISTORY_PUSH') {
        try {
          window.history.pushState({ centralGuard: true, subApp: event.data.app }, '');
        } catch {
          // Ignore history errors
        }
      }
    };

    const onPopState = () => {
      // Always re-arm the guard state so Android Back never exits the app unexpectedly
      try {
        window.history.pushState({ centralGuard: true }, '');
      } catch {
        // Ignore history errors
      }

      const currentTab = activeTabRef.current;
      const targetIframe =
        currentTab === 'abastecimentos'
          ? fuelIframeRef.current
          : currentTab === 'compras'
          ? comprasIframeRef.current
          : fuelIframeRef.current;

      try {
        const subWin = targetIframe?.contentWindow as SubAppWindow | null | undefined;
        if (subWin && typeof subWin.__handleSubAppBack === 'function') {
          const handledBySubApp = subWin.__handleSubAppBack();
          if (handledBySubApp) {
            return;
          }
        }
      } catch {
        // Ignore cross-frame access issues if any
      }

      if (tabStackRef.current.length > 0) {
        const prevTab = tabStackRef.current.pop()!;
        try {
          sessionStorage.setItem('central_active_tab', prevTab);
        } catch {
          // Ignore storage errors
        }
        setActiveTabRaw(prevTab);
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if browser blocks fullscreen
    }
  };

  useEffect(() => {
    window.__analyzeReceiptWithGemini = async ({
      base64Data,
      mimeType,
      textContent,
      preferredModel,
    }: ReceiptPayload) => {
      const apiKey = process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        throw new Error('Chave GEMINI_API_KEY não configurada.');
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Analisa este talão/fatura de compra em Portugal e extrai os dados em JSON com os seguintes campos:
- date: data no formato YYYY-MM-DD
- store: nome da loja ou supermercado (ex: Continente, Pingo Doce, Lidl, Mercadona, Auchan, Galp, etc.)
- total: valor total pago (número)
- saldoUsado: saldo de cartão descontado/usado (número, 0 se não existir)
- saldoGanho: saldo acumulado/ganho em cartão nesta compra (número, 0 se não existir)
- saldoDisp: saldo disponível em cartão após a compra (número, 0 se não existir)
- card: nome/número do cartão fidelização se aplicável
- nif: NIF do cliente se constar
- obs: notas breves ou descontos relevantes
- grupo: um de ["super", "farmacia", "combustivel", "restaurantes", "roupa", "casa", "outros"]
- items: lista de artigos comprados [{ name, qty, price, cat }] onde cat é um de ["mercearia", "frescos", "lacticinios", "talho", "peixaria", "padaria", "congelados", "bebidas", "higiene", "limpeza", "animais", "outros"]`;

      const parts: Array<Record<string, unknown>> = [{ text: prompt }];
      if (textContent) {
        parts.push({ text: `Conteúdo textual do talão:\n${textContent}` });
      }
      if (base64Data && mimeType) {
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType,
          },
        });
      }

      const modelName =
        preferredModel === 'gemini-3.1-pro-preview'
          ? 'gemini-3.1-pro-preview'
          : 'gemini-3-flash-preview';

      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts: parts as never },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              store: { type: Type.STRING },
              total: { type: Type.NUMBER },
              saldoUsado: { type: Type.NUMBER },
              saldoGanho: { type: Type.NUMBER },
              saldoDisp: { type: Type.NUMBER },
              card: { type: Type.STRING },
              nif: { type: Type.STRING },
              obs: { type: Type.STRING },
              grupo: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    qty: { type: Type.NUMBER },
                    price: { type: Type.NUMBER },
                    cat: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return { data: parsed };
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* RESPONSIVE TOP BAR */}
      <header className="shrink-0 h-11 px-2 sm:px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-1.5 sm:gap-4 z-40 shadow-xs">
        {/* Zone 1: Brand Title (visible on tablet/desktop) */}
        <button
          onClick={() => setActiveTab('abastecimentos')}
          className="hidden md:inline-flex items-center text-xs sm:text-sm font-bold tracking-tight text-white whitespace-nowrap shrink-0 transition-transform active:scale-95"
        >
          Central 2-em-1
        </button>

        {/* Zone 2: Responsive Navigation Switcher (full width on mobile, centered on desktop) */}
        <nav className="flex-1 md:flex-initial flex items-center gap-1 sm:gap-2 min-w-0">
          <button
            onClick={() => setActiveTab('abastecimentos')}
            className={`flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-150 active:scale-95 truncate ${
              activeTab === 'abastecimentos'
                ? 'bg-[#E30613] text-white shadow-xs'
                : 'bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Fuel className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Abastecimentos</span>
          </button>

          <button
            onClick={() => setActiveTab('compras')}
            className={`flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-150 active:scale-95 truncate ${
              activeTab === 'compras'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate sm:hidden">Supermercado</span>
            <span className="truncate hidden sm:inline">Compras Supermercado</span>
          </button>

          <button
            onClick={() => setActiveTab('split')}
            className={`hidden lg:inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 active:scale-95 whitespace-nowrap shrink-0 ${
              activeTab === 'split'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Columns className="w-3.5 h-3.5 shrink-0" />
            <span>Lado a Lado</span>
          </button>
        </nav>

        {/* Zone 3: Fullscreen & Reload Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Sair de ecrã inteiro' : 'Ecrã inteiro'}
            className="inline-flex items-center justify-center gap-1.5 w-8 h-8 sm:w-auto sm:h-auto sm:px-2.5 sm:py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-700 active:scale-95 transition-all shrink-0"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
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
            className="inline-flex items-center justify-center gap-1.5 w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-700 active:scale-95 transition-all shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Recarregar</span>
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT (exact remaining height so bottom nav inside iframes is always visible) */}
      <main
        className={`flex-1 min-h-0 w-full relative bg-slate-50 overflow-hidden ${
          activeTab === 'split' ? 'flex flex-col lg:flex-row' : ''
        }`}
      >
        {/* APP 1: ABASTECIMENTOS */}
        <div
          className={
            activeTab === 'abastecimentos'
              ? 'absolute inset-0 w-full h-full block'
              : activeTab === 'split'
              ? 'w-full lg:w-1/2 h-1/2 lg:h-full flex-1 min-h-0 border-b lg:border-b-0 lg:border-r border-slate-300 block'
              : 'hidden'
          }
        >
          <iframe
            ref={fuelIframeRef}
            key={fuelKey}
            src="/app-abastecimentos/index.html?v=14"
            title="Abastecimentos"
            className="w-full h-full border-0 bg-white block"
            allow="geolocation; camera; microphone; clipboard-write"
          />
        </div>

        {/* APP 2: COMPRAS SUPERMERCADO */}
        <div
          className={
            activeTab === 'compras'
              ? 'absolute inset-0 w-full h-full block'
              : activeTab === 'split'
              ? 'w-full lg:w-1/2 h-1/2 lg:h-full flex-1 min-h-0 block'
              : 'hidden'
          }
        >
          <iframe
            ref={comprasIframeRef}
            key={comprasKey}
            src="/app-compras/index.html?v=15"
            title="Compras Supermercado"
            className="w-full h-full border-0 bg-[#F8F9FF] block"
            allow="geolocation; camera; microphone; clipboard-write"
          />
        </div>
      </main>
    </div>
  );
}
