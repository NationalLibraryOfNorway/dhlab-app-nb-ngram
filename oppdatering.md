# Oppdatering og publisering

Denne appen publiseres ikke automatisk fra `main`.

Kildekode ligger på `main`, mens den publiserte appen bygges og legges ut via `gh-pages`. Det betyr at en vanlig merge til `main` ikke alene oppdaterer den publiserte PWA-en.

## Anbefalt arbeidsflyt

1. Klon repoet:

```bash
git clone https://github.com/NationalLibraryOfNorway/ngram.git
cd ngram
```

2. Installer avhengigheter:

```bash
npm install
```

3. Gjør endringer i kodebasen.

4. Push eller merge endringene til `main`.

5. Oppdater lokal `main` og kjør deploy fra repo-roten:

```bash
git checkout main
git pull --ff-only origin main
npm run deploy
```

## Hva `npm run deploy` gjør

Deploy-scriptet:

- bygger appen med `npm run build`
- publiserer innholdet i `build/` til `gh-pages`
- lager en egen deploy-commit på `main`
- pusher endringene

## Viktig å vite

- `main` inneholder kildekode
- `gh-pages` inneholder publisert build
- GitHub Pages publiserer når `gh-pages` oppdateres
- PWA-en kan fortsatt vise gammel versjon en kort stund på grunn av service worker-cache

Hvis du ikke ser siste versjon med en gang, lukk alle faner med appen og åpne siden på nytt.
