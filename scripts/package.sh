#!/usr/bin/env bash
# Build the Chrome Web Store upload: dist/deetz-<version>.zip
# Contains only what the extension needs at runtime (manifest, src, icons, license).
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
pkg_version=$(node -p "require('./package.json').version")
if [ "$version" != "$pkg_version" ]; then
  echo "Version mismatch: manifest.json is $version, package.json is $pkg_version" >&2
  exit 1
fi

npm run --silent check

mkdir -p dist
out="dist/deetz-$version.zip"
rm -f "$out"
zip -rq -X "$out" manifest.json src icons LICENSE -x '*.DS_Store'

echo "Built $out"
unzip -l "$out" | tail -n +4 | sed '$d' | sed '$d' | awk '{print "  " $4}'
du -h "$out" | awk '{print "Size: " $1}'
