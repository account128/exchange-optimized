// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract TestERC721 is ERC721Upgradeable {
    address _owner;

    function mint(address to, uint tokenId) external {
        _owner = to;
        _mint(to, tokenId);
    }
    function owner() public view virtual returns (address) {
        return _owner;
    }
}