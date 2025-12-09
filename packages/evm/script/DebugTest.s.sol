// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IWormhole {
    function messageFee() external view returns (uint256);
}

interface ITokenBridge {
    function isFork() external view returns (bool);
    function wormhole() external view returns (address);
    function chainId() external view returns (uint16);
    function finality() external view returns (uint8);
}

contract DebugTest is Script {
    function run() external view {
        address bridge = 0xF35a71868f2c6649277bcb8993Eb0338484DEeF8;
        
        console.log("=== Bridge Debug Info ===");
        console.log("isFork:", ITokenBridge(bridge).isFork());
        console.log("chainId:", ITokenBridge(bridge).chainId());
        console.log("finality:", ITokenBridge(bridge).finality());
        
        address wh = ITokenBridge(bridge).wormhole();
        console.log("wormhole:", wh);
        console.log("messageFee:", IWormhole(wh).messageFee());
    }
}
