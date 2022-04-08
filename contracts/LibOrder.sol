// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./LibMath.sol";
import "./LibAsset.sol";
import "./LibOrderDataV2.sol";
import "./LibOrderDataV1.sol";
import "./LibPart.sol";
import "hardhat/console.sol";

library LibOrder {
    using SafeMathUpgradeable for uint;

    bytes32 constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,Asset makeAsset,address taker,Asset takeAsset,uint256 salt,uint256 start,uint256 end,bytes4 dataType,bytes data)Asset(AssetType assetType,uint256 value)AssetType(bytes4 assetClass,bytes data)"
    );

    bytes32 constant ORDER_BATCH_TYPEHASH = keccak256(
        "OrderBatch(address maker,Asset[] makeAssets,address taker,Asset[] takeAssets,uint256 salt,uint256 start,uint256 end,bytes4 dataType,bytes data)Asset(AssetType assetType,uint256 value)AssetType(bytes4 assetClass,bytes data)"
    );

    struct Order {
        address maker;
        LibAsset.Asset makeAsset;
        address taker;
        LibAsset.Asset takeAsset;
        uint salt;
        uint start;
        uint end;
        bytes4 dataType;
        bytes data;
    }

    struct OrderBatch {
        address maker;
        LibAsset.Asset[] makeAssets;
        address taker;
        LibAsset.Asset[] takeAssets;
        uint salt;
        uint start;
        uint end;
        bytes4 dataType;
        bytes data;
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        return keccak256(abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                LibAsset.hash(order.makeAsset),
                order.taker,
                LibAsset.hash(order.takeAsset),
                order.salt,
                order.start,
                order.end,
                order.dataType,
                keccak256(order.data)
            ));
    }

    function hash(OrderBatch memory order) internal pure returns (bytes32) {
        bytes32[] memory makeBytes = new bytes32[](order.makeAssets.length);
        for (uint i = 0; i < order.makeAssets.length; i++) {
            makeBytes[i] = LibAsset.hash(order.makeAssets[i]);
        }
        bytes32[] memory takeBytes = new bytes32[](order.takeAssets.length);
        for (uint i = 0; i < order.takeAssets.length; i++) {
            takeBytes[i] = LibAsset.hash(order.takeAssets[i]);
        }
        return keccak256(abi.encode(
                ORDER_BATCH_TYPEHASH,
                order.maker,
                keccak256(abi.encodePacked(makeBytes)),
                order.taker,
                keccak256(abi.encodePacked(takeBytes)),
                order.salt,
                order.start,
                order.end,
                order.dataType,
                keccak256(order.data)
            ));
    }

    function validate(LibOrder.Order memory order) internal view {
        require(order.start == 0 || order.start < block.timestamp, "Order start validation failed");
        require(order.end == 0 || order.end > block.timestamp, "Order end validation failed");
    }

    function validate(LibOrder.OrderBatch memory order) internal view {
        require(order.start == 0 || order.start < block.timestamp, "Order start validation failed");
        require(order.end == 0 || order.end > block.timestamp, "Order end validation failed");
    }
}