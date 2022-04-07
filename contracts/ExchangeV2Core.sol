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
    (
      LibAsset.AssetType memory makeMatch,
      LibAsset.AssetType memory takeMatch
    ) = matchAssets(orderLeft, orderRight);

    LibFill.FillResult memory newFill = LibFill.FillResult(orderLeft.makeAsset.value, orderRight.makeAsset.value);

    (uint256 totalMakeValue, uint256 totalTakeValue) = doTransfers(
      makeMatch,
      takeMatch,
      newFill,
      orderLeft,
      orderRight
    );
    if (makeMatch.assetClass == LibAsset.ETH_ASSET_CLASS) {
      require(takeMatch.assetClass != LibAsset.ETH_ASSET_CLASS);
      require(msg.value >= totalMakeValue, "not enough eth");
      if (msg.value > totalMakeValue) {
        address(msg.sender).transferEth(msg.value.sub(totalMakeValue));
      }
    } else if (takeMatch.assetClass == LibAsset.ETH_ASSET_CLASS) {
      require(msg.value >= totalTakeValue, "not enough eth");
      if (msg.value > totalTakeValue) {
        address(msg.sender).transferEth(msg.value.sub(totalTakeValue));
      }
    }
    // emit Match(
    //   orderLeft.maker,
    //   orderRight.maker,
    //   newFill.rightValue,
    //   newFill.leftValue,
    //   makeMatch,
    //   takeMatch
    // );
  }

  function matchAssets(
    LibOrder.Order memory orderLeft,
    LibOrder.Order memory orderRight
  )
    internal
    view
    returns (
      LibAsset.AssetType memory makeMatch,
      LibAsset.AssetType memory takeMatch
    )
  {
    require(orderLeft.makeAsset.value == orderRight.takeAsset.value, "asset values don't match");
    require(orderLeft.takeAsset.value == orderRight.makeAsset.value, "asset values don't match");

    makeMatch = matchAssets(
      orderLeft.makeAsset.assetType,
      orderRight.takeAsset.assetType
    );
    require(makeMatch.assetClass != 0, "assets don't match");
    takeMatch = matchAssets(
      orderLeft.takeAsset.assetType,
      orderRight.makeAsset.assetType
    );
    require(takeMatch.assetClass != 0, "assets don't match");
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