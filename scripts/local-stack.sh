#!/usr/bin/env bash
# Starts a local MagicBlock stack (base validator :8899, ER :7799, VRF oracle) with the
# samrajya program preloaded. Ctrl-C stops everything.
# The committor program (buffer commits for accounts > ~1 KB, like Game) is cloned from devnet.
# Needs: npm install -g @magicblock-labs/ephemeral-validator   (provides mb-stack + vrf-oracle)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f target/deploy/samrajya.so ] || anchor build
WALLET_PUBKEY=$(solana-keygen pubkey "$HOME/.config/solana/id.json")
mkdir -p .local-stack && cd .local-stack
rm -rf ./magicblock-test-storage
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT
RUST_LOG=warn mb-stack --reset \
  --account mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev "$ROOT/scripts/mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev.json" \
  --upgradeable-program "$ROOT/target/deploy/samrajya-keypair.json" "$ROOT/target/deploy/samrajya.so" "$WALLET_PUBKEY" \
  --gossip-port "${GOSSIP_PORT:-8020}" \
  --clone-upgradeable-program CoMtrr6j336NSB5PAoAWpLe5hPgkcShWKbPgHhZxaxh --url devnet \
  > mb-stack.log 2>&1 < /dev/null &
echo "waiting for mb-stack (log: .local-stack/mb-stack.log)..."
for _ in $(seq 1 180); do
  grep -q "MagicBlock stack is ready" mb-stack.log 2>/dev/null && break
  sleep 1
done
grep -q "MagicBlock stack is ready" mb-stack.log || { tail -50 mb-stack.log; exit 1; }
solana airdrop 100 "$WALLET_PUBKEY" --url http://localhost:8899 >/dev/null || true
VRF_ORACLE_SKIP_PREFLIGHT=true RPC_URL=http://localhost:8899 WEBSOCKET_URL=ws://localhost:8900 \
  RUST_LOG=warn vrf-oracle > vrf-oracle.log 2>&1 < /dev/null &
# A second oracle serves the ER queue (VRF requests made inside the rollup).
VRF_ORACLE_SKIP_PREFLIGHT=true RPC_URL=http://localhost:7799 WEBSOCKET_URL=ws://localhost:7800 VRF_ORACLE_HTTP_PORT=9091 \
  RUST_LOG=warn vrf-oracle > vrf-oracle-er.log 2>&1 < /dev/null &
echo "stack ready: base http://localhost:8899  ER http://localhost:7799  (vrf-oracle running)"
wait
