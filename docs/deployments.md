# Testnet deployments

Everything here is on NEAR **testnet**. The frontend reads these values from `frontend/lib/near/contracts.ts`, and the ABIs are in `frontend/lib/near/abi/`. After any contract change, run `make abis` from `contracts/`.

## Contracts

| What | Account | Code hash |
|---|---|---|
| Registry | [`bizzy-fy.testnet`](https://explorer.testnet.near.org/accounts/bizzy-fy.testnet) | `7u3Ay13nVZwR1xioyx1xtwxMhtYJSFSggWxNQYgLN4m4` |
| Escrow | [`escrow.bizzy-fy.testnet`](https://explorer.testnet.near.org/accounts/escrow.bizzy-fy.testnet) | `GQf9iw2YTLDEj3zg4CYU1dMuyi8peLwmSLKEQdDGrjrD` |
| Shared policy code | Stored by hash, used by each `<company>.bizzy-fy.testnet` | `Ah9j86UuAV6fqyP1yzPVKSw8SWDGgaDpkTwiuxbvfvx6` |
| Attester (no contract) | [`bizzy-fy-attester.testnet`](https://explorer.testnet.near.org/accounts/bizzy-fy-attester.testnet) | none |

## Transactions

| Step | Transaction |
|---|---|
| Create the escrow account | [`8RV6aUF9…`](https://explorer.testnet.near.org/transactions/8RV6aUF9wJmqrGxrKt4wkV93Jg8iryLMnHmSMumjd8R9) |
| Create the attester account | [`EfWfro5g…`](https://explorer.testnet.near.org/transactions/EfWfro5gq2ZiPkRp5cTXJScSjpry8fbfbwQLnK9DWPMS) |
| Deploy the registry | [`4r6MGRCs…`](https://explorer.testnet.near.org/transactions/4r6MGRCskVB4qSsRzMrYA6Az7EGPerTYgZaS142QXVM4) |
| Deploy the escrow | [`Fh4zn5XG…`](https://explorer.testnet.near.org/transactions/Fh4zn5XGGoJdUGtK674Ur73eD7q49zG9qGajb9CYZZrb) |
| Upload the shared policy code | [`8AZAAqru…`](https://explorer.testnet.near.org/transactions/8AZAAqruYn2o2pxYQSwU3pnwkMqLLSiebZzeLZF5wMfe) |
| Set the policy hash on the registry | [`HpkPKpGY…`](https://explorer.testnet.near.org/transactions/HpkPKpGYr94uSC2mB1PmdoyiB3y1uXnTHKnFtZtywf54) |

## Demo companies and first deal

Two companies made by `scripts/seed-demo.ts`, and one real deal run by their agents.

| Company | Guardian |
|---|---|
| [`cafe.bizzy-fy.testnet`](https://explorer.testnet.near.org/accounts/cafe.bizzy-fy.testnet) | `bizzy-cafe-45f44e.testnet` |
| [`cups.bizzy-fy.testnet`](https://explorer.testnet.near.org/accounts/cups.bizzy-fy.testnet) | `bizzy-cups-8b2930.testnet` |

| Step | Transaction |
|---|---|
| Create cafe | [`FqA1ysge…`](https://explorer.testnet.near.org/transactions/FqA1ysgegjEwyDtTKnJmm4EBa8Ru7HtADcRg2mgP4i3V) |
| Give cafe its agent key | [`HRHPqYUN…`](https://explorer.testnet.near.org/transactions/HRHPqYUN2kmE7Px8F4yd5UfNLwatJDSCydrqMTo8x5BB) |
| Create cups | [`VKxtUzhD…`](https://explorer.testnet.near.org/transactions/VKxtUzhDCXvC5mdjrbwh6K9D6CDeALm9Hk4ZC63YL4M) |
| Give cups its agent key | [`3fiGTSjo…`](https://explorer.testnet.near.org/transactions/3fiGTSjoh31shHUb6dYHqFRkjjJhAoFRhhJ1cEhGMUtK) |
| Cafe's agent locks 1 NEAR | [`AGm7HAG7…`](https://explorer.testnet.near.org/transactions/AGm7HAG7fCTh7JC7UHbeWV48J8MLru5fbFGHGTEzuAeD) |
| Cups' agent accepts the same terms | [`7nCJm3TL…`](https://explorer.testnet.near.org/transactions/7nCJm3TLh1pb8Y8ZxuU7XkZCoFShkwQGGQno9XQ5QnFY) |
| Cups' agent marks delivery | [`3Bdv3cgn…`](https://explorer.testnet.near.org/transactions/3Bdv3cgnJFzKzUfeVkm2btpX6KaRKYtAVycSmz5uz3h9) |
| Cafe's agent confirms; cups is paid | [`Bzbd2W63…`](https://explorer.testnet.near.org/transactions/Bzbd2W63ZFBhkqqzxPp4Ko45RJp9rHrvzFe2b7EyW4hW) |

## Keys

The registry and escrow accounts still have full-access keys, so we can redeploy while building. Whoever holds the escrow key could take the money in open deals. That's fine on testnet, but those keys must be deleted before real money is used. Company accounts have no full-access key.
