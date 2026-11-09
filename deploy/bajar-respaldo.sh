#!/bin/sh
# Corre en la Mac cada noche (launchd): baja el respaldo más reciente del servidor y avisa si el
# último que hay en la Mac tiene más de 2 días. Los respaldos llegan cifrados; se abren con la llave
# privada de age que solo está en esta Mac.
set -u
DEST="$HOME/Respaldos/Peptique CRM"
mkdir -p "$DEST"
FECHA=$(date +%Y-%m-%d)
if scp -q -o BatchMode=yes -o ConnectTimeout=20 -i "$HOME/.ssh/hetzner_peptique" root@5.161.71.188:/opt/peptique/respaldos/ultimo.tar.age "$DEST/crm-$FECHA.tar.age.tmp"; then
  mv "$DEST/crm-$FECHA.tar.age.tmp" "$DEST/crm-$FECHA.tar.age"
fi
find "$DEST" -name 'crm-*.tar.age' -mtime +60 -delete
if [ -z "$(find "$DEST" -name 'crm-*.tar.age' -mtime -2)" ]; then
  osascript -e 'display notification "Hace más de 2 días que no se baja un respaldo." with title "Peptique CRM"'
fi
