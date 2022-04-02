// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
import "hardhat/console.sol";


library LibTransfer {
    function transferEth(address to, uint value) internal {
        console.log("transfering eth", value, to);
        (bool success,) = to.call{ value: value }("");
        require(success, "transfer failed");
    }
}