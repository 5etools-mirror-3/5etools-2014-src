# Dependency Audit & Migration Plan

> Basato su `package.json`, `package-lock.json`, `npm audit --json` e `npm outdated --long`.
>
> Nota: il progetto è quasi interamente `devDependencies`, quindi il rischio principale riguarda toolchain, build, test, generazione asset e script di manutenzione. Il runtime del sito è meno esposto, ma alcuni tool possono comunque impattare supply chain e CI/CD.

## 1) Sintesi esecutiva

### Osservazioni principali
- `package.json` dichiara `engines.node >=24`, ma `.node-version` è fermo a `17.1.0` → **incongruenza critica** da risolvere subito.
- Le dipendenze dirette più rischiose emerse da `npm audit` sono:
  - `handlebars@4.7.8` → **critical**
  - `simple-git@3.32.1` → **critical**
- Le dipendenze transitive problematiche più evidenti includono:
  - `glob` (più istanze, incluse versioni deprecate)
  - `inflight` (deprecated, memory leak)
  - `sourcemap-codec` (deprecated, sostituibile)
  - `source-map@0.8.0-beta.0` (deprecated beta branch)
  - `brace-expansion`, `minimatch`, `picomatch`, `serialize-javascript`, `rollup`, `postcss`, `qs`, `lodash`, `flatted`, `immutable`, `js-yaml`, `smol-toml`
- `workbox-cli` introduce una catena abbastanza ampia e alcuni fix richiedono **major upgrade**.
- `jest` / `test-exclude` trascinano alcuni pacchetti obsoleti, ma in molti casi il problema è transitive e va trattato con aggiornamento della toolchain, non con pin manuali.

### Priorità assolute
1. Allineare ambiente Node reale e dichiarato.
2. Aggiornare le dipendenze dirette critiche.
3. Rimuovere o sostituire pacchetti deprecati con sostituti ufficiali/raccomandati.
4. Verificare impatti su build/test/service worker generation.
5. Ripetere audit e lockfile refresh fino a eliminare i warning più gravi.

---

## 2) Classificazione delle dipendenze

### Dirette
Pacchetti elencati in `package.json`.

### Transitive
Pacchetti emersi dal `package-lock.json` e da `npm audit` come dipendenze di altri pacchetti.

### Deprecate
Pacchetti che mostrano messaggi espliciti di deprecazione nel lockfile o tramite audit.

### Vulnerabili
Pacchetti segnalati da `npm audit` con advisory noti.

### Obsolete ma funzionanti
Pacchetti non necessariamente vulnerabili, ma datati, con API legacy o versioni ferme rispetto al latest/wanted.

### Con sostituto consigliato
Pacchetti che nel messaggio di deprecazione indicano un successore o una migrazione raccomandata.

---

## 3) Tabella di audit delle dipendenze

