set -eu
mkdir -p /validation-output
uname -a > /validation-output/platform.txt
cat /etc/os-release >> /validation-output/platform.txt
for node in 22.13.0 24.22.2; do
  export PATH="/opt/runtimes/node-v$node-linux-x64/bin:/usr/bin:/bin"
  node -p 'JSON.stringify({platform:process.platform,arch:process.arch,version:process.version})'
  node --input-type=module -e 'await import("./dist/index.js")'
  node -e 'require("./dist/index.cjs")'
  node bin/run.js --version
  node bin/run.js capabilities --json > "/validation-output/node-$node-capabilities.json"
  node --input-type=module -e 'import fs from "node:fs";const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(value.ok!==true||value.command!=="capabilities"||value.schemaVersion!==2)process.exit(1)' "/validation-output/node-$node-capabilities.json"
  echo "PASS Linux x64 Node$node ESM/CJS/CLI JSON smoke"
done
