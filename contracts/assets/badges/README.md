# Score badge images

One image per level. The registry returns the one for the company's live score as the badge's `media`, with the file's SHA-256 as `media_hash`, resolved through the collection's `base_uri`, `https://gateway.pinata.cloud/ipfs` (`contracts/registry/src/lib.rs`, `LEVELS`).

| Level | Score | File | IPFS CID (v1, raw) |
|---|---|---|---|
| New | 0 | `new.svg` | `bafkreiap2kmu3zxsrk4t25jatdvfrcenbw7ntj5oqrx632nutryklwhnqy` |
| Bronze | 1–29 | `bronze.svg` | `bafkreiglwopxqnqypzikkc5rmw5uxxe7abja7crn5onvs3tzkytwfrla64` |
| Silver | 30–99 | `silver.svg` | `bafkreiaidntxqzmph5fvqhbiwvlb3e62tzeenvyvxzk5xdfourtxducbum` |
| Gold | 100+ | `gold.svg` | `bafkreicl6me6dpuiwgkucloac2bez6jxnzqihf74p43eyqynv3lhsuhzte` |

A raw CIDv1 is the file's SHA-256 with a prefix, so it can only ever name these exact bytes. **Changing an image** changes its CID: update `LEVELS`, re-pin, and redeploy the registry.

## Pinning

Upload each file to Pinata with CID version 1. The CID Pinata reports **must** match the table. A different one (for example a `Qm…` CIDv0) means the file was wrapped differently, and wallets would fetch an address nobody serves.

Check each one: `https://gateway.pinata.cloud/ipfs/<cid>` must answer `image/svg+xml`. Avoid `ipfs.io`: it rate-limits and can label SVG as text, which wallets won't draw.
