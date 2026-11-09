#!/bin/sh
# Respaldo nocturno del CRM en el servidor: base de datos completa y archivos (COA y protocolos),
# cifrados con la llave pública de age. La llave privada vive solo en la Mac: el servidor no puede
# leer sus propios respaldos. Se guardan 14 días aquí; la Mac baja cada noche el más reciente.
# Cron (3:00 a. m. de Monterrey): 0 9 * * * /opt/peptique/respaldo.sh >> /opt/peptique/respaldos/respaldo.log 2>&1
set -eu
BASE=/opt/peptique
DIR=$BASE/respaldos
SB=$BASE/supabase
FECHA=$(date -u +%Y-%m-%d)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DIR"

docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc > "$TMP/base.dump"
tar -C "$SB/volumes" -czf "$TMP/archivos.tgz" storage
tar -C "$TMP" -cf - base.dump archivos.tgz | age -R "$BASE/respaldo.pub" > "$DIR/crm-$FECHA.tar.age.tmp"
mv "$DIR/crm-$FECHA.tar.age.tmp" "$DIR/crm-$FECHA.tar.age"
ln -sf "crm-$FECHA.tar.age" "$DIR/ultimo.tar.age"
find "$DIR" -name 'crm-*.tar.age' -mtime +14 -delete
echo "$(date -u +%FT%TZ) ok $(du -h "$DIR/crm-$FECHA.tar.age" | cut -f1)"
