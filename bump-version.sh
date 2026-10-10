#!/bin/bash
# Bumper appversjonen ALLE de tre stedene den må stå, i én kommando.
#
# Hvorfor dette finnes: cache-busting krever at ?v=-parameteren på hver
# script-/CSS-tag endres, OG at version.json + <meta name="app-version">
# holdes i synk (checkForUpdate() i js/main.js sammenligner de to for å
# oppdage at en gammel, cachet kopi kjører — se kommentaren der).
# Glemmer man ett av stedene, får man enten en oppdatering som ikke når
# fram, eller en unødvendig omlasting. Derfor: aldri rediger dem for
# hånd, kjør dette i stedet.
#
#   ./bump-version.sh          → bruker dagens dato + klokkeslett
#   ./bump-version.sh 20261012 → bruker en egen streng
set -euo pipefail
cd "$(dirname "$0")"

NEW="${1:-$(date +%Y%m%d%H%M)}"
OLD=$(sed -n 's/.*<meta name="app-version" content="\([^"]*\)".*/\1/p' index.html)

if [ -z "$OLD" ]; then
  echo "Fant ikke <meta name=\"app-version\"> i index.html — avbryter." >&2
  exit 1
fi

# 1. version.json (hentes med no-store av checkForUpdate)
printf '{ "version": "%s" }\n' "$NEW" > version.json

# 2. meta-taggen (versjonen som faktisk kjører i den lastede HTML-en)
sed -i '' "s|<meta name=\"app-version\" content=\"$OLD\">|<meta name=\"app-version\" content=\"$NEW\">|" index.html

# 3. alle ?v=-parametere på script- og CSS-tagger
sed -i '' -E "s|(\.(js\|css))\?v=[^\"]*|\1?v=$NEW|g" index.html

echo "Versjon: $OLD → $NEW"
echo "Oppdatert: version.json, meta-tag, $(grep -c "?v=$NEW" index.html) fil-referanser"
