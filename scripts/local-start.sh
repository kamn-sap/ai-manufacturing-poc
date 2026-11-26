#!/usr/bin/env bash

set -euo pipefail

CONTAINER_NAME="ai-manufacturing-poc-emulator"
IMAGE_NAME="ai-manufacturing-poc/aws-emulator"
EMULATOR_DIR="${HOME}/.aws/emulator"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop or Docker Engine, then retry." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm 12+ is required. Install pnpm, then retry." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( NODE_MAJOR < 26 )); then
  echo "Node.js 26+ is required." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "Review JWT_SECRET and AUTH_PASSWORD before exposing the app beyond localhost."
fi

mkdir -p "${EMULATOR_DIR}"

docker build -t "${IMAGE_NAME}" docker/aws-emulator
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

docker run --detach --name "${CONTAINER_NAME}" \
  --memory=2g --memory-swap=2g \
  --user "$(id -u):$(id -g)" \
  --publish 127.0.0.1:9297:9297 \
  --env HOME=/home/emulator \
  --volume "${EMULATOR_DIR}:/home/emulator/.aws/emulator" \
  "${IMAGE_NAME}" -p 9297

APP_PID=
cleanup() {
  trap - EXIT INT TERM
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

EMULATOR_CONFIG_DIR="${EMULATOR_DIR}/9297"
echo "Waiting for the AWS Emulator..."
EMULATOR_READY=false
for _ in $(seq 1 60); do
  if [[ -f "${EMULATOR_CONFIG_DIR}/emulator_credentials" \
      && -f "${EMULATOR_CONFIG_DIR}/config" \
      && -f "${EMULATOR_CONFIG_DIR}/ca.pem" ]]; then
    if AWS_CA_BUNDLE="${EMULATOR_CONFIG_DIR}/ca.pem" node -e '
      const fs = require("node:fs");
      const https = require("node:https");
      const request = https.get(
        "https://127.0.0.1:9297/__admin/health",
        { ca: fs.readFileSync(process.env.AWS_CA_BUNDLE) },
        (response) => {
          response.resume();
          process.exitCode = response.statusCode === 200 ? 0 : 1;
        },
      );
      request.on("error", () => { process.exitCode = 1; });
      request.setTimeout(1000, () => request.destroy());
    ' 2>/dev/null; then
      EMULATOR_READY=true
      break
    fi
  fi
  sleep 1
done

if [[ "${EMULATOR_READY}" != true ]]; then
  echo "AWS Emulator did not become ready. Check container logs:" >&2
  docker logs "${CONTAINER_NAME}" >&2 || true
  exit 1
fi

export AWS_ENDPOINT_URL="https://127.0.0.1:9297"
export AWS_SHARED_CREDENTIALS_FILE="${EMULATOR_CONFIG_DIR}/emulator_credentials"
export AWS_CONFIG_FILE="${EMULATOR_CONFIG_DIR}/config"
export AWS_CA_BUNDLE="${EMULATOR_CONFIG_DIR}/ca.pem"
export AWS_SDK_LOAD_CONFIG="true"
export AWS_EC2_METADATA_DISABLED="true"
export AWS_DISABLE_HOST_PREFIX_INJECTION="true"

if [[ ! -d node_modules ]]; then
  pnpm install --frozen-lockfile
fi

pnpm aws:init

echo "Starting app: http://localhost:5173"
echo "Press Ctrl+C to stop the app and Emulator."
pnpm exec concurrently -k -n app,worker -c blue,green "pnpm dev" "pnpm worker" &
APP_PID=$!
wait "${APP_PID}"
