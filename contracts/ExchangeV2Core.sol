// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "./LibFill.sol";
import "./LibOrder.sol";
import "./OrderValidator.sol";
import "./AssetMatcher.sol";
import "./TransferExecutor.sol";
import "./ITransferManager.sol";
import "./LibTransfer.sol";

abstract contract ExchangeV2Core is
  Initializable,
  OwnableUpgradeable,
  AssetMatcher,
  TransferExecutor,
  OrderValidator,
  ITransferManager
{
  using SafeMathUpgradeable for uint256;
  using LibTransfer for address;

  event Match(
    address leftMaker,
    address rightMaker,
    uint256 newLeftFill,
    uint256 newRightFill,
    LibAsset.AssetType leftAsset,
    LibAsset.AssetType rightAsset
  );

  function matchOrders(
    LibOrder.Order memory orderLeft,
    bytes memory signatureLeft,
    LibOrder.Order memory orderRight,
    bytes memory signatureRight
  ) external payable {
    validateFull(orderLeft, signatureLeft);
    validateFull(orderRight, signatureRight);
    if (orderLeft.taker != address(0)) {
      require(
        orderRight.maker == orderLeft.taker,
        "leftOrder.taker verification failed"
      );
    }
    if (orderRight.taker != address(0)) {
      require(
        orderRight.taker == orderLeft.maker,
        "rightOrder.taker verification failed"
      );
    }
    matchAndTransfer(orderLeft, orderRight);
  }

  function matchAndTransfer(
    LibOrder.Order memory orderLeft,
    LibOrder.Order memory orderRight
  ) internal {

    matchAssets(orderLeft, orderRight);

    (uint256 totalMakeValue, uint256 totalTakeValue) = doTransfers(
      orderLeft,
      orderRight
    );

    for(uint i=0; i<orderLeft.makeAssets.length; i++) {
      if (orderLeft.makeAssets[i].assetType.assetClass == LibAsset.ETH_ASSET_CLASS) {
        require(msg.value >= totalMakeValue, "not enough eth");
        if (msg.value > totalMakeValue) {
          address(msg.sender).transferEth(msg.value.sub(totalMakeValue));
        }
      }
    }
    for(uint i=0; i<orderRight.makeAssets.length; i++) {
      if (orderLeft.takeAssets[i].assetType.assetClass == LibAsset.ETH_ASSET_CLASS) {
        require(msg.value >= totalTakeValue, "not enough eth");
        if (msg.value > totalTakeValue) {
          address(msg.sender).transferEth(msg.value.sub(totalTakeValue));
        }
      }
    }
    // emit Match(
    //   orderLeft.maker,
    //   orderRight.maker,
    //   totalMakeValue,
    //   totalTakeValue,
    //   makeMatch,
    //   takeMatch
    // );
  }

  // ensure that order types are matched
  function matchAssets(
    LibOrder.Order memory orderLeft,
    LibOrder.Order memory orderRight
  )
    internal
    view
  {
    for (uint i = 0; i < orderLeft.makeAssets.length; i++) {
      require(orderLeft.makeAssets[i].value == orderRight.takeAssets[i].value, "asset values don't match");
      LibAsset.AssetType memory assetMatch = matchAssets(orderLeft.makeAssets[i].assetType,orderRight.takeAssets[i].assetType);
      require( assetMatch.assetClass != 0, "assets don't match");
    }

    for (uint i = 0; i < orderLeft.takeAssets.length; i++) {
      require(orderLeft.takeAssets[i].value == orderRight.makeAssets[i].value, "asset values don't match");
      LibAsset.AssetType memory assetMatch = matchAssets(
        orderLeft.takeAssets[i].assetType,
        orderRight.makeAssets[i].assetType
      );
      require(assetMatch.assetClass != 0, "assets don't match");
    }
  }

  function validateFull(LibOrder.Order memory order, bytes memory signature)
    internal
    view
  {
    LibOrder.validate(order);
    validate(order, signature);
  }

  uint256[49] private __gap;
}