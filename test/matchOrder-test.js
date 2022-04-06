const { expect } = require("chai");
const { ethers, web3 } = require("hardhat");
const keccak256 = require("keccak256");
const assert = require("assert");
const EIP712 = require("./EIP712");

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



describe("ExchangeV2", function() {

    let nftproxy;
    let erc20proxy;
    let royaltyproxy;
    let exchange;
    let accounts;
    const ZERO = "0x0000000000000000000000000000000000000000";

    // `beforeEach` will run before each test, re-deploying the contract every time
    beforeEach(async function() {
        const TransferProxy = await ethers.getContractFactory("TransferProxy");
        const ERC20TransferProxy = await ethers.getContractFactory("ERC20TransferProxy");
        const RoyaltiesRegistry = await ethers.getContractFactory("RoyaltiesRegistry");
        const protocolFee = 200;

        accounts = await ethers.getSigners();

        nftproxy = await TransferProxy.deploy();
        await nftproxy.__TransferProxy_init()
        erc20proxy = await ERC20TransferProxy.deploy();
        await erc20proxy.__ERC20TransferProxy_init()
        royaltyproxy = await RoyaltiesRegistry.deploy();
        await royaltyproxy.__RoyaltiesRegistry_init()

        const ExchangeV2 = await ethers.getContractFactory("ExchangeV2");
        exchange = await ExchangeV2.deploy();
        await exchange.__ExchangeV2_init(nftproxy.address, erc20proxy.address, protocolFee, accounts[0].address, royaltyproxy.address);

        await nftproxy.addOperator(exchange.address);
        await erc20proxy.addOperator(exchange.address);
    });

    // address1 sends nft to address2
    it("erc721 for eth", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        await erc721.mint(accounts[1].address, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        //console.log("owner", await erc721.owner());
        await royaltyproxy.connect(accounts[1]).setRoyaltiesByToken(erc721.address, [
            [accounts[1].address, 500]
        ]);
        const left = Order(accounts[1].address, Asset(id("ERC721"), enc(erc721.address, 52), 1), ZERO, Asset(id("ETH"), "0x", 10000), 1, 0, 0, "0xffffffff", "0x");
        const right = Order(accounts[2].address, Asset(id("ETH"), "0x", 10000), ZERO, Asset(id("ERC721"), enc(erc721.address, 52), 1), 1, 0, 0, "0xffffffff", "0x");

        let signatureLeft = await sign(left, accounts[1].address, exchange.address);
        let signatureRight = await sign(right, accounts[2].address, exchange.address);

        // console.log(left);
        // console.log(right);
        //console.log(signatureLeft);
        //console.log(signatureRight);

        //NB! from: accounts[7] - who pay for NFT != order Maker
        //console.log(exchange)
        let tx = await exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight, { value: 10200 });
        let receipt = await tx.wait();
        //console.log(receipt.events);
        assert.equal(await erc721.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721.balanceOf(accounts[2].address), 1);
    });

    // address1 sends nft to address2
    it("erc721 for erc20", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        await erc721.mint(accounts[1].address, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        TestERC20 = await ethers.getContractFactory("TestERC20");
        let erc20 = await TestERC20.deploy();
        await erc20.mint(accounts[2].address, 20000);
        await erc20.connect(accounts[2]).approve(erc20proxy.address, 10000000);

        //console.log("owner", await erc721.owner());
        await royaltyproxy.connect(accounts[1]).setRoyaltiesByToken(erc721.address, [
            [accounts[1].address, 500]
        ]);

        const left = Order(accounts[1].address, Asset(id("ERC721"), enc(erc721.address, 52), 1), ZERO, Asset(id("ERC20"), enc(erc20.address), 10000), 1, 0, 0, "0xffffffff", "0x");
        const right = Order(accounts[2].address, Asset(id("ERC20"), enc(erc20.address), 10000), ZERO, Asset(id("ERC721"), enc(erc721.address, 52), 1), 1, 0, 0, "0xffffffff", "0x");

        let signatureLeft = await sign(left, accounts[1].address, exchange.address);
        let signatureRight = await sign(right, accounts[2].address, exchange.address);

        // console.log(left);
        // console.log(right);
        //console.log(signatureLeft);
        //console.log(signatureRight);

        //NB! from: accounts[7] - who pay for NFT != order Maker
        //console.log(exchange)
        let tx = await exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight, { value: 10200 });
        let receipt = await tx.wait();
        //console.log(receipt.events);
        assert.equal(await erc721.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721.balanceOf(accounts[2].address), 1);
    });
});