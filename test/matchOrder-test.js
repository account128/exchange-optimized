const { expect } = require("chai");
const { ethers, web3 } = require("hardhat");
const keccak256 = require("keccak256");
const assert = require("assert");
const EIP712 = require("./EIP712");
const Weth = require('weth');

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

function OrderBatch(maker, makeAssets, taker, takeAssets, salt, start, end, dataType, data) {
    return { maker, makeAssets, taker, takeAssets, salt, start, end, dataType, data };
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
    ],
    OrderBatch: [
        { name: 'maker', type: 'address' },
        { name: 'makeAssets', type: 'Asset[]' },
        { name: 'taker', type: 'address' },
        { name: 'takeAssets', type: 'Asset[]' },
        { name: 'salt', type: 'uint256' },
        { name: 'start', type: 'uint256' },
        { name: 'end', type: 'uint256' },
        { name: 'dataType', type: 'bytes4' },
        { name: 'data', type: 'bytes' },
    ],
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

async function signBatch(order, account, verifyingContract) {
    const chainId = Number(await web3.eth.getChainId());
    const data = EIP712.createTypeData({
        name: "Exchange",
        version: "2",
        chainId,
        verifyingContract
    }, 'OrderBatch', order, Types);
    return (await EIP712.signTypedData(web3, account, data)).sig;
}



