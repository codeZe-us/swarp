cargo build --release --target wasm32v1-none -p zendswap-pool-multi
stellar contract deploy --wasm target/wasm32v1-none/release/zendswap_pool_multi.wasm --network testnet --source-account admin
