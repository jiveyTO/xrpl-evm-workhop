const xrpl = require("xrpl");
const { decodeAccountID, encodeAccountID } = require("ripple-address-codec");
const ethersWallet = require("@ethersproject/wallet");
const ethersProvider = require("@ethersproject/providers");
const { BridgeDoorNative__factory } = require("@peersyst/xrp-evm-contracts");
const ethers = require("ethers");

async function main() {

  // Use your EVM wallet from Metamask
  // Copy the private key and paste here
  // Or you can get a private key by uncommenting the next line
  // const pk = ethersWallet.Wallet.createRandom();
  const ethersClient = new ethersProvider.JsonRpcProvider("https://rpc-evm-sidechain.xrpl.org");
  const evmWallet = new ethersWallet.Wallet(
    "0x" + "<your private key from Metamask or insert pk variable>",
    ethersClient
  );

  // Verify you have the right EVM wallet address
  console.log("EVM Address:");
  console.log(evmWallet.address);
  
  // -----------
  
  // Retreive the bridge data
  const lockingClient = new xrpl.Client(
    'wss://sidechain-net1.devnet.rippletest.net:51233',
  ) 
  
  await lockingClient.connect()
  const lockingChainDoor = 'rEAjhZHotzo2jqPbjFpAEacgwc5XoUppgo'

  const accountObjectsRequest = {
    command: 'account_objects',
    account: lockingChainDoor,
    type: 'bridge',
  }

  const bridgeData = await lockingClient.request(accountObjectsRequest)
  const bridge = bridgeData.result.account_objects[0].XChainBridge
  const bridgeDataSignatureReward = bridgeData.result.account_objects[0].SignatureReward
  const bridgeDataMin = bridgeData.result.account_objects[0].MinAccountCreateAmount
  console.log("Bridge signature reweard:")
  console.log(bridgeDataSignatureReward)
  console.log("Bridge account min:")
  console.log(bridgeDataMin)  
  console.log("Bridge data:")
  console.log(bridge)   
  
  // lockingClient.disconnect()
  
  // -----------  

  // Get an XRPL devnet wallet
  const wallet1 = await lockingClient.fundWallet()
  // const wallet1 = xrpl.Wallet.fromSeed("<XRPL devent seed>") 
  // Note your address here: <XRPL devnet address>
  // View it on the explorer: 
  // https://custom.xrpl.org/sidechain-net1.devnet.rippletest.net/accounts/<XRPL devnet address>

  console.log("Wallet1:")
  console.log(wallet1) 
  
  // -----------  
  
  // Convert XRPL address to EVM address
  const xrplAccountToEvmAddress = (account) => {
    const accountId = decodeAccountID(account);
    return `0x${accountId.toString("hex")}`;
  };  

  // Convert EVM address to XRPL address
  const evmAddressToXrplAccount = (address) => {
    const accountId = Buffer.from(address.slice(2), "hex")
    return encodeAccountID(accountId)
  };  

  console.log("EVM address representation: " + evmAddressToXrplAccount(evmWallet.address))  
  
  // -----------    

  // Create Wallet2 on the issuing chain
  const fundTx = {
    TransactionType: 'XChainAccountCreateCommit',
    Account: wallet1.classicAddress,
    XChainBridge: bridge,
    SignatureReward: bridgeDataSignatureReward,
    Destination: evmAddressToXrplAccount(evmWallet.address),
    Amount: (
      parseInt(bridgeDataMin, 10) * 2
    ).toString(),
  }  

  const fundResponse = await lockingClient.submitAndWait(fundTx, {
    wallet: wallet1,
  })
  console.log("Tx XChainAccountCreateCommit:")
  console.log(fundResponse)  
  
  // ---------

  // Interacting with the EVM for the claimID
  const bridgeAddress = "0x0FCCFB556B4aA1B44F31220AcDC8007D46514f31";
  const bridgeContract = BridgeDoorNative__factory.connect(bridgeAddress, ethersClient);  

  const contractTransaction = await bridgeContract.connect(evmWallet).createClaimId(xrplAccountToEvmAddress(wallet1.address), {
      value: ethers.utils.parseEther(xrpl.dropsToXrp(bridgeDataSignatureReward)),
      gasLimit: 140_000,
  });
  const transaction = await contractTransaction.wait();
  const event = transaction.events?.find((event) => event.event === "CreateClaim");
  const [claimID] = event?.args || [];
  const claimIDNumber = claimID.toNumber();

  console.log(`Claim ID for the transfer: ${claimIDNumber}`)    
  
  // ---------  

  // XChainCommit
  console.log('Step 2: Locking the funds on the locking chain...')

  const commitTx = {
    TransactionType: 'XChainCommit',
    Account: wallet1.classicAddress,
    Amount: xrpl.xrpToDrops(5),
    XChainBridge: bridge,
    XChainClaimID: claimIDNumber,
    OtherChainDestination: evmAddressToXrplAccount(evmWallet.address),
  }

  const commitResult = await lockingClient.submitAndWait(commitTx, {
    wallet: wallet1,
  })

  console.log("Commit result")
  console.log(commitResult)   
  
  lockingClient.disconnect()

}

main();