describe("ExchangeV2", function() {

    let nftproxy;
    let erc20proxy;
    let exchange;
    let accounts;
    let transferManagerTest;
    const ZERO = "0x0000000000000000000000000000000000000000";
    const UINT256_MAX = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const PROTOCOL_FEE = 0.04 // 2% on both sides
    const ROYALTY = 0.05 // 5%

    // `beforeEach` will run before each test, re-deploying the contract every time
    beforeEach(async function() {
        const TransferProxy = await ethers.getContractFactory("TransferProxy");
        const ERC20TransferProxy = await ethers.getContractFactory("ERC20TransferProxy");
        const protocolFee = 200;

        accounts = await ethers.getSigners();

        nftproxy = await TransferProxy.deploy();
        await nftproxy.__TransferProxy_init()
        erc20proxy = await ERC20TransferProxy.deploy();
        await erc20proxy.__ERC20TransferProxy_init()

        const ExchangeV2 = await ethers.getContractFactory("ExchangeV2");
        exchange = await ExchangeV2.deploy();
        await exchange.__ExchangeV2_init(nftproxy.address, erc20proxy.address);

        await nftproxy.addOperator(exchange.address);
        await erc20proxy.addOperator(exchange.address);

        const RaribleTransferManagerTest = await ethers.getContractFactory("RaribleTransferManagerTest");
        transferManagerTest = await RaribleTransferManagerTest.deploy();
    });

    function encDataV2(tuple) {
        return transferManagerTest.encodeV2(tuple);
    }

    // address1 sends nft to address2
    it("erc721 for eth", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        await erc721.mint(accounts[1].address, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const amount = 10000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);


        let makeAsset = Asset(id("ERC721"), enc(erc721.address, 52), 1);
        let takeAsset = Asset(id("ETH"), "0x", amount);
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = Order(accounts[1].address, makeAsset, ZERO, takeAsset, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = Order(accounts[2].address, takeAsset, ZERO, makeAsset, saltRight, 0, 0, id("V2"), encDataRight);

        let signatureLeft = await sign(left, accounts[1].address, exchange.address);
        let signatureRight = await sign(right, accounts[2].address, exchange.address);

        let tx = await exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight, { value: amount });
        let receipt = await tx.wait();

        assert.equal(await erc721.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721.balanceOf(accounts[2].address), 1);
    });

    // address1 sends nft to address2
    it("erc721 for eth - take less than make", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        await erc721.mint(accounts[1].address, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const amount = 10000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);


        let makeAssetLeft = Asset(id("ERC721"), enc(erc721.address, 52), 1);
        let takeAssetLeft = Asset(id("ETH"), "0x", 5000); // min order would take is 500 but would get 1000
        let makeAssetRight = Asset(id("ETH"), "0x", 10000);
        let takeAssetRight = Asset(id("ERC721"), enc(erc721.address, 52), 1);
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = Order(accounts[1].address, makeAssetLeft, ZERO, takeAssetLeft, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = Order(accounts[2].address, makeAssetRight, ZERO, takeAssetRight, saltRight, 0, 0, id("V2"), encDataRight);

        let signatureLeft = await sign(left, accounts[1].address, exchange.address);
        let signatureRight = await sign(right, accounts[2].address, exchange.address);

        tc = (await ethers.provider.getTransactionCount(accounts[1].address));

        let balance = (await ethers.provider.getBalance(accounts[1].address));
        let tx = await exchange.connect(accounts[10]).matchOrders(left, signatureLeft, right, signatureRight, { value: 10000 });
        let receipt = await tx.wait();
        tc = (await ethers.provider.getTransactionCount(accounts[1].address));

        let diff = (await ethers.provider.getBalance(accounts[1].address)).toBigInt() - balance.toBigInt();
        assert.equal(diff, 9100);
        assert.equal(await erc721.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721.balanceOf(accounts[2].address), 1);
    });

    // address1 sends nft to address2
    it("erc721 for erc20 (weth)", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        await erc721.mint(accounts[1].address, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const Weth = await ethers.getContractFactory("WETH9")
        const weth = await Weth.deploy()
        await weth.connect(accounts[2]).deposit({ value: 20000 });
        await weth.connect(accounts[2]).approve(erc20proxy.address, UINT256_MAX);

        // give payouts accounts a weth history, this is the more common case for gas fees
        // Explanation: 
        //   If SSTORE changes a zero value to nonzero, it costs 20k
        //   If SSTORE changes a nonzero value to nonzero, it costs 5k
        await weth.connect(accounts[1]).deposit({ value: 20000 });
        await weth.connect(accounts[1]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[3]).deposit({ value: 20000 });
        await weth.connect(accounts[3]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[4]).deposit({ value: 20000 });
        await weth.connect(accounts[4]).approve(erc20proxy.address, UINT256_MAX);

        const amount = 10000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);
        let makeAsset = Asset(id("ERC721"), enc(erc721.address, 52), 1);
        let takeAsset = Asset(id("ERC20"), enc(weth.address), amount);
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = Order(accounts[1].address, makeAsset, ZERO, takeAsset, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = Order(accounts[2].address, takeAsset, ZERO, makeAsset, saltRight, 0, 0, id("V2"), encDataRight);


        let signatureLeft = await sign(left, accounts[1].address, exchange.address);
        let signatureRight = await sign(right, accounts[2].address, exchange.address);

        let tx = await exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight);
        let receipt = await tx.wait();
        assert.equal(await erc721.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721.balanceOf(accounts[2].address), 1);
        //assert.equal(await weth.balanceOf(accounts[1].address), 9800);
        //assert.equal(await weth.balanceOf(accounts[2].address), 0);
    });

    // address1 sends 10 erc1155 nft to address2
    it("erc1155 for eth", async function() {

        TestERC1155 = await ethers.getContractFactory("TestERC1155");
        let erc1155 = await TestERC1155.deploy();
        await erc1155.mint(accounts[1].address, 1, 10);
        await erc1155.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const amount = 10000000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);


        let makeAsset = Asset(id("ERC1155"), enc(erc1155.address, 1), 10);
        let takeAsset = Asset(id("ETH"), "0x", amount);
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = Order(accounts[1].address, makeAsset, ZERO, takeAsset, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = Order(accounts[2].address, takeAsset, ZERO, makeAsset, saltRight, 0, 0, id("V2"), encDataRight);

        let signatureLeft = await sign(left, accounts[1].address, exchange.address);
        let signatureRight = await sign(right, accounts[2].address, exchange.address);

        let tx = await exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight, { value: amount });
        let receipt = await tx.wait();

        assert.equal(await erc1155.balanceOf(accounts[1].address, 1), 0);
        assert.equal(await erc1155.balanceOf(accounts[2].address, 1), 10);
    });

    //address1 sends 3 seperate nfts to address2
    it("3 erc721s for eth", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721_1 = await TestERC721.deploy();
        await erc721_1.mint(accounts[1].address, 52);
        await erc721_1.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);
        let erc721_2 = await TestERC721.deploy();
        await erc721_2.mint(accounts[1].address, 52);
        await erc721_2.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);
        let erc721_3 = await TestERC721.deploy();
        await erc721_3.mint(accounts[1].address, 52);
        await erc721_3.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const amount = 10000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);
        let makeAssets = [Asset(id("ERC721"), enc(erc721_1.address, 52), 1), Asset(id("ERC721"), enc(erc721_2.address, 52), 1), Asset(id("ERC721"), enc(erc721_3.address, 52), 1)];
        let takeAssets = [Asset(id("ETH"), "0x", amount)];
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = OrderBatch(accounts[1].address, makeAssets, ZERO, takeAssets, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = OrderBatch(accounts[2].address, takeAssets, ZERO, makeAssets, saltRight, 0, 0, id("V2"), encDataRight);


        let signatureLeft = await signBatch(left, accounts[1].address, exchange.address);
        let signatureRight = await signBatch(right, accounts[2].address, exchange.address);

        let tx = await exchange.connect(accounts[1]).matchOrdersBatch(left, signatureLeft, right, signatureRight, { value: amount });
        let receipt = await tx.wait();
        assert.equal(await erc721_1.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_1.balanceOf(accounts[2].address), 1);
        assert.equal(await erc721_2.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_2.balanceOf(accounts[2].address), 1);
        assert.equal(await erc721_3.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_3.balanceOf(accounts[2].address), 1);
        //assert.equal(await weth.balanceOf(accounts[1].address), 9800);
        //assert.equal(await weth.balanceOf(accounts[2].address), 0);
    });

    // address1 sends 3 seperate nfts to address2
    it("3 erc721s for erc20 (weth)", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721_1 = await TestERC721.deploy();
        await erc721_1.mint(accounts[1].address, 52);
        await erc721_1.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);
        let erc721_2 = await TestERC721.deploy();
        await erc721_2.mint(accounts[1].address, 52);
        await erc721_2.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);
        let erc721_3 = await TestERC721.deploy();
        await erc721_3.mint(accounts[1].address, 52);
        await erc721_3.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const Weth = await ethers.getContractFactory("WETH9")
        const weth = await Weth.deploy()
        await weth.connect(accounts[2]).deposit({ value: 20000 });
        await weth.connect(accounts[2]).approve(erc20proxy.address, UINT256_MAX);

        // give payouts accounts a weth history, this is the more common case for gas fees
        // Explanation: 
        //   If SSTORE changes a zero value to nonzero, it costs 20k
        //   If SSTORE changes a nonzero value to nonzero, it costs 5k
        await weth.connect(accounts[1]).deposit({ value: 20000 });
        await weth.connect(accounts[1]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[3]).deposit({ value: 20000 });
        await weth.connect(accounts[3]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[4]).deposit({ value: 20000 });
        await weth.connect(accounts[4]).approve(erc20proxy.address, UINT256_MAX);

        const amount = 10000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);

        let makeAssets = [Asset(id("ERC721"), enc(erc721_1.address, 52), 1), Asset(id("ERC721"), enc(erc721_2.address, 52), 1), Asset(id("ERC721"), enc(erc721_3.address, 52), 1)];
        let takeAssets = [Asset(id("ERC20"), enc(weth.address), amount)];
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = OrderBatch(accounts[1].address, makeAssets, ZERO, takeAssets, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = OrderBatch(accounts[2].address, takeAssets, ZERO, makeAssets, saltRight, 0, 0, id("V2"), encDataRight);


        let signatureLeft = await signBatch(left, accounts[1].address, exchange.address);
        let signatureRight = await signBatch(right, accounts[2].address, exchange.address);

        let tx = await exchange.connect(accounts[1]).matchOrdersBatch(left, signatureLeft, right, signatureRight);
        let receipt = await tx.wait();
        assert.equal(await erc721_1.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_1.balanceOf(accounts[2].address), 1);
        assert.equal(await erc721_2.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_2.balanceOf(accounts[2].address), 1);
        assert.equal(await erc721_3.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_3.balanceOf(accounts[2].address), 1);
        //assert.equal(await weth.balanceOf(accounts[1].address), 9800);
        //assert.equal(await weth.balanceOf(accounts[2].address), 0);
    });

    // Match multiple seperate orders in one transaction
    it("Match multiple seperate orders in one transaction", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721_1 = await TestERC721.deploy();
        await erc721_1.mint(accounts[1].address, 52);
        await erc721_1.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);
        let erc721_2 = await TestERC721.deploy();
        await erc721_2.mint(accounts[1].address, 52);
        await erc721_2.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);
        let erc721_3 = await TestERC721.deploy();
        await erc721_3.mint(accounts[1].address, 52);
        await erc721_3.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const Weth = await ethers.getContractFactory("WETH9")
        const weth = await Weth.deploy()
        await weth.connect(accounts[1]).deposit({ value: 200000 });
        await weth.connect(accounts[1]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[2]).deposit({ value: 200000 });
        await weth.connect(accounts[2]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[3]).deposit({ value: 200000 });
        await weth.connect(accounts[3]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[4]).deposit({ value: 200000 });
        await weth.connect(accounts[4]).approve(erc20proxy.address, UINT256_MAX);

        let leftOrders = Array(3);
        let leftSignatures = Array(3);
        let rightOrders = Array(3);
        let rightSignatures = Array(3);

        let tokens = [erc721_1, erc721_2, erc721_3]

        for (var i = 0; i < 3; i++) {
            const amount = 1000;
            let encDataLeft = await encDataV2([
                [],
                [], false
            ]);
            let encDataRight = await encDataV2([
                [
                    [accounts[3].address, amount * ROYALTY],
                    [accounts[4].address, amount * PROTOCOL_FEE]
                ],
                [], false
            ]);
            let makeAsset = Asset(id("ERC721"), enc(tokens[i].address, 52), 1);
            let takeAsset = Asset(id("ERC20"), enc(weth.address), amount);
            let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
            let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
            leftOrders[i] = Order(accounts[1].address, makeAsset, ZERO, takeAsset, saltLeft, 0, 0, id("V2"), encDataLeft);
            rightOrders[i] = Order(accounts[2].address, takeAsset, ZERO, makeAsset, saltRight, 0, 0, id("V2"), encDataRight);

            leftSignatures[i] = await sign(leftOrders[i], accounts[1].address, exchange.address);
            rightSignatures[i] = await sign(rightOrders[i], accounts[2].address, exchange.address);
        }

        let tx = await exchange.connect(accounts[1]).multiMatchOrders(
            leftOrders, leftSignatures, rightOrders, rightSignatures
        );
        let receipt = await tx.wait();
        assert.equal(await erc721_1.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_1.balanceOf(accounts[2].address), 1);
        assert.equal(await erc721_2.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_2.balanceOf(accounts[2].address), 1);
        assert.equal(await erc721_3.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721_3.balanceOf(accounts[2].address), 1);
        //assert.equal(await weth.balanceOf(accounts[1].address), 9800);
        //assert.equal(await weth.balanceOf(accounts[2].address), 0);
    });

    // Match multiple seperate orders in one transaction
    it("Match 10 seperate orders in one transaction from single collection", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        for (var i = 1; i <= 10; i++)
            await erc721.mint(accounts[1].address, i);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const Weth = await ethers.getContractFactory("WETH9")
        const weth = await Weth.deploy()
        await weth.connect(accounts[1]).deposit({ value: 200000 });
        await weth.connect(accounts[1]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[2]).deposit({ value: 200000 });
        await weth.connect(accounts[2]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[3]).deposit({ value: 200000 });
        await weth.connect(accounts[3]).approve(erc20proxy.address, UINT256_MAX);
        await weth.connect(accounts[4]).deposit({ value: 200000 });
        await weth.connect(accounts[4]).approve(erc20proxy.address, UINT256_MAX);

        let leftOrders = Array(10);
        let leftSignatures = Array(10);
        let rightOrders = Array(10);
        let rightSignatures = Array(10);

        for (var i = 0; i < 10; i++) {
            const amount = 1000;
            let encDataLeft = await encDataV2([
                [],
                [], false
            ]);
            let encDataRight = await encDataV2([
                [
                    [accounts[3].address, amount * ROYALTY],
                    [accounts[4].address, amount * PROTOCOL_FEE]
                ],
                [], false
            ]);
            let makeAsset = Asset(id("ERC721"), enc(erc721.address, i + 1), 1);
            let takeAsset = Asset(id("ERC20"), enc(weth.address), amount);
            let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
            let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
            leftOrders[i] = Order(accounts[1].address, makeAsset, ZERO, takeAsset, saltLeft, 0, 0, id("V2"), encDataLeft);
            rightOrders[i] = Order(accounts[2].address, takeAsset, ZERO, makeAsset, saltRight, 0, 0, id("V2"), encDataRight);

            leftSignatures[i] = await sign(leftOrders[i], accounts[1].address, exchange.address);
            rightSignatures[i] = await sign(rightOrders[i], accounts[2].address, exchange.address);
        }

        let tx = await exchange.connect(accounts[1]).multiMatchOrders(
            leftOrders, leftSignatures, rightOrders, rightSignatures
        );
        let receipt = await tx.wait();
        assert.equal(await erc721.balanceOf(accounts[1].address), 0);
        assert.equal(await erc721.balanceOf(accounts[2].address), 10);
        //assert.equal(await weth.balanceOf(accounts[1].address), 9800);
        //assert.equal(await weth.balanceOf(accounts[2].address), 0);
    });

    // try cancelled order
    it("cancelled order", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        await erc721.mint(accounts[1].address, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const Weth = await ethers.getContractFactory("WETH9")
        const weth = await Weth.deploy()
        await weth.connect(accounts[2]).deposit({ value: 20000 });
        await weth.connect(accounts[2]).approve(erc20proxy.address, UINT256_MAX);

        const amount = 10000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);
        let makeAsset = Asset(id("ERC721"), enc(erc721.address, 52), 1);
        let takeAsset = Asset(id("ERC20"), enc(weth.address), amount);
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = Order(accounts[1].address, makeAsset, ZERO, takeAsset, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = Order(accounts[2].address, takeAsset, ZERO, makeAsset, saltRight, 0, 0, id("V2"), encDataRight);

        let signatureLeft = await sign(left, accounts[1].address, exchange.address);
        let signatureRight = await sign(right, accounts[2].address, exchange.address);

        await exchange.connect(accounts[1]).cancel(left);

        await expect(
            exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight)
        ).to.be.revertedWith('Order has been cancelled');

    });

    // try cancelled batch order
    it("cancelled batch order", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        await erc721.mint(accounts[1].address, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const amount = 10000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);
        let makeAssets = [Asset(id("ERC721"), enc(erc721.address, 52), 1)];
        let takeAssets = [Asset(id("ETH"), "0x", amount)];
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = OrderBatch(accounts[1].address, makeAssets, ZERO, takeAssets, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = OrderBatch(accounts[2].address, takeAssets, ZERO, makeAssets, saltRight, 0, 0, id("V2"), encDataRight);

        let signatureLeft = await signBatch(left, accounts[1].address, exchange.address);
        let signatureRight = await signBatch(right, accounts[2].address, exchange.address);

        await exchange.connect(accounts[1]).cancelBatch(left);

        await expect(
            exchange.connect(accounts[1]).matchOrdersBatch(left, signatureLeft, right, signatureRight, { value: amount })
        ).to.be.revertedWith('Order has been cancelled');

    });

    // try sending double order
    it("double order", async function() {

        TestERC721 = await ethers.getContractFactory("TestERC721");
        let erc721 = await TestERC721.deploy();
        await erc721.mint(accounts[1].address, 52);
        await erc721.connect(accounts[1]).setApprovalForAll(nftproxy.address, true);

        const Weth = await ethers.getContractFactory("WETH9")
        const weth = await Weth.deploy()
        await weth.connect(accounts[2]).deposit({ value: 20000 });
        await weth.connect(accounts[2]).approve(erc20proxy.address, UINT256_MAX);

        const amount = 10000;
        let encDataLeft = await encDataV2([
            [],
            [], false
        ]);
        let encDataRight = await encDataV2([
            [
                [accounts[3].address, amount * ROYALTY],
                [accounts[4].address, amount * PROTOCOL_FEE]
            ],
            [], false
        ]);
        let makeAsset = Asset(id("ERC721"), enc(erc721.address, 52), 1);
        let takeAsset = Asset(id("ERC20"), enc(weth.address), amount);
        let saltLeft = web3.utils.randomHex(32); // 32 bytes = 256 bits
        let saltRight = web3.utils.randomHex(32); // 32 bytes = 256 bits
        const left = Order(accounts[1].address, makeAsset, ZERO, takeAsset, saltLeft, 0, 0, id("V2"), encDataLeft);
        const right = Order(accounts[2].address, takeAsset, ZERO, makeAsset, saltRight, 0, 0, id("V2"), encDataRight);

        let signatureLeft = await sign(left, accounts[1].address, exchange.address);
        let signatureRight = await sign(right, accounts[2].address, exchange.address);

        exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight)

        // transfer back to address 1
        await erc721.connect(accounts[2]).transferFrom(accounts[2].address, accounts[1].address, 52);

        await expect(
            exchange.connect(accounts[1]).matchOrders(left, signatureLeft, right, signatureRight)
        ).to.be.revertedWith('Order has been cancelled');

    });
});