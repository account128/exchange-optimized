// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./LibMath.sol";
import "./LibAsset.sol";
import "./LibPart.sol";

library LibOrder {
    using SafeMathUpgradeable for uint;

    bytes32 constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,Asset[] makeAssets,address taker,Asset[] takeAssets,Part[] fees,uint256 salt,uint256 start,uint256 end)Asset(AssetType assetType,uint256 value)AssetType(bytes4 assetClass,bytes data)Part(address account,uint96 value)"
    );

    struct Order {
        address maker;
        LibAsset.Asset[] makeAssets;
        address taker;
        LibAsset.Asset[] takeAssets;
        LibPart.Part[] fees;
        uint salt;
        uint start;
        uint end;
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        bytes32[] memory feesBytes = new bytes32[](order.fees.length);
        for (uint i = 0; i < order.fees.length; i++) {
            feesBytes[i] = LibPart.hash(order.fees[i]);
        }
        bytes32[] memory makeBytes = new bytes32[](order.makeAssets.length);
        for (uint i = 0; i < order.makeAssets.length; i++) {
            makeBytes[i] = LibAsset.hash(order.makeAssets[i]);
        }
        bytes32[] memory takeBytes = new bytes32[](order.takeAssets.length);
        for (uint i = 0; i < order.takeAssets.length; i++) {
            takeBytes[i] = LibAsset.hash(order.takeAssets[i]);
        }
        return keccak256(abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                keccak256(abi.encodePacked(makeBytes)),
                order.taker,
                keccak256(abi.encodePacked(takeBytes)),
                keccak256(abi.encodePacked(feesBytes)),
                order.salt,
                order.start,
                order.end
            ));
    }

    function validate(LibOrder.Order memory order) internal view {
        require(order.start == 0 || order.start < block.timestamp, "Order start validation failed");
        require(order.end == 0 || order.end > block.timestamp, "Order end validation failed");
    }
}