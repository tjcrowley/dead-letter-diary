#!/usr/bin/env bash
# install.sh — Dead Letter Diary one-command installer
# chmod +x install.sh is required before running
#
# Usage: bash install.sh
#
# This script:
#   1. Checks Docker is installed and running
#   2. Starts Dead Letter Diary via Docker Compose
#   3. Waits for the app to be healthy
#   4. Registers a system service for auto-start after reboot
#   5. Opens the app in your browser
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────

print_banner() {
  echo ""
  echo "==================================="
  echo "  Dead Letter Diary — Installer"
  echo "==================================="
  echo ""
}

# ── 1. Docker check ──────────────────────────────────────────────────────────

print_banner

echo "Checking Docker..."

if ! command -v docker &>/dev/null; then
  echo ""
  echo "ERROR: Docker is not installed or not running."
  echo "Install Docker Desktop from https://www.docker.com/products/docker-desktop"
  echo ""
  exit 1
fi

if ! docker info &>/dev/null; then
  echo ""
  echo "ERROR: Docker is not installed or not running."
  echo "Install Docker Desktop from https://www.docker.com/products/docker-desktop"
  echo ""
  exit 1
fi

echo "Docker OK."

# ── 2. Determine install directory (repo root, one level up from scripts/) ───

INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Install directory: $INSTALL_DIR"

# ── 3. Start Compose ──────────────────────────────────────────────────────────

echo ""
echo "Starting Dead Letter Diary..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d
echo "Started."

# ── 4. Wait for health ────────────────────────────────────────────────────────

echo ""
echo "Waiting for app to start..."

HEALTH_URL="https://localhost/api/health"
MAX_ATTEMPTS=15
ATTEMPT=0
APP_HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if curl -sk --max-time 3 "$HEALTH_URL" &>/dev/null; then
    APP_HEALTHY=true
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

if [ "$APP_HEALTHY" = true ]; then
  echo "App is running."
else
  echo "Warning: App may still be starting. Check docker compose logs."
fi

# ── 5. Register system service ────────────────────────────────────────────────

echo ""
OS="$(uname)"

if [ "$OS" = "Darwin" ]; then
  # macOS — launchd LaunchAgent
  PLIST_SRC="$INSTALL_DIR/scripts/com.deadletterdiary.plist"
  PLIST_DEST="$HOME/Library/LaunchAgents/com.deadletterdiary.plist"

  echo "Registering launchd service..."

  mkdir -p "$HOME/Library/LaunchAgents"

  # Substitute the install directory placeholder
  sed "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" "$PLIST_SRC" > "$PLIST_DEST"

  # Unload first (idempotent re-installs)
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  launchctl load "$PLIST_DEST"

  echo "Registered launchd service (will auto-start at login)."

elif [ "$OS" = "Linux" ]; then
  # Linux — systemd user unit
  UNIT_SRC="$INSTALL_DIR/scripts/dead-letter-diary.service"
  UNIT_DIR="$HOME/.config/systemd/user"
  UNIT_DEST="$UNIT_DIR/dead-letter-diary.service"

  echo "Registering systemd user service..."

  mkdir -p "$UNIT_DIR"

  # Substitute the install directory placeholder
  sed "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" "$UNIT_SRC" > "$UNIT_DEST"

  systemctl --user daemon-reload
  systemctl --user enable dead-letter-diary

  echo "Registered systemd user service (will auto-start at login)."

else
  echo "System service registration not supported on this OS ($OS). App will not auto-start after reboot."
fi

# ── 6. Open browser ───────────────────────────────────────────────────────────

echo ""
echo "Opening https://localhost in your browser."

if command -v open &>/dev/null; then
  # macOS
  open "https://localhost"
elif command -v xdg-open &>/dev/null; then
  # Linux (X11/Wayland)
  xdg-open "https://localhost"
else
  echo "(Could not detect a browser opener — visit https://localhost manually.)"
fi

# ── 7. Final message ──────────────────────────────────────────────────────────

echo ""
echo "==================================="
echo "Dead Letter Diary is installed."
echo "Open: https://localhost"
echo "First-run setup will guide you through account creation."
echo "==================================="
echo ""
