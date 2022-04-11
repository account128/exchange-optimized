// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

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

  uint256 private constant UINT256_MAX = 2**256 - 1;

  // state of orders
  mapping(bytes32 => uint256) public fills;

  event Cancel();
  event Match();

  function cancel(LibOrder.Order memory order) external {
    require(_msgSender() == order.maker, "not a maker");
    require(order.salt != 0, "0 salt can't be used");
    bytes32 orderKeyHash = LibOrder.hashKey(order);
    fills[orderKeyHash] = UINT256_MAX;
    emit Cancel();
  }

  function cancelBatch(LibOrder.OrderBatch memory order) external {
    require(_msgSender() == order.maker, "not a maker");
    require(order.salt != 0, "0 salt can't be used");
    bytes32 orderKeyHash = LibOrder.hashKey(order);
    fills[orderKeyHash] = UINT256_MAX;
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

    LibOrder.OrderBatch memory orderLeftBatch = LibOrder.convertToBatch(orderLeft);
    LibOrder.OrderBatch memory orderRightBatch = LibOrder.convertToBatch(orderRight);
    
    matchAndTransfer(orderLeftBatch, orderRightBatch);
  }

  function multiMatchOrders(
    LibOrder.Order[] memory ordersLeft,
    bytes[] memory signaturesLeft,
    LibOrder.Order[] memory ordersRight,
    bytes[] memory signaturesRight
  ) external payable {

    require(ordersLeft.length == ordersRight.length, "Order lengths don't match");
    require(signaturesLeft.length == ordersLeft.length, "Signature and order lengths don't match");
    require(signaturesRight.length == ordersRight.length, "Signature and order lengths don't match");
    for (uint i=0; i<ordersLeft.length; i++) {
      validateFull(ordersLeft[i], signaturesLeft[i]);
      validateFull(ordersRight[i], signaturesRight[i]);

      LibOrder.OrderBatch memory orderLeftBatch = LibOrder.convertToBatch(ordersLeft[i]);
      LibOrder.OrderBatch memory orderRightBatch = LibOrder.convertToBatch(ordersRight[i]);

      matchAndTransfer(orderLeftBatch, orderRightBatch);
    }

  }

  function matchOrdersBatch(
    LibOrder.OrderBatch memory orderLeftBatch,
    bytes memory signatureLeft,
    LibOrder.OrderBatch memory orderRightBatch,
    bytes memory signatureRight
  ) external payable {

    validateFull(orderLeftBatch, signatureLeft);
    validateFull(orderRightBatch, signatureRight);

    matchAndTransfer(orderLeftBatch, orderRightBatch);
  }

  function matchAndTransfer(
    LibOrder.OrderBatch memory orderLeft,
    LibOrder.OrderBatch memory orderRight
  ) internal {

    verifyTakers(orderLeft, orderRight);
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
      if (orderRight.makeAssets[i].assetType.assetClass == LibAsset.ETH_ASSET_CLASS) {
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
    require(orderLeft.makeAssets.length == orderRight.takeAssets.length, "make and take asset lengths don't match");
    require(orderRight.makeAssets.length == orderLeft.takeAssets.length, "make and take asset lengths don't match");

    for (uint i = 0; i < orderLeft.makeAssets.length; i++) {
      require(orderLeft.makeAssets[i].value >= orderRight.takeAssets[i].value, "make value is less than take");
      LibAsset.AssetType memory assetMatch = matchAssets(
        orderLeft.makeAssets[i].assetType,
        orderRight.takeAssets[i].assetType
      );
      require( assetMatch.assetClass != 0, "assets don't match");
    }

    for (uint i = 0; i < orderRight.makeAssets.length; i++) {
      require(orderRight.makeAssets[i].value >= orderLeft.takeAssets[i].value, "make value is less than take");
      LibAsset.AssetType memory assetMatch = matchAssets(
        orderLeft.takeAssets[i].assetType,
        orderRight.makeAssets[i].assetType
      );
      require(assetMatch.assetClass != 0, "assets don't match");
    }
  }

  function verifyTakers(
    LibOrder.OrderBatch memory orderLeft,
    LibOrder.OrderBatch memory orderRight
  ) internal pure {

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
  }

  function validateFull(LibOrder.Order memory order, bytes memory signature)
    internal
    view
  {
    if(order.salt != 0) {
      bytes32 orderKeyHash = LibOrder.hashKey(order);
      require(fills[orderKeyHash] == 0, "Order has been cancelled");
    }
    LibOrder.validate(order);
    OrderValidator.validate(order, signature);
  }

  function validateFull(LibOrder.OrderBatch memory order, bytes memory signature)
    internal
    view
  {
    if(order.salt != 0) {
      bytes32 orderKeyHash = LibOrder.hashKey(order);
      require(fills[orderKeyHash] == 0, "Order has been cancelled");
    }
    LibOrder.validate(order);
    OrderValidator.validate(order, signature);
  }

  uint256[49] private __gap;
}