| Pacchetto | Versione attuale | Tipo | Problema rilevato | Perché è un problema | Soluzione consigliata | Sostituto / target | Rischio breaking |
|---|---:|---|---|---|---|---|---|
| `handlebars` | `4.7.8` | Diretta | Vulnerabilità **critical** (AST type confusion / JS injection) | È una dipendenza diretta e impatta template generation / build-time tooling | Aggiornare almeno a `4.7.9` subito; poi testare eventuale salto a major più recente se compatibile | Nessun sostituto immediato obbligatorio; valutare alternativa solo se usato in modo esteso | Medio-alto |
| `simple-git` | `3.32.1` | Diretta | Vulnerabilità **critical** (RCE via config bypass) | È una dipendenza diretta con impatto su operazioni Git locali / automazioni | Aggiornare immediatamente a versione corretta (`>=3.32.3`, latest `3.36.0`) | Nessuno necessario | Basso-medio |
| `.node-version` | `17.1.0` | Ambiente | Disallineamento con `engines.node >=24` | Rischio di build instabile e differenze CI/prod | Allineare il file all’ambiente target o abbassare/adeguare `engines` con strategia chiara | Node 24 LTS o target reale di produzione | Alto |
| `workbox-cli` | `7.4.0` | Diretta | Catena con `@rollup/plugin-terser` / `serialize-javascript` vulnerabili; fix spesso major | Tool di build SW con superficie ampia | Aggiornare alla release compatibile più recente e rivalutare pipeline SW | Se necessario, passare a `workbox-build` o workflow custom | Medio-alto |
| `glob` | `10.5.0` e `11.1.0` (diverse istanze) | Transitiva | Messaggio di deprecazione; alcune istanze vecchie legate a vulnerabilità storiche | Rischio supply-chain e manutenzione | Portare le catene che lo introducono alle versioni più nuove | Nessuno diretto; dipende dal parent | Medio |
| `inflight` | `1.0.6` | Transitiva | **Deprecated**, memory leak | Pacchetto non supportato, non va mantenuto | Rimuovere tramite upgrade dei parent (`glob` / `test-exclude` / toolchain) | `lru-cache` per casi d'uso specifici, ma qui è transitive | Medio |
| `sourcemap-codec` | `1.4.8` | Transitiva | **Deprecated**, sostituzione raccomandata | Il lockfile indica esplicitamente il sostituto | Migrare a `@jridgewell/sourcemap-codec` quando la dipendenza parent lo supporta | `@jridgewell/sourcemap-codec` | Basso-medio |
| `source-map` | `0.8.0-beta.0` | Transitiva | Beta deprecata | Branch beta non mantenuto | Aggiornare `workbox-build`/catena che lo porta | Versione stabile del parent che non dipenda dal beta | Medio |
| `brace-expansion` | varie (`1.1.12`, `2.0.x`, `4.0.x`) | Transitiva | `npm audit`: DoS / hang su sequenze specifiche | Espone la toolchain a input malevoli o pattern patologici | Aggiornare i parent che la trascinano | Nessuno diretto | Medio |
| `minimatch` | varie (`3.x`, `5.x`, `9.x`, `10.x`) | Transitiva | ReDoS multipli noti | Può bloccare processi su pattern crafted | Aggiornare i parent a release che risolvono tutte le serie vulnerabili | Nessuno diretto | Medio |
| `picomatch` | varie (`2.x`, `4.x`) | Transitiva | ReDoS / method injection in pattern matching | Rilevante per globbing e file matching | Aggiornare i pacchetti parent che lo fissano a versioni patched | Nessuno diretto | Medio |
| `serialize-javascript` | `7.0.4` o inferiore | Transitiva | RCE/DoS storici, effetto su `@rollup/plugin-terser` | Impatta minificazione / build artifacts | Aggiornare `workbox-cli` e catena Rollup/Terser | Nessuno diretto | Medio-alto |
| `rollup` | `<2.80.0` in alcune catene | Transitiva | Arbitrary file write via path traversal | Rilevante nella toolchain di build | Portare le catene a versioni correnti compatibili | Nessuno diretto | Medio |
| `postcss` | `<8.5.10` | Transitiva | XSS in stringify CSS | Rilevante per build CSS/tooling | Aggiornare dipendenze che lo richiamano | Nessuno diretto | Basso-medio |
| `qs` | `<=6.14.1` | Transitiva | DoS / memory exhaustion in parsing | Rischio soprattutto su input non fidato | Aggiornare la catena parent | Nessuno diretto | Basso-medio |
| `lodash` | `<=4.17.23` | Transitiva | Prototype pollution / code injection | Pacchetto molto diffuso, rischio ampio | Aggiornare il pacchetto parent che lo fissa o sostituire se diretto | Nessuno diretto | Medio |
| `flatted` | `<=3.4.1` | Transitiva | High: DoS / prototype pollution | Pericoloso in parsing di strutture serializzate | Aggiornare il parent che lo porta | Nessuno diretto | Medio |
| `immutable` | `5.0.0 - 5.1.4` | Transitiva | Prototype pollution | Rischio di manipolazione oggetti | Aggiornare la catena parent | Nessuno diretto | Medio |
| `js-yaml` | `4.0.0 - 4.1.0` | Transitiva | Prototype pollution | Rilevante per parsing YAML | Aggiornare dipendenza parent | Nessuno diretto | Medio |
| `smol-toml` | `<1.6.1` | Transitiva | DoS via documenti TOML patologici | Possibile blocco su input crafted | Aggiornare il parent | Nessuno diretto | Basso-medio |
| `ajv` | `8.18.0` (nested) | Transitiva | Advisory storico su versioni molto vecchie | Il nested in audit è già fuori dal range vulnerabile; qui il problema è più manutentivo | Aggiornare il parent che ne installa una copia vecchia o validare che non sia esposta | Nessuno diretto | Basso |
| `external-editor` | transitive | Transitiva | Dependency chain tramite `inquirer` | Debolezza indiretta | Aggiornare `workbox-cli`/parent | Nessuno diretto | Basso |

