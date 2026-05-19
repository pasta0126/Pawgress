#!/usr/bin/env bash
# Run this on the Mac Mini to install a native GitHub Actions runner.
# Usage: RUNNER_TOKEN=<token-from-github> bash setup-mac-runner.sh

set -euo pipefail

REPO="pasta0126/Pawgress"
RUNNER_NAME="${RUNNER_NAME:-mini-macos}"
RUNNER_DIR="$HOME/actions-runner"

if [ -z "${RUNNER_TOKEN:-}" ]; then
  echo "ERROR: set RUNNER_TOKEN=<token from GitHub Settings → Actions → Runners>"
  exit 1
fi

# ── 1. Rosetta (needed for x86 tools on Apple Silicon) ──
if [[ $(uname -m) == "arm64" ]]; then
  /usr/sbin/softwareupdate --install-rosetta --agree-to-license 2>/dev/null || true
fi

# ── 2. Homebrew deps ──
if ! command -v brew &>/dev/null; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
brew install node@22 || true

# ── 3. Rust ──
if ! command -v rustup &>/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
source "$HOME/.cargo/env"
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# ── 4. Download runner ──
mkdir -p "$RUNNER_DIR" && cd "$RUNNER_DIR"
RUNNER_VERSION="2.323.0"
curl -fsSL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-osx-arm64-${RUNNER_VERSION}.tar.gz" \
  | tar xz

# ── 5. Configure ──
./config.sh \
  --url "https://github.com/$REPO" \
  --token "$RUNNER_TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "self-hosted,macOS,arm64" \
  --work "_work" \
  --unattended \
  --replace

# ── 6. Install as launchd service (auto-start on login) ──
./svc.sh install
./svc.sh start

echo ""
echo "Runner '$RUNNER_NAME' installed and started."
echo "Check status: cd $RUNNER_DIR && ./svc.sh status"
