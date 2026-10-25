#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/agave
validator_bin="data/agave/solana-release/bin/solana-test-validator"
if [[ ! -x "$validator_bin" ]]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) target=aarch64-apple-darwin ;;
    Linux-x86_64) target=x86_64-unknown-linux-gnu ;;
    *) echo 'Unsupported platform: set up Agave 4.4.0-beta.1 locally.'; exit 1 ;;
  esac
  curl --fail --location --retry 2 --max-time 180 \
    "https://github.com/anza-xyz/agave/releases/download/v4.4.0-beta.1/solana-release-${target}.tar.bz2" \
    --output data/agave/release.tar.bz2
  tar -xjf data/agave/release.tar.bz2 -C data/agave
fi
"$validator_bin" --version
# Protocol services use fixed ports; the web dashboard uses Portless.
exec "$validator_bin" --ledger data/ledger --url devnet --clone-feature-set \
  --clone-upgradeable-program HhUzN7VvonNUevATyugZUepzxpeEZMXQbV92X2xvsp5m \
  --clone-upgradeable-program HYHdyy7QZg8Ucky9Z97xNtSCvrZxVNkeoney8xEPXjiZ \
  --clone-upgradeable-program 4h3Dqyo5qmteJoMxXt3tdtfXELDB6pdRTPU9mWruiKp1 \
  --clone-upgradeable-program 7QcQDANJVC17Jgc6KjjeagSkm2zAphgHVPK5agJzyihB \
  --clone A9DojSvj32PMTTGctEcWZu9GSKuQVEhPkBXxDxmYu34o \
  --rpc-port 8899 --bind-address 127.0.0.1 --quiet