---

## 4) Strategia di aggiornamento per priorità

### Ordine consigliato
1. **Sicurezza critica diretta**
   - `simple-git`
   - `handlebars`
2. **Ambiente / allineamento piattaforma**
   - `.node-version`
   - `engines.node`
3. **Toolchain ad ampia superficie**
   - `workbox-cli`
   - `jest` / `test-exclude`
   - `sass`, `eslint`, `stylelint`, `cspell-lib`, `prettier`
4. **Transitive deprecate/vulnerable che si risolvono via parent**
   - `glob`, `inflight`, `minimatch`, `picomatch`, `brace-expansion`
   - `serialize-javascript`, `rollup`, `postcss`, `qs`, `lodash`, `flatted`, `immutable`, `js-yaml`, `smol-toml`
5. **Manutenzione e pulizia finale**
   - refresh lockfile
   - audit ripetuto
   - verifica regressioni

### Criteri per priorità
- **Rischio di sicurezza**: massimo per `handlebars` e `simple-git`.
- **Impatto runtime**: medio-basso, ma forte per build pipeline e generazione asset.
- **Probabilità di breaking change**: alta per `workbox-cli` e eventuali major transitive.
- **Facilità di sostituzione**: alta per patch/minor; bassa per librerie con API strettamente integrate.
- **Alternative ufficiali**: forte quando il messaggio di deprecazione suggerisce sostituti (`sourcemap-codec` → `@jridgewell/sourcemap-codec`).

---

## 5) Roadmap di migrazione in fasi

### Fase 1 — Audit e classificazione
**Obiettivo:** congelare il baseline e classificare il rischio reale.

**Prerequisiti:**
- `package.json`
- `package-lock.json`
- `npm audit --json`
- `npm outdated --long`
- versione Node/npm effettiva in locale/CI

**Attività concrete:**
- catalogare dirette vs transitive
- mappare advisory vs deprecazioni vs obsolescenza
- identificare catene più impattanti (`workbox-cli`, `jest`, `glob`)
- confermare i punti di ingresso nel runtime/build

**Criteri di completamento:**
- backlog prioritizzato con owner e rischio
- elenco chiaro delle dipendenze critiche

**Test da eseguire:**
- `npm audit`
- `npm outdated --long`
- `npm ls --all --depth=2`
- build/test baseline

**Possibili rollback:**
- nessun cambio di codice; rollback non necessario

---

### Fase 2 — Aggiornamenti a basso rischio
**Obiettivo:** rimuovere i problemi più facili senza cambiare architettura.

**Prerequisiti:**
- baseline stabile
- test verdi

**Attività concrete:**
- aggiornare patch/minor diretti:
  - `handlebars` `4.7.8 -> 4.7.9`
  - `simple-git` `3.32.1 -> >=3.32.3` (latest `3.36.0`)
  - altri aggiornamenti patch/minor (`prettier`, `eslint`, `jest`, `sass`, `stylelint`, `tinybench`, `probe-image-size`, `globals`, `ajv`, `5etools-utils`)
