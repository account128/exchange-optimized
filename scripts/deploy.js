// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
    // Hardhat always runs the compile task when running scripts with its command
    // line interface.
    //
    // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    // await hre.run('compile');

    // We get the contract to deploy

    const accounts = await ethers.getSigners();
    console.log("deploying contracts with address", accounts[0].address)

    const TransferProxy = await ethers.getContractFactory("TransferProxy");
    const ERC20TransferProxy = await ethers.getContractFactory("ERC20TransferProxy");
    let erc20proxy = await TransferProxy.deploy();
    let nftproxy = await ERC20TransferProxy.deploy();

    const ExchangeV2 = await ethers.getContractFactory("ExchangeV2");
    let exchange = await ExchangeV2.deploy();
    await exchange.__ExchangeV2_init(nftproxy.address, erc20proxy.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});