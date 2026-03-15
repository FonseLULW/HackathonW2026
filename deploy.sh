#!/usr/bin/env bash
set -uo pipefail

# ── Config ──────────────────────────────────────────────────
PROJECT_ID="snooplog"
REGION="northamerica-northeast1"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/snooplog/pipeline:latest"
PIPELINE_SERVICE="snooplog-pipeline"

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# ── Options ─────────────────────────────────────────────────
OPTIONS=(
  "Pipeline: Build Docker image (Cloud Build)"
  "Pipeline: Deploy to Cloud Run"
  "Dashboard: Deploy to Vercel"
  "Dummy App: Deploy to Vercel"
  "All: Full deploy (build + deploy everything)"
)

NUM=${#OPTIONS[@]}
CURSOR=0
CHECKED=()
SELECTED=()

for ((i = 0; i < NUM; i++)); do
  CHECKED+=("false")
done

# ── Draw menu ───────────────────────────────────────────────
draw_menu() {
  # Move cursor up to overwrite previous draw
  if [[ ${1:-0} -eq 1 ]]; then
    for ((i = 0; i < NUM + 4; i++)); do
      printf '\033[A\033[2K'
    done
  fi

  echo -e "${BOLD}${CYAN}SnoopLog Deploy${NC}"
  echo -e "Use ↑↓ to move, SPACE to select, ENTER to confirm"
  echo ""

  for ((i = 0; i < NUM; i++)); do
    local arrow="  "
    local check="○"
    if [[ "${CHECKED[$i]}" == "true" ]]; then
      check="${GREEN}●${NC}"
    fi
    if [[ $i -eq $CURSOR ]]; then
      arrow="${CYAN}▸${NC}"
    fi
    echo -e "  $arrow $check ${OPTIONS[$i]}"
  done
  echo ""
}

# ── Interactive selector ────────────────────────────────────
select_options() {
  tput civis 2>/dev/null || true

  draw_menu 0

  while true; do
    IFS= read -rsn1 key

    if [[ "$key" == $'\x1b' ]]; then
      read -rsn1 -t 0.1 _seq1 || true
      read -rsn1 -t 0.1 _seq2 || true
      case "$_seq2" in
        A) [[ $CURSOR -gt 0 ]] && CURSOR=$((CURSOR - 1)) ;;
        B) [[ $CURSOR -lt $((NUM - 1)) ]] && CURSOR=$((CURSOR + 1)) ;;
      esac
      draw_menu 1
    elif [[ "$key" == " " ]]; then
      if [[ "${CHECKED[$CURSOR]}" == "true" ]]; then
        CHECKED[$CURSOR]="false"
      else
        CHECKED[$CURSOR]="true"
        if [[ $CURSOR -eq $((NUM - 1)) ]]; then
          for ((i = 0; i < NUM - 1; i++)); do
            CHECKED[$i]="true"
          done
        fi
      fi
      draw_menu 1
    elif [[ "$key" == "" ]]; then
      break
    fi
  done

  tput cnorm 2>/dev/null || true

  SELECTED=()
  for ((i = 0; i < NUM; i++)); do
    if [[ "${CHECKED[$i]}" == "true" ]]; then
      SELECTED+=("$i")
    fi
  done
}

# ── Deploy functions ────────────────────────────────────────
build_pipeline() {
  echo -e "\n${BOLD}${CYAN}▸ Building pipeline Docker image...${NC}"
  gcloud builds submit \
    --config=/dev/stdin \
    --timeout=600s \
    --project="$PROJECT_ID" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'pipeline/Dockerfile', '-t', '$IMAGE', '.']
images:
  - '$IMAGE'
EOF
  echo -e "${GREEN}✓ Pipeline image built and pushed${NC}"
}

deploy_pipeline() {
  echo -e "\n${BOLD}${CYAN}▸ Deploying pipeline to Cloud Run...${NC}"
  gcloud run deploy "$PIPELINE_SERVICE" \
    --image "$IMAGE" \
    --port 3001 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 2 \
    --timeout 300 \
    --allow-unauthenticated \
    --region "$REGION" \
    --project "$PROJECT_ID"
  local url
  url=$(gcloud run services describe "$PIPELINE_SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
  echo -e "${GREEN}✓ Pipeline deployed → ${url}${NC}"
}

deploy_dashboard() {
  echo -e "\n${BOLD}${CYAN}▸ Deploying dashboard to Vercel...${NC}"
  (cd dashboard && vercel --prod)
  echo -e "${GREEN}✓ Dashboard deployed${NC}"
}

deploy_dummy_app() {
  echo -e "\n${BOLD}${CYAN}▸ Deploying dummy app to Vercel...${NC}"
  (cd dummy-app && vercel --prod)
  echo -e "${GREEN}✓ Dummy app deployed${NC}"
}

# ── Main ────────────────────────────────────────────────────
clear
select_options

if [[ ${#SELECTED[@]} -eq 0 ]]; then
  echo -e "${YELLOW}Nothing selected. Exiting.${NC}"
  exit 0
fi

echo -e "\n${BOLD}Deploying:${NC}"
for idx in "${SELECTED[@]}"; do
  echo -e "  ${GREEN}●${NC} ${OPTIONS[$idx]}"
done
echo ""

set -e
for idx in "${SELECTED[@]}"; do
  case $idx in
    0) build_pipeline ;;
    1) deploy_pipeline ;;
    2) deploy_dashboard ;;
    3) deploy_dummy_app ;;
    4) build_pipeline; deploy_pipeline; deploy_dashboard; deploy_dummy_app ;;
  esac
done

echo -e "\n${BOLD}${GREEN}✓ All done!${NC}"