- rigenerare lockfile
- rieseguire audit

**Criteri di completamento:**
- nessuna vulnerabilità critica diretta rimasta
- build/test ancora verdi

**Test da eseguire:**
- `npm test`
- `npm run build`
- `npm audit`

**Possibili rollback:**
- revert del lockfile e dei bump diretti

---

### Fase 3 — Sostituzione di librerie deprecate
**Obiettivo:** eliminare le deprecazioni esplicite e ridurre debito tecnico.

**Prerequisiti:**
- aggiornamenti a basso rischio completati
- mappa delle dipendenze transitive aggiornata

**Attività concrete:**
- risolvere `sourcemap-codec` → `@jridgewell/sourcemap-codec`
- sostituire o aggiornare parent che trascinano `inflight`
- rimuovere catene che portano `source-map@0.8.0-beta.0`
- portare `glob` / `minimatch` / `picomatch` a versioni patched

**Criteri di completamento:**
- nessun pacchetto con deprecazione esplicita nota nel lockfile, salvo eccezioni motivate

**Test da eseguire:**
- build degli asset
- test unitari
- test dei flussi di generazione (`build:sw`, `build:css`)

**Possibili rollback:**
- rollback del parent package o override temporaneo del lockfile

---

### Fase 4 — Aggiornamenti major e refactor
**Obiettivo:** allineare toolchain e API alle versioni moderne con minore debito futuro.

**Prerequisiti:**
- fase 2 e 3 completate
- suite di test affidabile

**Attività concrete:**
- valutare upgrade major di `workbox-cli` se richiesto dai fix di sicurezza
- verificare compatibilità di `cspell-lib` e `eslint` con Node target
- adeguare script e config se cambiano CLI/API
- introdurre adapter/wrapper dove una sostituzione non sia immediata

**Criteri di completamento:**
- build e release pipeline riproducibili
- nessuna regressione funzionale

**Test da eseguire:**
- `npm test`
- `npm run build`
- smoke test della UI e dei file generati

**Possibili rollback:**
- mantenere branch paralleli o revert di refactor specifici

---

### Fase 5 — Hardening finale e verifica vulnerabilità
**Obiettivo:** chiudere il ciclo con un baseline sicuro e documentato.

**Prerequisiti:**
- nessuna vulnerabilità critica aperta
- lockfile stabilizzato

**Attività concrete:**
- eseguire audit finale
- verificare dipendenze duplicate e versioni multiple inutili
- aggiornare documentazione operativa
- fissare policy di aggiornamento periodico

**Criteri di completamento:**
- audit pulito o con eccezioni esplicitamente accettate
- report finale approvato

**Test da eseguire:**
- `npm audit`
- `npm outdated`
- `npm test`
- build completa

**Possibili rollback:**
- ripristino lockfile precedente se emerge regressione critica

---

## 6) Trasformazione dei messaggi di deprecazione in azioni concrete

### `sourcemap-codec` → `@jridgewell/sourcemap-codec`
- **Vecchio pacchetto:** `sourcemap-codec`
- **Nuovo pacchetto:** `@jridgewell/sourcemap-codec`
- **Azione concreta:** aggiornare il parent che lo richiede; non introdurre dipendenze manuali se il parent non è compatibile.
- **Refactor:** normalmente nessuno lato app, solo aggiornamento toolchain.

### `inflight` → `lru-cache` o rimozione della catena
- **Vecchio pacchetto:** `inflight`
- **Nuovo approccio:** eliminare la dipendenza indiretta tramite upgrade di `glob`/tooling; `lru-cache` è il suggerimento del messaggio, ma qui è più un pattern che un drop-in replacement.
- **Refactor:** nessuno diretto; intervenire sul parent.

