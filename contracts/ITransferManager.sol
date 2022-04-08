// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "./LibAsset.sol";
import "./LibFill.sol";
import "./TransferExecutor.sol";
import "./LibOrderData.sol";

abstract contract ITransferManager is ITransferExecutor {
    bytes4 constant TO_MAKER = bytes4(keccak256("TO_MAKER"));
    bytes4 constant TO_TAKER = bytes4(keccak256("TO_TAKER"));
    bytes4 constant PAYOUT = bytes4(keccak256("PAYOUT"));

    function doTransfers(
        LibOrder.OrderBatch memory leftOrder,
        LibOrder.OrderBatch memory rightOrder,
        LibOrderDataV2.DataV2 memory leftOrderData,
        LibOrderDataV2.DataV2 memory rightOrderData
    ) internal virtual returns (uint totalMakeValue, uint totalTakeValue);
}