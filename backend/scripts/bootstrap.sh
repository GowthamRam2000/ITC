#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"

if [[ ! -f "${ROOT_DIR}/backend/.env" ]]; then
  cp "${ROOT_DIR}/backend/.env.example" "${ROOT_DIR}/backend/.env"
  echo "Created ${ROOT_DIR}/backend/.env from template."
fi

if [[ ! -d "${VENV_DIR}" ]]; then
  python3 -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"
python -m pip install --upgrade pip
if ! pip install -r "${ROOT_DIR}/backend/requirements.txt"; then
  echo "WARNING: Dependency install failed. Check network and rerun:"
  echo "pip install -r ${ROOT_DIR}/backend/requirements.txt"
fi

echo "Bootstrap complete."
echo "Next:"
echo "1) Fill values in backend/.env"
echo "2) Run: python ${ROOT_DIR}/backend/scripts/check_services.py --env-file ${ROOT_DIR}/backend/.env --strict"
echo "3) Start API: uvicorn app.main:app --app-dir ${ROOT_DIR}/backend --reload --host 0.0.0.0 --port 8000"
