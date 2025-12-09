// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface ITokenBridge {
    function sendTestMessage(uint16 destinationChainId, uint256 value) external payable returns (uint64);
}

contract SendTestMessage is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address bridgeAddress = vm.envAddress("EVM_BRIDGE_ADDRESS");
        
        vm.startBroadcast(privateKey);
        
        uint64 sequence = ITokenBridge(bridgeAddress).sendTestMessage{value: 0}(56, 12345);
        console.log("Test message sent! Sequence:", sequence);
        
        vm.stopBroadcast();
    }
}
