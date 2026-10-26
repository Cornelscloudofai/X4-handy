#!/usr/bin/env bash
# Netlify-Bau nur auf ausdrücklichen Wunsch: Jeder erfolgreiche Produktions-Bau kostet Credits (15 von 300 im Monat).
# Gebaut wird nur, wenn die neueste Commit-Meldung „[live]“ enthält – sonst bricht Netlify den Bau ab (kostet nichts).
# Netlify: Exit-Code 0 = Bau abbrechen, 1 = bauen.
if git log -1 --pretty=%B | grep -q '\[live\]'; then
  echo "Commit enthält [live] – Netlify baut."
  exit 1
fi
echo "Kein [live] in der Commit-Meldung – Netlify-Bau übersprungen."
exit 0
