# Checkpoint 19d: Score badge NFT (soulbound)

**You write this one** (or ask Claude to write a step). File: `contracts/registry/src/lib.rs`.

## Goal

Every business gets one NFT that shows its track record: its score, deals and disputes. It has three rules:

| Rule | Why |
|---|---|
| **Can't be moved** (soulbound) | A score you could sell or buy would be worthless |
| **Stores nothing new** | It's read from `Reputation` when asked, so the escrow stays the only writer and the badge is always up to date |
| **Uses the NFT standard** (NEP-171) | Explorers and other NEAR apps can read it without knowing about Bizzy-Fy |

This also lets us enter the `nfts` track ("NFTs That Do Something… carry credentials… dynamic NFTs").

## Understand first

### 1. An NFT is just a set of methods

On NEAR, "being an NFT contract" means answering a few standard methods (like ERC-721's `ownerOf`, `tokenURI`). Nothing says the token has to be stored. Our registry answers them from the `companies` map:

| Standard field | Our value |
|---|---|
| token id | the company account, e.g. `acme.bizzy-fy.testnet` |
| owner | the same company account |
| title | `acme: score 42` |
| media (picture) | the share card the website already makes: `<SITE>/b/acme/opengraph-image` |
| extra | the `Reputation` and score as a JSON string |

One company means one token. There's no minting step and no new storage.

### 2. Soulbound means transfer always fails

The standard needs `nft_transfer` and `nft_transfer_call` to exist. Ours just panic with `"Badges can't be moved"`. Keep `#[payable]` on them, as the standard does, so the panic message is ours and not the SDK's.

### 3. Events: how explorers find tokens

Explorers don't call every contract to find NFTs. They watch the logs for a standard **event** (NEP-297), a log line starting with `EVENT_JSON:`. When a company is created, we log an `nft_mint` event. The standards crate writes the log for you:

```rust
NftMint { owner_id: &company, token_ids: &[company.as_str()], memo: None }.emit();
```

Companies created before this change never logged one, so add a one-time, owner-only `emit_badges` that logs it for a page of existing companies.

### 4. Redeploying keeps the data

We add **methods only**, no fields in `Contract` or `Company`. The saved state then reads the same as before, so `make redeploy-registry` works with no migration. If you add a state field, the redeploy breaks the live registry, so don't.

### 5. Use the standards crate's types

Add `near-contract-standards = "5.29"` (same version as `near-sdk`) to the registry's `[dependencies]`. Use its `Token`, `TokenMetadata`, `NFTContractMetadata`, `NFT_METADATA_SPEC` and `events::NftMint` instead of writing your own. They're already in the exact JSON shape wallets expect. `TokenMetadata` has `Default`, so set only the fields you need and finish with `..Default::default()`.

## Write

### New constant

```rust
/// The website, for each badge's picture.
const SITE: &str = "https://<your-vercel-address>";
```

Use the Vercel address once you have it. Changing it later is only a redeploy.

### Helper (private, in section 5)

`badge(&self, id: &AccountId) -> Option<Token>`: `None` if the company doesn't exist. Otherwise a `Token` with:
- `token_id` and `owner_id` = `id`
- `title`: `"<name>: score <n>"`, where `<name>` is the part before the first `.`
- `description`: `"<n> deals paid, <c> businesses, <d> disputes lost. Written only by the Bizzy-Fy escrow."`
- `media`: `format!("{SITE}/b/{name}/opengraph-image")`
- `issued_at`: `created_at` in **milliseconds**, as a string (`created_at` is stored in nanoseconds, so divide by 1,000,000)
- `extra`: `json!({ "score": .., "reputation": .. }).to_string()`
- `approved_account_ids`: `Some(HashMap::new())`, since nobody can be approved

Reuse `get_score` for the score.

### Methods

| Method | Who | Rules |
|---|---|---|
| `nft_metadata() -> NFTContractMetadata` | view | `spec: NFT_METADATA_SPEC`, `name: "Bizzy-Fy Track Record"`, `symbol: "BIZZY"`, the rest `None` |
| `nft_token(token_id: String) -> Option<Token>` | view | Parse `token_id` as `AccountId`. If that fails return `None` (don't panic), else `badge` |
| `nft_tokens(from_index: Option<U128>, limit: Option<u64>) -> Vec<Token>` | view | A page of `companies`, like `get_companies`. Defaults: 0 and 50 |
| `nft_tokens_for_owner(account_id, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token>` | view | `badge(account_id)` as a list of 0 or 1 tokens |
| `nft_total_supply() -> U128` | view | `companies.len()` |
| `nft_supply_for_owner(account_id) -> U128` | view | 1 if a company, else 0 |
| `nft_transfer(receiver_id, token_id, approval_id: Option<u64>, memo: Option<String>)` | anyone | `#[payable]`, panics `"Badges can't be moved"` |
| `nft_transfer_call(receiver_id, token_id, approval_id: Option<u64>, memo: Option<String>, msg: String) -> bool` | anyone | Same panic |
| `emit_badges(from_index: u32, limit: u32)` | owner | `"Only the owner can do this"`. Logs `nft_mint` for that page of companies. Run it once after the redeploy |

### Change to `on_company_created`

On success, after the insert, emit `nft_mint` for the new company. Emit nothing on failure.

### Good to know

- **No `media_hash`.** The standard asks for one when `media` is set, but our picture changes with the score, so a fixed hash would always be wrong. Explorers still show the picture. The README says this.
- **No approvals** (NEP-178). Nothing can be approved on a token that can't move.
- **Privacy:** everything in the badge is already public in `get_company`. The badge adds nothing new.
- **No sandbox test:** there are no Promises here. Unit tests can read the logs with `near_sdk::test_utils::get_logs()`.

## Your unit tests

Keep 1–26. Add:

| # | Test | Expect |
|---|---|---|
| 27 | `nft_token` for a company with 1 on-time deal | owner is the company, title `"acme: score 13"`, media ends `/b/acme/opengraph-image` |
| 28 | `nft_token` for an unknown account, and for `"not an account!"` | both `None`, no panic |
| 29 | `nft_transfer` | panics "Badges can't be moved" |
| 30 | `nft_transfer_call` | panics "Badges can't be moved" |
| 31 | supply: 3 companies | `nft_total_supply` 3; `nft_supply_for_owner` 1 for a company, 0 for a stranger |
| 32 | `nft_tokens_for_owner` | 1 token for a company, empty for a stranger |
| 33 | callback success | `get_logs()` has one line starting `EVENT_JSON:` containing `"nft_mint"` |
| 34 | callback failure | no logs |
| 35 | stranger calls `emit_badges` | panics "Only the owner can do this" |
| 36 | badge follows the score | record a lost dispute; the title now says `score 0` |
| 37 | owner calls `emit_badges` for 2 companies | one log line naming both |

## Step 5: level pictures on IPFS (added after the first deploy)

NearBlocks didn't show the share-card picture, so each badge now shows one of 4 fixed pictures, pinned on IPFS through Pinata. The contract picks the picture from the live score, so the badge still changes as the score grows.

| Level | Score |
|---|---|
| New | 0 |
| Bronze | 1–29 |
| Silver | 30–99 |
| Gold | 100+ |

This is the same approach as herit-near's credential images:
- **The files.** The 4 SVGs are in `contracts/assets/badges/`, about 1 KB each.
- **Their CIDs.** A raw CIDv1 is just the file's SHA-256 with a prefix, so each CID was worked out from the file before any upload. The table is in that folder's README.
- **No `media_hash` gap.** The pictures never change, so each badge can carry a `media_hash`, as the standard asks.

**Pin (you, once).** Upload the 4 SVGs to your Pinata account with CID version 1. Each CID Pinata shows must match the README table.

**Write.**
- Add the gateway and the table:
  ```rust
  /// Where wallets fetch `media` from (NEP-177: `base_uri` + "/" + `media`).
  const IPFS_GATEWAY: &str = "https://gateway.pinata.cloud/ipfs";
  /// Badge images on IPFS: (lowest score, CID, SHA-256 of the file), lowest level first.
  const LEVELS: [(u32, &str, [u8; 32]); 4] = [
      (0, "bafkreiap2kmu3zxsrk4t25jatdvfrcenbw7ntj5oqrx632nutryklwhnqy", [15, 210, 153, 77, 230, 242, 138, 185, 61, 117, 32, 152, 234, 88, 136, 141, 13, 190, 217, 167, 174, 132, 111, 237, 233, 180, 156, 112, 165, 216, 237, 134]),
      (1, "bafkreiglwopxqnqypzikkc5rmw5uxxe7abja7crn5onvs3tzkytwfrla64", [203, 179, 159, 120, 54, 24, 126, 80, 165, 11, 177, 101, 187, 75, 220, 159, 0, 82, 15, 138, 45, 235, 155, 89, 110, 121, 86, 39, 98, 197, 96, 247]),
      (30, "bafkreiaidntxqzmph5fvqhbiwvlb3e62tzeenvyvxzk5xdfourtxducbum", [8, 27, 103, 120, 101, 143, 63, 75, 88, 28, 40, 181, 86, 29, 147, 218, 158, 72, 70, 215, 21, 190, 85, 219, 140, 174, 164, 103, 113, 208, 65, 163]),
      (100, "bafkreicl6me6dpuiwgkucloac2bez6jxnzqihf74p43eyqynv3lhsuhzte", [75, 243, 9, 225, 190, 136, 177, 149, 65, 45, 192, 22, 130, 76, 249, 55, 110, 96, 131, 151, 252, 127, 54, 76, 67, 13, 174, 214, 121, 80, 249, 153]),
  ];
  ```
- In `nft_metadata`, set `base_uri: Some(IPFS_GATEWAY.into())`.
- In `badge`, pick the highest level the score reaches: `LEVELS.iter().rev().find(|(min, _, _)| score >= *min)`. New starts at 0, so one is always found.
- Set `media: Some(cid.to_string())` (just the CID; wallets add `base_uri`) and `media_hash: Some(Base64VecU8(hash.to_vec()))`.
- `SITE` is no longer used, so remove it.
- Update test 27: at score 13, `media` is Bronze's CID and `media_hash` is `Some`. Add test 38: score 0 gives New's CID and score 36 gives Silver's. Add test 39: `nft_metadata().base_uri` is the gateway. Add test 40: each hash in `LEVELS` is the SHA-256 of its file (`include_bytes!`).

## Check

From `contracts/`:

```bash
cargo test -p registry
cargo clippy -p registry --tests -- -D warnings
cargo fmt --check
make redeploy-registry
```

Then call `emit_badges` once, signed by the owner, with `{"from_index":0,"limit":100}`.

## Claude's part, after your redeploy

- Check `near contract call-function as-read-only bizzy-fy.testnet nft_tokens_for_owner` for a demo company, and that the badge shows on the explorer.
- Check that `/b/<name>/opengraph-image` loads as a plain image link in Next 16.
- Profile page: an "On-chain badge, can't be sold" line that links to the token on the explorer.
- FAQ and README: what the badge is and why it can't move. Add `nfts` to the submission tracks.

## Verified at the stop

1. No new fields in `Contract` or `Company`, so the redeploy kept every company.
2. Both transfer methods always panic. There's no other way to change an owner.
3. Every badge value comes from `Reputation`, which only the escrow writes.
4. `nft_mint` is logged only after a company is really created, and for old companies once through `emit_badges`.
5. All tests pass; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
