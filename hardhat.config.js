require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async(taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        compilers: [{
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },

            },
            {
                version: "0.8.2", // for erc721
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: "0.4.19", // for weth
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 800,
                    },
                },
            }
        ],
    },
    networks: {
        rinkeby: {
            url: process.env.INFURA_URL || "",
            accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY, process.env.PRIVATE_KEY2] : [],
        },
    },
    gasReporter: {
        currency: 'USD',
        gasPrice: 30,
        showTimeSpent: true,
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
};

require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-web3");