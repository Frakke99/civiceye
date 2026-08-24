#!/usr/bin/env bash
# Controleert alle relatieve links tussen markdownbestanden.
# Een gebroken link in architectuurdocumentatie is stille rot: niemand merkt
# het tot iemand het document nodig heeft.
set -uo pipefail

fouten=0
gecontroleerd=0

while IFS= read -r bestand; do
  map="$(dirname "$bestand")"
  # Alle (relatieve) markdownlinks: ](pad.md) of ](pad.md#anker) of ](map/)
  links="$(grep -oE '\]\([^)]+\)' "$bestand" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//')"
  [ -z "$links" ] && continue

  while IFS= read -r link; do
    [ -z "$link" ] && continue
    case "$link" in
      http://*|https://*|mailto:*|\#*) continue ;;
    esac
    pad="${link%%#*}"
    [ -z "$pad" ] && continue
    doel="$map/$pad"
    gecontroleerd=$((gecontroleerd + 1))
    if [ ! -e "$doel" ]; then
      echo "GEBROKEN  $bestand → $link"
      fouten=$((fouten + 1))
    fi
  done <<< "$links"
done <<< "$(find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*')"

echo "$gecontroleerd links gecontroleerd, $fouten gebroken."
[ "$fouten" -eq 0 ]