### `glob` old versions → upgrade alla serie corrente
- **Vecchio pacchetto:** `glob` serie vecchie (soprattutto `7.x` in nested chain)
- **Nuovo pacchetto:** versione corrente compatibile con i parent moderni
- **Azione concreta:** aggiornare `jest`/`test-exclude`/tooling e verificare che non restino istanze `7.x`.

### `source-map@0.8.0-beta.0`
- **Vecchio pacchetto:** beta branch non mantenuto
- **Nuovo approccio:** far usare al parent una release stabile che non dipenda dal beta
- **Refactor:** limitato alla toolchain build.

---

## 7) Strategie per dipendenze senza sostituto chiaro

### `simple-git`
- strategia: **aggiornamento alla versione più recente compatibile**
- motivazione: sostituto non necessario; il problema è una versione vulnerabile

### `handlebars`
- strategia: **aggiornamento + hardening dell’uso**
- se il template engine è usato su input non fidato, considerare isolamento tramite wrapper e validazione input

### `workbox-cli`
- strategia: **upgrade + possibile isolamento del build step**
- se il salto major è costoso, mantenere temporaneamente ma isolare il comando in CI con input controllati

### `jest` / `test-exclude`
- strategia: **aggiornamento toolchain**
- evitare pin manuali di transitive, preferire upgrade del parent

---

## 8) Azioni immediate da fare oggi

1. Aggiornare `simple-git` alla patch sicura.
2. Aggiornare `handlebars` almeno a `4.7.9` e rieseguire build/test.
3. Decidere il target Node reale e correggere `.node-version` / `engines`.
4. Eseguire un refresh controllato di `npm install` e rigenerare `package-lock.json`.
5. Verificare se `workbox-cli` richiede un salto major per eliminare `serialize-javascript` / `@rollup/plugin-terser` vulnerabili.
6. Pianificare la pulizia delle catene `glob` / `inflight` / `minimatch` / `picomatch`.

---

## 9) Rischi e dipendenze critiche

### Critici
- `handlebars` diretto: impatto alto e vulnerabilità severe
- `simple-git` diretto: rischio RCE
- mismatch Node 17 vs target Node 24: rischio di instabilità ambientale

### Alti
- `workbox-cli` e la sua catena (`rollup`, `serialize-javascript`)
- `glob` / `minimatch` / `picomatch` / `brace-expansion`

### Medi
- `inflight`, `sourcemap-codec`, `source-map beta`
- `lodash`, `qs`, `postcss`, `js-yaml`, `immutable`, `flatted`, `smol-toml`

### Rischi operativi
- regressioni nelle build di CSS / SW
- rotture nei test generati da upgrade di tool di linting e testing
- lockfile più “rumoroso” dopo refresh di transitive

---

## 10) Ordine di lavoro suggerito per sprint/commit

### Sprint / Commit 1
- allineamento Node target
- bump `simple-git`
- bump `handlebars`
- esecuzione test e audit

### Sprint / Commit 2
- refresh toolchain minore (`eslint`, `prettier`, `jest`, `sass`, `stylelint`, `cspell-lib`)
- controllo deprecazioni residue

### Sprint / Commit 3
- upgrade `workbox-cli` e catena correlata
- verifiche build SW

### Sprint / Commit 4
- pulizia transitive problematiche (`glob`, `minimatch`, `picomatch`, `brace-expansion`, `inflight`)
- rimozione di beta/deprecated non più necessari

### Sprint / Commit 5
- hardening finale
- audit finale
- documentazione e policy di aggiornamento periodico

---

## 11) Prossimi dati utili per affinare il piano

Se vuoi fare il passo successivo, i dati più utili sono:
- `npm ls --all --depth=2`
- eventuali log di installazione/build con warning di deprecazione
- versione Node/npm usata in CI e in produzione
- output di `npm audit fix --dry-run`

---

## FASE 2 COMPLETATA — Esecuzione e Risultati

