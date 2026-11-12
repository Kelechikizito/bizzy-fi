# Testnet only. Override the signer if needed: make deploy KEYCHAIN=sign-with-legacy-keychain
REGISTRY := bizzy-fy.testnet
ESCROW   := escrow.$(REGISTRY)
ATTESTER := bizzy-fy-attester.testnet
NET      := network-config testnet
KEYCHAIN ?= sign-with-keychain
SIGN     := $(NET) $(KEYCHAIN) send
POLICY   := target/near/policy/policy.wasm
UPLOADED := target/near/policy.hash

.PHONY: help build test accounts deploy redeploy-registry upload-policy set-hash abis hash check

help: ## List the commands
	@grep -E '^[a-z-]+:.*##' Makefile | sed 's/:.*## /\t/'

build: ## Build all three contracts
	@for c in registry escrow policy; do (cd $$c && cargo near build non-reproducible-wasm) || exit 1; done

test: ## Run all tests and clippy (about 4 minutes)
	cargo test --workspace
	cargo clippy --workspace --all-targets -- -D warnings

accounts: ## Create the escrow and attester accounts
	near account create-account fund-myself $(ESCROW) '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as $(REGISTRY) $(SIGN)
	near account create-account sponsor-by-faucet-service $(ATTESTER) autogenerate-new-keypair save-to-keychain $(NET) create

deploy: build ## First deploy of the registry and escrow (only works once)
	near contract deploy $(REGISTRY) use-file target/near/registry/registry.wasm with-init-call new json-args '{"owner":"$(REGISTRY)","escrow":"$(ESCROW)","attester":"$(ATTESTER)"}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' $(SIGN)
	near contract deploy $(ESCROW) use-file target/near/escrow/escrow.wasm with-init-call new json-args '{"registry":"$(REGISTRY)"}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' $(SIGN)

redeploy-registry: build ## Update the live registry code (state is kept)
	near contract deploy $(REGISTRY) use-file target/near/registry/registry.wasm without-init-call $(SIGN)

upload-policy: build ## Upload the shared policy code (BURNS about 20 NEAR)
	@printf 'This burns about 20 NEAR. Type burn to continue: '; read ok; [ "$$ok" = burn ] || { echo Cancelled.; exit 1; }
	near contract deploy-as-global use-file $(POLICY) as-global-hash $(REGISTRY) $(SIGN)
	python3 ../scripts/wasm-hash.py $(POLICY) > $(UPLOADED)

set-hash: ## Tell the registry to use the uploaded policy code
	@test -f $(UPLOADED) || { echo 'Run make upload-policy first.'; exit 1; }
	near contract call-function as-transaction $(REGISTRY) set_policy_hash json-args "{\"hash\":\"$$(cat $(UPLOADED))\"}" prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as $(REGISTRY) $(SIGN)

abis: ## Copy the built ABIs to the frontend (run after any contract change)
	@mkdir -p ../frontend/lib/near/abi
	@for c in registry escrow policy; do cp target/near/$$c/$${c}_abi.json ../frontend/lib/near/abi/$$c.json; done

hash: ## Print the hash of the uploaded policy code
	@cat $(UPLOADED)

check: ## Confirm the contracts are live and list companies
	near contract inspect $(REGISTRY) $(NET) now
	near contract inspect $(ESCROW) $(NET) now
	near contract call-function as-read-only $(REGISTRY) get_companies json-args '{"from_index":0,"limit":10}' $(NET) now
