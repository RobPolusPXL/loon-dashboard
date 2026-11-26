# Loon

Een PWA die je bpost-loonfiches en time statements toont. Loonfiches per maand en per jaar: bruto, RSZ, bedrijfsvoorheffing, netto,
regularisaties, gewerkte dagen en uren, maaltijdcheques, fietsvergoeding, index en jaarwedde.

Time statements (tabblad Werk): gewerkte dagen en uren per dag in een jaarkalender, meerprestaties, toelages, afwezigheden en het verlofsaldo.

Je leest de PDF's uit bpost4me in via **Gegevens** (beide soorten door elkaar). Ze worden in je browser gelezen (pdf.js); alleen de
uitgelezen bedragen gaan naar je eigen Firestore-database achter een Google-login. De PDF zelf,
rijksregisternummer, IBAN, stamnummer en adres worden niet bewaard. Er staat geen loondata in deze repo.

Bij het inlezen worden de totalen op de fiche nagerekend (lijnen per sectie, bruto → netto,
herberekeningen → regularisatie). Klopt iets niet, dan meldt de app dat bij die fiche.

## Firebase

Gebruikt hetzelfde Firebase-project als Verbruik thuis (`verbruik-dashboard`), in een aparte collectie
`users/{uid}/loonfiches`. De regels in [`firestore.rules`](firestore.rules) laten elke gebruiker alleen
zijn eigen data zien.

## Online zetten

Repo-instellingen → Pages → Deploy from a branch → `main` / `(root)`.
De app staat dan op `https://robpoluspxl.github.io/loon-dashboard/`.

## Lokaal testen

`demo-data.json` (niet in git) met fiches in de map zetten en de app openen met `?demo`.
