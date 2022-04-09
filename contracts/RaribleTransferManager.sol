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
    LibOrder.OrderBatch memory leftOrder,
    LibOrder.OrderBatch memory rightOrder,
    LibOrderDataV2.DataV2 memory leftOrderData,
    LibOrderDataV2.DataV2 memory rightOrderData
  ) internal override returns (uint256 totalMakeValue, uint256 totalTakeValue) {
  
    for(uint i =0; i<leftOrder.makeAssets.length; i++) {
      LibAsset.AssetType memory makeMatch = leftOrder.makeAssets[i].assetType;
      if(makeMatch.assetClass == LibAsset.ETH_ASSET_CLASS || makeMatch.assetClass == LibAsset.ERC20_ASSET_CLASS) {
        transferPayoutAndFees(
          makeMatch,
          leftOrder.makeAssets[i].value,
          leftOrder.maker,
          rightOrder.maker,
          leftOrderData.payouts,
          TO_TAKER
        );
        totalMakeValue = leftOrder.makeAssets[i].value;
      }
      else {
        transferPayout(
          makeMatch,
          leftOrder.makeAssets[i].value,
          leftOrder.maker,
          rightOrder.maker,
          TO_TAKER
        );
      }
    }

    for(uint i =0; i<rightOrder.makeAssets.length; i++) {
      LibAsset.AssetType memory takeMatch = rightOrder.makeAssets[i].assetType;
      if(takeMatch.assetClass == LibAsset.ETH_ASSET_CLASS || takeMatch.assetClass == LibAsset.ERC20_ASSET_CLASS) {
        transferPayoutAndFees(
          takeMatch,
          rightOrder.makeAssets[i].value,
          rightOrder.maker,
          leftOrder.maker,
          rightOrderData.payouts,
          TO_MAKER
        );
        totalTakeValue = rightOrder.makeAssets[i].value;
      }
      else {
        transferPayout(
          takeMatch,
          rightOrder.makeAssets[i].value,
          rightOrder.maker,
          leftOrder.maker,
          TO_MAKER
        );
      }
    }
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
    transferPayout(
      matchCalculate,
      restValue,
      from,
      to,
      transferDirection
    );
  }

  function transferPayout(
    LibAsset.AssetType memory matchCalculate,
    uint256 amount,
    address from,
    address to,
    bytes4 transferDirection
  ) internal {

    if (amount > 0) {
      transfer(
        LibAsset.Asset(matchCalculate, amount),
        from,
        to,
        transferDirection,
        PAYOUT
      );
    }
  }

  uint256[46] private __gap;
}