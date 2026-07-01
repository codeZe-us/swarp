$env:POOL_CONTRACT_ID = "CAO2OPSCOQFJA6LMUHRGD7O3WEKQETJ6EK4ZSNNTZVU5LFTVSOFMLAL3"
$env:VERIFIER_CONTRACT_ID = "CAEYYFIAFL5OULFSVXGBRLW2BKX5WDV46U3TOSAX76KHCENO25W6QNU7"
$env:POOL_OPERATOR_ADDRESS = "GAX3TLY6BIEKFWP2C6XUXYV3YCYCMEGOSZXYW3NIZ6AODJ4DCL2K2HFO"
$env:USDC_SAC_ID = "CDTGDHE3GHSNIYMRHBN7PMSGXXR73KHZ4KS2ZEBAIDOS6THPOLMHL5LG"
$env:EURC_SAC_ID = "CD6KJAOC4OQ2LQC4WQZHUFW2SMINOPC6SXUOCKN5UAX2KHVBSXUXQIDG"
$env:MGUSD_SAC_ID = "CDBCJY4HHU3DITQ5BSX6IQXMJNIJPULJQWQGFMILKOUQQDWQXZTDTJRF"
$env:YLDS_SAC_ID = "CBXFWAQCFKEM7MFSGF2MJU5UGB2RYUM4QVPIZQ2EG42BRDEKBIJXRBDB"
$env:XLM_SAC_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

$assetsJson = "[\`"$env:USDC_SAC_ID\`", \`"$env:EURC_SAC_ID\`", \`"$env:MGUSD_SAC_ID\`", \`"$env:YLDS_SAC_ID\`", \`"$env:XLM_SAC_ID\`"]"

Write-Host "Initializing Pool..."
.\stellar.exe contract invoke --id $env:POOL_CONTRACT_ID --source-account admin --network testnet -- initialize --admin admin --assets $assetsJson --verifier $env:VERIFIER_CONTRACT_ID --default_rate_numerator 9200000 --default_rate_denominator 10000000

Write-Host "Setting pairwise rates..."

function Set-Rate {
    param([int]$inId, [int]$outId, [long]$num)
    Write-Host "Setting $inId -> $outId to $num"
    .\stellar.exe contract invoke --id $env:POOL_CONTRACT_ID --source-account admin --network testnet -- set_rate --admin admin --asset_in_id $inId --asset_out_id $outId --new_rate $num --new_denominator 10000000
}

# USDC = 0, EURC = 1, MGUSD = 2, YLDS = 3, XLM = 4
Set-Rate 0 1 9200000
Set-Rate 1 0 10869565
Set-Rate 0 2 10000000
Set-Rate 2 0 10000000
Set-Rate 0 3 9500000
Set-Rate 3 0 10526315
Set-Rate 0 4 12500000
Set-Rate 4 0 800000

Write-Host "Rates set successfully!"
