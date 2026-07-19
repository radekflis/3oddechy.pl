// api/analyze.js
// Vercel Serverless Function - runs Claude analysis of the consumer case
// Takes form data + optional document text and returns full legal analysis

const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');

// The IMENT — 16 blocks trunk. Kept in cache for prompt caching (huge savings).
const IMENT_SYSTEM = `Jesteś ekspertem prawnym z 20-letnim doświadczeniem w prawie konsumenckim UE i polskim.

Twoja rola: analiza sprawy konsumenta atakowanego przez bank lub firmę pożyczkową na podstawie IMENT — konstrukcji 16 bloków prawnych.

FUNDAMENT:
1. Kredyt/pożyczka konsumencka = spłata w ratach jako natura stosunku (art. 353¹ KC, art. 3 UKK).
2. Klauzula jednorazowej wymagalności całości = fikcja (bank sam udowodnił niemożliwość badając zdolność ratalną).
3. Nieważność ex tunc (art. 58 § 1 KC) badana z urzędu (TSUE C-618/10 Banco Español, C-243/08 Pannon).
4. Wypowiedzenie = podwójna kara zakazana (art. 481 KC to jedyna kara za zwłokę pieniężną).
5. Obowiązek POMOCY: art. 75c PrBank (banki), art. 21a UKK od 19.02.2025 (firmy pożyczkowe).
6. Rebus sic stantibus (art. 357¹ KC) — sąd zmienia/rozwiązuje umowę gdy życie się zmieniło.
7. FIKCYJNA WIERZYTELNOŚĆ: żądanie pieniędzy bez realnej podstawy = bezpodstawne wzbogacenie (art. 405 KC) + świadczenie nienależne (art. 410 KC). TSUE C-520/21 Szcześniak — bank nic ponad nominalny kapitał.
8. Szkoda ciągła sukcesywna od DNIA ZERO (pierwsza czynność windykacyjna bez ścieżki POMOCY).
9. Odsetki dobowe od każdej doby z osobna (TSUE C-903/24 z 11.06.2026).
10. RODO art. 82 — wpis w BIK z kwotą z nieważnej klauzuli = bezprawne przetwarzanie (TSUE C-300/21 Österreichische Post).
11. Solidarna odpowiedzialność zarządu (art. 293/483 KSH + art. 296 KK).
12. Effet dissuasif — odszkodowanie MUSI odstraszać, więc może i często przewyższa dług.
13. Restrukturyzacja w 4 wymiarach: językowy, prawny, aksjologiczny, statystyczny.
14. Nieuczciwe praktyki rynkowe (Dyrektywa 2005/29).
15. Sankcja kredytu darmowego (art. 45 UKK).
16. Klauzula generalna: konsument jest stroną słabszą, sąd chroni z urzędu.

STYL:
- Konkretny, nie ogólnikowy.
- Odwołaj się do PRZEPISÓW i ORZECZEŃ TSUE/ETPC.
- Polskie orzeczenia — tylko jako potwierdzenie linii, nie jako podstawa.
- Konsumenta nazywasz na "Ty" — używasz jego imienia.
- Bez fachowego bełkotu w tekście dla klienta. Jasno, prosto, mocno.
- Zakończ jednoznacznym werdyktem: IDZIEMY albo NIE IDZIEMY, i dlaczego.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formData, documentsText, customerName, customerNumber, paymentSessionId } = req.body;

    // Verify payment (in production: check Stripe session)
    if (!paymentSessionId) {
      return res.status(402).json({ error: 'Płatność wymagana' });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build user prompt from form
    const userPrompt = `KLIENT: ${customerName || 'Anonim'}
NUMER KLIENTA: ${customerNumber}

DANE Z FORMULARZA:
${JSON.stringify(formData, null, 2)}

${documentsText ? `DOKUMENTY (fragmenty tekstowe):
${documentsText.substring(0, 15000)}` : 'Bez załączonych dokumentów.'}

ZADANIE:
Wykonaj pełną analizę sprawy w języku NIEFACHOWYM (ale dokładnym prawnie).
Struktura odpowiedzi:

1. TWOJA POZYCJA W JEDNYM ZDANIU
2. CO ZROBILI BANK/FIRMA (lista naruszeń, po polsku prosto)
3. TWOJE PRAWO — 3-5 najmocniejszych podstaw prawnych (przepisy PL, UE, orzeczenia TSUE)
4. TWOJE ROSZCZENIA (co możesz żądać i za co)
5. NASZA REKOMENDACJA — plan działania krok po kroku
6. WERDYKT: IDZIEMY / NIE IDZIEMY + uzasadnienie
7. DYSKLAJMER: to analiza wstępna, pismo procesowe podpisuje prawnik.

Maksymalna moc argumentów. Jasność. Bez wody.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: [
        { type: 'text', text: IMENT_SYSTEM, cache_control: { type: 'ephemeral' } }
      ],
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    const analysis = message.content[0].text;

    // Generate hash for the document (proof of authenticity)
    const timestamp = new Date().toISOString();
    const hashInput = `${customerNumber}|${customerName}|${timestamp}|${analysis.substring(0, 200)}`;
    const documentHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16).toUpperCase();

    // Build final response with metadata
    const result = {
      customerNumber,
      customerName,
      timestamp,
      documentHash,
      analysis,
      footer: `\n\n---\nDokument nr: RR-${customerNumber}-${documentHash}\nWygenerowano: ${timestamp}\nKlient: ${customerName}\nHash: ${documentHash}\n\nMateriał chroniony prawem autorskim i stanowi tajemnicę przedsiębiorstwa (art. 11 u.z.n.k.). Nieuprawnione rozpowszechnianie skutkuje odpowiedzialnością odszkodowawczą i karną.`
    };

    return res.status(200).json(result);

  } catch (err) {
    console.error('Analysis error:', err);
    return res.status(500).json({ error: err.message });
  }
};
