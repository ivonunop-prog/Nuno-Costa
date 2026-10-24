import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  // =========================================================
  // 1. DGEG FUEL STATIONS PROXY (FOR APP 1: ABASTECIMENTOS)
  // =========================================================
  app.get('/api/dgeg/postos', async (req, res) => {
    try {
      const {
        idsTiposComb = '3201',
        idMarca = '',
        idDistrito = '13',
        qtdPorPagina = '200',
        pagina = '1',
      } = req.query;

      const dgegUrl = `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos?idsTiposComb=${encodeURIComponent(
        String(idsTiposComb)
      )}&idMarca=${encodeURIComponent(String(idMarca))}&idTipoPosto=&idDistrito=${encodeURIComponent(
        String(idDistrito)
      )}&idsMunicipios=&qtdPorPagina=${encodeURIComponent(
        String(qtdPorPagina)
      )}&pagina=${encodeURIComponent(String(pagina))}`;

      const response = await fetch(dgegUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Abastecimentos/1.0)',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ status: false, resultado: [] });
      }

      const data = await response.json();
      return res.json(data);
    } catch (error) {
      console.error('DGEG proxy error:', error);
      return res.status(502).json({ status: false, resultado: [] });
    }
  });

  // =========================================================
  // 1B. WEATHER & REVERSE GEOCODING PROXY (FOR WEATHER WIDGET)
  // =========================================================
  app.get('/api/weather', async (req, res) => {
    const lat = parseFloat(String(req.query.lat || '41.1547'));
    const lon = parseFloat(String(req.query.lon || '-8.5319'));
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Central2em1/1.0' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return res.json(data);
    } catch (error) {
      console.error('Weather proxy fallback:', error);
      const today = new Date();
      const days = [0, 1, 2, 3, 4].map((d) => {
        const dt = new Date(today.getTime() + d * 86400000);
        return dt.toISOString().split('T')[0];
      });
      return res.json({
        current: {
          temperature_2m: 19.4,
          apparent_temperature: 18.8,
          weather_code: 1,
          wind_speed_10m: 12,
          relative_humidity_2m: 64,
          is_day: 1,
        },
        daily: {
          time: days,
          weather_code: [1, 2, 1, 0, 2],
          temperature_2m_max: [21, 20, 22, 23, 20],
          temperature_2m_min: [12, 13, 12, 13, 12],
          precipitation_probability_max: [10, 20, 10, 5, 15],
        },
      });
    }
  });

  app.get('/api/geocode', async (req, res) => {
    const lat = parseFloat(String(req.query.lat || '41.1547'));
    const lon = parseFloat(String(req.query.lon || '-8.5319'));
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=pt`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'CentralGestaoAbastecimentos/1.0 (Portugal)',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return res.json(data);
    } catch {
      return res.json({ address: { city: 'Gondomar', state: 'Porto' } });
    }
  });

  // =========================================================
  // 2. GEMINI RECEIPT OCR API (FOR APP 2: GESTOR DE COMPRAS)
  // =========================================================
  app.post('/api/gemini/receipt', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'Chave GEMINI_API_KEY não configurada no servidor.',
        });
      }

      const { base64Data, mimeType, textContent, preferredModel } = req.body || {};
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

      const parts = [{ text: prompt }];

      if (textContent) {
        parts.push({ text: `Conteúdo textual do talão:\n${textContent}` });
      }

      if (base64Data && mimeType) {
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        } as never);
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
      return res.json({ data: parsed });
    } catch (error) {
      console.error('Gemini receipt analysis error:', error);
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível analisar o talão com IA.',
      });
    }
  });

  // =========================================================
  // 3. VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD WEB)
  // =========================================================
  const distPath = path.join(__dirname, 'dist');
  const publicPath = path.join(__dirname, 'public');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.K_SERVICE !== undefined && fs.existsSync(path.join(distPath, 'index.html')));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(publicPath));
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
