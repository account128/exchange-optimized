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

  // state of orders
  mapping(uint256 => uint256) public isCancelled;

  event Cancel();
  event Match();

  function cancel(LibOrder.Order memory order) external {
    require(_msgSender() == order.maker, "not a maker");
    require(order.salt != 0, "0 salt can't be used");
    isCancelled[order.salt] = 1;
    emit Cancel();
  }

  function cancelBatch(LibOrder.OrderBatch memory order) external {
    require(_msgSender() == order.maker, "not a maker");
    require(order.salt != 0, "0 salt can't be used");
    isCancelled[order.salt] = 1;
    emit Cancel();
  }

  function matchOrders(
    LibOrder.Order memory orderLeft,
    bytes memory signatureLeft,
    LibOrder.Order memory orderRight,
    bytes memory signatureRight
  ) external payable {
    validateFull(orderLeft, signatureLeft);
    validateFull(orderRight, signatureRight);

    LibAsset.Asset[] memory leftMakeAssets = new LibAsset.Asset[](1);
    leftMakeAssets[0] = orderLeft.makeAsset;
    LibAsset.Asset[] memory leftTakeAssets = new LibAsset.Asset[](1);
    leftTakeAssets[0] = orderLeft.takeAsset;
    LibOrder.OrderBatch memory orderLeftBatch = LibOrder.OrderBatch(orderLeft.maker, leftMakeAssets, orderLeft.taker, leftTakeAssets, orderLeft.salt, orderLeft.start, orderLeft.end, orderLeft.dataType, orderLeft.data);

    LibAsset.Asset[] memory rightMakeAssets = new LibAsset.Asset[](1);
    rightMakeAssets[0] = orderRight.makeAsset;
    LibAsset.Asset[] memory rightTakeAssets = new LibAsset.Asset[](1);
    rightTakeAssets[0] = orderRight.takeAsset;
    LibOrder.OrderBatch memory orderRightBatch = LibOrder.OrderBatch(orderRight.maker, rightMakeAssets, orderRight.taker, rightTakeAssets, orderRight.salt, orderRight.start, orderRight.end, orderRight.dataType, orderRight.data);

    if (orderLeftBatch.taker != address(0)) {
      require(
        orderRightBatch.maker == orderLeftBatch.taker,
        "leftOrder.taker verification failed"
      );
    }
    if (orderRightBatch.taker != address(0)) {
      require(
        orderRightBatch.taker == orderLeftBatch.maker,
        "rightOrder.taker verification failed"
      );
    }
    matchAndTransfer(orderLeftBatch, orderRightBatch);
  }

  function matchOrdersBatch(
    LibOrder.OrderBatch memory orderLeftBatch,
    bytes memory signatureLeft,
    LibOrder.OrderBatch memory orderRightBatch,
    bytes memory signatureRight
  ) external payable {

    validateFull(orderLeftBatch, signatureLeft);
    validateFull(orderRightBatch, signatureRight);

    if (orderLeftBatch.taker != address(0)) {
      require(
        orderRightBatch.maker == orderLeftBatch.taker,
        "leftOrder.taker verification failed"
      );
    }
    if (orderRightBatch.taker != address(0)) {
      require(
        orderRightBatch.taker == orderLeftBatch.maker,
        "rightOrder.taker verification failed"
      );
    }
    matchAndTransfer(orderLeftBatch, orderRightBatch);
  }

  function matchAndTransfer(
    LibOrder.OrderBatch memory orderLeft,
    LibOrder.OrderBatch memory orderRight
  ) internal {

    matchAssets(orderLeft, orderRight);

    LibOrderDataV2.DataV2 memory leftOrderData = LibOrderData.parse(orderLeft);
    LibOrderDataV2.DataV2 memory rightOrderData = LibOrderData.parse(orderRight);

    (uint256 totalMakeValue, uint256 totalTakeValue) = doTransfers(
      orderLeft,
      orderRight,
      leftOrderData,
      rightOrderData
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
    emit Match();
  }

  // ensure that order types are matched
  function matchAssets(
    LibOrder.OrderBatch memory orderLeft,
    LibOrder.OrderBatch memory orderRight
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
    require(isCancelled[order.salt] == 0, "Order has been cancelled");
    LibOrder.validate(order);
    OrderValidator.validate(order, signature);
  }

  function validateFull(LibOrder.OrderBatch memory order, bytes memory signature)
    internal
    view
  {
    require(isCancelled[order.salt] == 0, "Order has been cancelled");
    LibOrder.validate(order);
    OrderValidator.validate(order, signature);
  }

  uint256[49] private __gap;
}