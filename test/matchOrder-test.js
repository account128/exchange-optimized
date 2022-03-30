const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ExchangeV2", function() {
    it("Initialize exchange", async function() {
        const ExchangeV2 = await ethers.getContractFactory("ExchangeV2");
        //console.log(ExchangeV2);
    });
});