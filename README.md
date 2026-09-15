# SmartMoney

Et personlig økonomiverktøy som kjører helt i nettleseren.
Importer en CSV fra nettbanken, så kategoriserer den transaksjoner,
setter opp budsjett, følger sparemål og regner ut lønn og skatt.

## Personvern

Ingenting sendes noe sted. All data lagres lokalt i nettleseren din
(localStorage og IndexedDB) og forlater aldri maskinen. Det finnes
ingen server, ingen konto og ingen innlogging.

Det betyr også at dataene tilhører den nettleseren, på den maskinen.
Bruker du en annen nettleser, ser appen tom ut.

## Bruk

Åpne nettsiden og trykk «Installer» i adressefeltet i Chrome eller
Edge for å få den som en vanlig app med eget ikon.

Skal du kjøre den lokalt i stedet:

```
python3 dev_server.py 8765
```

og åpne http://localhost:8765

## Teknisk

Ren HTML, CSS og JavaScript. Ingen rammeverk, ingen byggesteg,
ingen avhengigheter.
