// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./LibOrder.sol";
import "./SafeMathUpgradeable.sol";
import "./MathUpgradeable.sol";

library LibFill {
    using SafeMathUpgradeable for uint;

    struct FillResult {
        uint leftValue;
        uint rightValue;
    }
}