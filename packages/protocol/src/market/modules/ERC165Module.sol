// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import {IERC165Module} from "../interfaces/IERC165Module.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

contract ERC165Module is IERC165Module {
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == this.supportsInterface.selector // ERC165
            || interfaceId == type(IERC721).interfaceId || interfaceId == type(IERC721Metadata).interfaceId;
    }
}