**Data di esecuzione:** 2026-05-04
**Status:** ✅ COMPLETATO

### Azioni intraprese
1. ✅ Aggiornato `.node-version` da `17.1.0` → `24` (allineamento con `engines.node >=24`)
2. ✅ Eseguito `npm update` per aggiornare tutte le dipendenze dirette
3. ✅ Rigenerato `package-lock.json` (61 pacchetti aggiunti, 46 rimossi, 208 cambiati)
4. ✅ Eseguiti test:
   - `eslint .` — PASS ✓
   - `stylelint` — PASS ✓
   - `jest` (9 suites, 38 tests) — PASS ✓
   - `npm run build:css` — PASS ✓
   - `npm run build:sw:prod` — PASS ✓
   - `npm run build` (completo) — PASS ✓

### Risultati dell'audit post-aggiornamento
**Prima della Fase 2:**
- Vulnerabilità critical dirette: 2 (`handlebars`, `simple-git`)
- Vulnerabilità totali: 30+

**Dopo la Fase 2:**
- Vulnerabilità critical: 0 ✓
- Vulnerabilità high: 4 (tutte transitive, nella catena `workbox-cli`)
- Vulnerabilità low: 3
- **Totale: 7 vulnerabilità rimaste**

### Dipendenze dirette aggiornate
| Pacchetto | Before | After | Note |
|---|---|---|---|
| `handlebars` | 4.7.8 | 4.7.9 | Critical vuln. risolto ✓ |
| `simple-git` | 3.32.1 | 3.36.0 | Critical RCE risolto ✓ |
| `5etools-utils` | 0.16.2 | 0.16.4 | Patch update |
| `ajv` | 8.18.0 | 8.20.0 | Patch update |
| `eslint` | 10.0.1 | 10.3.0 | Minor update |
| `globals` | 17.3.0 | 17.6.0 | Patch update |
| `jest` | 30.2.0 | 30.3.0 | Patch update |
| `prettier` | 3.8.1 | 3.8.3 | Patch update |
| `probe-image-size` | 7.2.3 | 7.3.0 | Patch update |
| `sass` | 1.97.3 | 1.99.0 | Patch update |
| `stylelint` | 17.3.0 | 17.10.0 | Minor update |
| `tinybench` | 6.0.0 | 6.0.1 | Patch update |
| `cspell-lib` | 9.6.4 | 9.8.0 | Patch update |
| `esbuild` | 0.27.3 | 0.27.7 | Patch update |
| `commander` | 14.0.3 | 14.0.3 | OK (no update available) |
| (altri) | — | — | OK (già al wanted) |

### Vulnerabilità high rimaste (in scope Fase 3)
- `serialize-javascript` (trascinato da `@rollup/plugin-terser` → `workbox-build` → `workbox-cli`)
- `@rollup/plugin-terser` (trascinato da `workbox-build` → `workbox-cli`)
- `inquirer` (trascinato da `workbox-cli`)
- `external-editor` (trascinato da `inquirer` → `workbox-cli`)

**Azione consigliata per Fase 3:**
Upgrade di `workbox-cli` a versione che risolve le dipendenze vulnerabili, oppure valutare alternative (es. `workbox-build` + workflow custom).

### Pacchetti outdated rimasti
| Pacchetto | Versione | Latest | Tipo | Fase |
|---|---|---|---|---|
| `cspell-lib` | 9.8.0 | 10.0.0 | Major | Fase 4 (valutazione) |
| `esbuild` | 0.27.7 | 0.28.0 | Minor | Fase 4 (basso rischio) |

### Prossimi step
✅ **Fase 2: completata**
📋 **Fase 3**: Risoluzione `workbox-cli` e vulnerabilità transitive rimaste
📋 **Fase 4**: Valutazione major upgrade (`cspell-lib@10.0.0`, `esbuild@0.28.0`)
📋 **Fase 5**: Hardening finale e policy di aggiornamento periodico

