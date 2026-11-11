// Where the Bizzy-Fy contracts live on NEAR. ABIs are in ./abi (refresh with `make abis`).

export const NETWORK = "testnet";
/** On mainnet every business must pass Selfie Check before its agent turns on; on testnet it's optional. */
export const HUMAN_REQUIRED = (NETWORK as string) === "mainnet";
export const RPC_URL = "https://rpc.testnet.fastnear.com";
export const EXPLORER_URL = "https://testnet.nearblocks.io";

export const REGISTRY_ID = "bizzy-fy.testnet";
export const ESCROW_ID = "escrow.bizzy-fy.testnet";
export const ATTESTER_ID = "bizzy-fy-attester.testnet";

/** The shared policy code every new company runs. */
export const POLICY_CODE_HASH = "Ah9j86UuAV6fqyP1yzPVKSw8SWDGgaDpkTwiuxbvfvx6";

/** Each company's policy contract lives on its own account. */
export const companyId = (name: string) => `${name}.${REGISTRY_ID}`;

export const txUrl = (hash: string) => `${EXPLORER_URL}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER_URL}/address/${id}`;

/** How long the buyer can review a delivery, and how long a dispute can run (matches the escrow). */
export const REVIEW_WINDOW_MS = 60 * 60 * 1000;
export const DISPUTE_WINDOW_MS = 60 * 60 * 1000;
