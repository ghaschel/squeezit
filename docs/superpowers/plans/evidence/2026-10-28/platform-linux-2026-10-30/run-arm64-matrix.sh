set -eu
mkdir -p /validation-output
uname -a > /validation-output/platform.txt
cat /etc/os-release >> /validation-output/platform.txt
openssl version >> /validation-output/platform.txt
pdftoppm -v >> /validation-output/platform.txt 2>&1
dpkg-query -W poppler-utils fonts-dejavu-core libssl3t64 >> /validation-output/platform.txt
for qpdf in 11.3.0 12.4.2; do
  for node in 22.13.0 24.22.2; do
    export PATH="/opt/qpdf-$qpdf/bin:/opt/runtimes/node-v$node-linux-arm64/bin:/usr/bin:/bin"
    printf 'Node %s / QPDF %s\n' "$node" "$qpdf"
    qpdf --version
    node --version
    if node node_modules/vitest/vitest.mjs run tests/unit/pdf.test.ts tests/integration/pdf-process.test.ts tests/integration/api-pdf.test.ts tests/integration/api-pdf-signatures.test.ts tests/integration/api-pdf-preservation.test.ts --maxWorkers 2 --maxConcurrency 2 > "/validation-output/node-$node-qpdf-$qpdf.log" 2>&1; then
      echo 'tests=PASS'
    else
      echo 'tests=FAIL'
      tail -60 "/validation-output/node-$node-qpdf-$qpdf.log"
      exit 1
    fi
    node --input-type=module -e 'await import("./dist/index.js")'
    node -e 'require("./dist/index.cjs")'
    node bin/run.js --version
    node bin/run.js capabilities --json > "/validation-output/node-$node-qpdf-$qpdf-capabilities.json"
    node --input-type=module -e 'import fs from "node:fs";const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(value.ok!==true||value.command!=="capabilities"||value.schemaVersion!==2)process.exit(1)' "/validation-output/node-$node-qpdf-$qpdf-capabilities.json"
    tail -8 "/validation-output/node-$node-qpdf-$qpdf.log"
  done
done
