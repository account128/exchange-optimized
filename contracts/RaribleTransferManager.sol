// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "./IERC721Upgradeable.sol";
import "./SafeMathUpgradeable.sol";
import "./LibAsset.sol";
import "./LibERC721LazyMint.sol";
import "./LibERC1155LazyMint.sol";
import "./LibFill.sol";
import "./ITransferManager.sol";
import "./TransferExecutor.sol";

abstract contract RaribleTransferManager is
  OwnableUpgradeable,
  ITransferManager
{
  using SafeMathUpgradeable for uint256;

  function doTransfers(
    LibAsset.AssetType memory makeMatch,
    LibAsset.AssetType memory takeMatch,
    LibFill.FillResult memory fill,
    LibOrder.Order memory leftOrder,
    LibOrder.Order memory rightOrder
  ) internal override returns (uint256 totalMakeValue, uint256 totalTakeValue) {
    totalMakeValue = fill.leftValue;
    totalTakeValue = fill.rightValue;
    transferPayoutAndFees(
      makeMatch,
      fill.leftValue,
      leftOrder.maker,
      rightOrder.maker,
      leftOrder.fees,
      TO_TAKER
    );
    transferPayoutAndFees(
      takeMatch,
      fill.rightValue,
      rightOrder.maker,
      leftOrder.maker,
      rightOrder.fees,
      TO_MAKER
    );
  }

  function transferPayoutAndFees(
    LibAsset.AssetType memory matchCalculate,
    uint256 amount,
    address from,
    address to,
    LibPart.Part[] memory fees,
    bytes4 transferDirection
  ) internal {
    uint256 restValue = amount;

    // Transfer fees
    for (uint256 i = 0; i < fees.length; i++) {
      uint256 currentAmount = fees[i].value;
      if (currentAmount > 0) {
        require(currentAmount < restValue, "not enough to cover fees");
        restValue = restValue.sub(currentAmount);
        transfer(
          LibAsset.Asset(matchCalculate, currentAmount),
          from,
          fees[i].account,
          transferDirection,
          PAYOUT
        );
      }
    }
    // Transfer payout
    if (restValue > 0) {
      transfer(
        LibAsset.Asset(matchCalculate, restValue),
        from,
        to,
        transferDirection,
        PAYOUT
      );
    }
  }

  uint256[46] private __gap;
}