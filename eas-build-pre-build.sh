#!/bin/sh
set -euxo pipefail

npm run build

if [ ! -d android ]; then
  npx cap add android --skip-deps
fi

npx cap sync android
