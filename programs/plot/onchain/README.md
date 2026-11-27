# PLOT program: local integration checkpoint

This is an experimental program with a **test-only program ID**, not a deployed
program. Use a newly controlled program ID and rebuild before any deployment.
The IDL and seed vectors are provisional; the implementation has not received a
security review and local tests are not devnet evidence.

The upgrade authority bootstraps the config. The configured admin creates a
Token-2022 NonTransferable mint, and the payment authority can mint verified
credits. The resolver currently also signs market creation: binding this
operator to an authorized Twitch channel is an off-chain responsibility and
has not been demonstrated here. Treasury and streamer owners and fee rates are
snapshotted on market creation. The program currently has no update-config
instruction. Token-2022 ATAs must already exist; the sponsor should create them
before calling these instructions. For `place_prediction`, `owner` signs the
burn and `payer` signs and pays the position rent. Transaction fee payer is set
by the transaction, not by the program.

Use SHA-256 over the UTF-8 domain `plot:market:v1` followed by the UTF-8
strings `provider`, `channel ID`, `prediction ID`, each prefixed with its byte
length as an unsigned four-byte little-endian integer. For payments use domain
`plot:payment:v1` and fields `provider`, `environment`, `payment ID` in that
order. For an option use domain `plot:outcome:v1` and fields `broadcaster ID`,
`prediction ID`, `outcome ID`; the backend must validate those hashes against
the Market before exposing indices or submitting instructions. These are client conventions: the program accepts 32-byte hashes and
cannot verify their original strings. Use exact provider IDs and environment
names consistently, without implicit Unicode normalization. The sample vectors
in `../idl/seed-vectors.json` can be reproduced by `node tests/vectors.cjs`.
Never reuse a payment hash for another provider, environment or payment.

With Anchor 0.31.1, `cargo-build-sbf` 4.6.0, its platform tools v1.58 and Agave
4.1.2, run from `programs/plot`:

```
anchor build
cargo build-sbf --arch v0 --manifest-path onchain/Cargo.toml
npm ci --prefix tests
node tests/local.cjs
```

The v0 artifact is used by the local Agave validator. The test starts an
isolated validator with temporary keys and ledger, then stops it. Verify the
generated `target/idl/plot.json` matches the committed `idl/plot.json` after
any change. The local test does not cover every required adversarial scenario,
HTTP integration, Android, or devnet deployment.

The local test also sends a resolution without preflight at supply
`u64::MAX - 20`: the first 20-point fee succeeds, the second overflows,
and the failed transaction receipt must contain both Token-2022 mint CPIs.
It checks that the supply, fee accounts and locked market are unchanged.
It then credits exactly 20 to reach `u64::MAX` and verifies that another
credit fails without retaining its receipt. These are local test tokens.
