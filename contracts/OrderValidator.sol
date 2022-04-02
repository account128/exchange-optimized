// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./IERC1271.sol";
import "./LibOrder.sol";
import "./LibSignature.sol";
import "./AddressUpgradeable.sol";
import "./ContextUpgradeable.sol";
import "./EIP712Upgradeable.sol";

abstract contract OrderValidator is
  Initializable,
  ContextUpgradeable,
  EIP712Upgradeable
{
  using LibSignature for bytes32;
  using AddressUpgradeable for address;

  bytes4 internal constant MAGICVALUE = 0x1626ba7e;

  function validate(LibOrder.Order memory order, bytes memory signature)
    internal
    view
  {
    if (order.salt == 0) {
      if (order.maker != address(0)) {
        console.log("maker", order.maker);
        console.log("maker", _msgSender());
        require(_msgSender() == order.maker, "maker is not tx sender");
      } else {
        order.maker = _msgSender();
      }
    } else {
      if (_msgSender() != order.maker) {
        bytes32 hash = LibOrder.hash(order);
        address signer;
        if (signature.length == 65) {
          signer = _hashTypedDataV4(hash, "Exchange", "2").recover(signature);
        }
        if (signer != order.maker) {
          if (order.maker.isContract()) {
            require(
              IERC1271(order.maker).isValidSignature(
                _hashTypedDataV4(hash, "Exchange", "2"),
                signature
              ) == MAGICVALUE,
              "contract order signature verification error"
            );
          } else {
           revert("order signature verification error");
          }
        }
      }
    }
  }

  uint256[50] private __gap;
}