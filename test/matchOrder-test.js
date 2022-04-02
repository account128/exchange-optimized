const { expect } = require("chai");
const { ethers, web3 } = require("hardhat");
const keccak256 = require('keccak256');
var assert = require('assert');
const EIP712 = require("./EIP712");

describe("ExchangeV2", function() {
    it("Initialize exchange", async function() {
        const TransferProxy = await ethers.getContractFactory("TransferProxy");
        const ERC20TransferProxy = await ethers.getContractFactory("ERC20TransferProxy");
        const RoyaltiesRegistry = await ethers.getContractFactory("RoyaltiesRegistry");
        const accounts = await ethers.getSigners();
        const ZERO = "0x0000000000000000000000000000000000000000";

        adr0 = accounts[0].address;
        adr1 = accounts[1].address;
        //adr2 = accounts[2].address;

        let nftproxy = await TransferProxy.deploy();
        await nftproxy.__TransferProxy_init()
        let erc20proxy = await ERC20TransferProxy.deploy();
        await erc20proxy.__ERC20TransferProxy_init()
        let royaltyproxy = await RoyaltiesRegistry.deploy();
        await royaltyproxy.__RoyaltiesRegistry_init()

        console.log(nftproxy.address, erc20proxy.address, royaltyproxy.address);

        const ExchangeV2 = await ethers.getContractFactory("ExchangeV2");
        let exchange = await ExchangeV2.deploy();
        await exchange.__ExchangeV2_init(nftproxy.address, erc20proxy.address, 125, adr0, royaltyproxy.address);

        await nftproxy.addOperator(exchange.address);

        TestERC721 = await ethers.getContractFactory("TestERC721");
        erc721 = await TestERC721.deploy();

        //await exchange.setFeeReceiver(erc721.address, adr0);

        await erc721.mint(adr1, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);
        console.log(await erc721.isApprovedForAll(adr1, nftproxy.address));

        console.log("owner", await erc721.owner());
        await royaltyproxy.connect(accounts[1]).setRoyaltiesByToken(erc721.address, [
            [adr1, 500]
        ]);

        function id(str) {
            return `0x${keccak256(str).toString("hex").substring(0, 8)}`;
        }

        function enc(token, tokenId) {
            if (tokenId) {
                return web3.eth.abi.encodeParameters(["address", "uint256"], [token, tokenId]);
            } else {
                return web3.eth.abi.encodeParameter("address", token);
            }
        }

        function AssetType(assetClass, data) {
            return { assetClass, data }
        }

        function Asset(assetClass, assetData, value) {
            return { assetType: AssetType(assetClass, assetData), value };
        }

        function Order(maker, makeAsset, taker, takeAsset, salt, start, end, dataType, data) {
            return { maker, makeAsset, taker, takeAsset, salt, start, end, dataType, data };
        }

        const Types = {
            AssetType: [
                { name: 'assetClass', type: 'bytes4' },
                { name: 'data', type: 'bytes' }
            ],
            Asset: [
                { name: 'assetType', type: 'AssetType' },
                { name: 'value', type: 'uint256' }
            ],
            Order: [
                { name: 'maker', type: 'address' },
                { name: 'makeAsset', type: 'Asset' },
                { name: 'taker', type: 'address' },
                { name: 'takeAsset', type: 'Asset' },
                { name: 'salt', type: 'uint256' },
                { name: 'start', type: 'uint256' },
                { name: 'end', type: 'uint256' },
                { name: 'dataType', type: 'bytes4' },
                { name: 'data', type: 'bytes' },
            ]
        };

        async function sign(order, account, verifyingContract) {
            const chainId = Number(await web3.eth.getChainId());
            const data = EIP712.createTypeData({
                name: "Exchange",
                version: "2",
                chainId,
                verifyingContract
            }, 'Order', order, Types);
            return (await EIP712.signTypedData(web3, account, data)).sig;
        }

        const left = Order(adr1, Asset(id("ERC721"), enc(erc721.address, 52), 1), ZERO, Asset(id("ETH"), "0x", 10000), 1, 0, 0, "0xffffffff", "0x");
        const right = Order(adr0, Asset(id("ETH"), "0x", 10000), ZERO, Asset(id("ERC721"), enc(erc721.address, 52), 1), 1, 0, 0, "0xffffffff", "0x");

        console.log("here");
        let signatureLeft = await sign(left, adr1, exchange.address);
        let signatureRight = await sign(right, adr0, exchange.address);
        console.log("here");

        console.log(left);
        console.log(right);
        //console.log(signatureLeft);
        //console.log(signatureRight);

        //NB! from: accounts[7] - who pay for NFT != order Maker
        //console.log(exchange)
        let tx = await exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight, { value: 10125 });
        let receipt = await tx.wait();
        console.log(receipt.events);
        assert.equal(await erc721.balanceOf(adr1), 0);
        assert.equal(await erc721.balanceOf(adr0), 1);
    });
});