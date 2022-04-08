// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./LibOrder.sol";

library LibOrderData {
    function parse(LibOrder.OrderBatch memory order) pure internal returns (LibOrderDataV2.DataV2 memory dataOrder) {
        if (order.dataType == LibOrderDataV1.V1) {
            LibOrderDataV1.DataV1 memory dataV1 = LibOrderDataV1.decodeOrderDataV1(order.data);
            dataOrder.payouts = dataV1.payouts;
            dataOrder.originFees = dataV1.originFees;
            dataOrder.isMakeFill = false;
        } else if (order.dataType == LibOrderDataV2.V2) {
            dataOrder = LibOrderDataV2.decodeOrderDataV2(order.data);
        } else if (order.dataType == 0xffffffff) {
        } else {
            revert("Unknown Order data type");
        }
    }
} 