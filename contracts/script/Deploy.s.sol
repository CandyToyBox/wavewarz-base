// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/WaveWarzBase.sol";

contract DeployWaveWarzBase is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        WaveWarzBase waveWarz = new WaveWarzBase();

        console.log("WaveWarzBase deployed to:", address(waveWarz));

        vm.stopBroadcast();
    }
}

contract VerifyDeployment is Script {
    function run() external view {
        address contractAddress = vm.envAddress("WAVEWARZ_CONTRACT_ADDRESS");

        WaveWarzBase waveWarz = WaveWarzBase(payable(contractAddress));

        // Verify fee constants
        require(waveWarz.ARTIST_FEE_BPS() == 100, "Invalid artist fee");
        require(waveWarz.PLATFORM_FEE_BPS() == 50, "Invalid platform fee");
        require(waveWarz.WINNER_TRADER_BPS() == 4000, "Invalid winner trader BPS");
        require(waveWarz.LOSER_TRADER_BPS() == 5000, "Invalid loser trader BPS");
        require(waveWarz.WINNER_ARTIST_BPS() == 500, "Invalid winner artist BPS");
        require(waveWarz.LOSER_ARTIST_BPS() == 200, "Invalid loser artist BPS");
        require(waveWarz.PLATFORM_SETTLE_BPS() == 300, "Invalid platform settle BPS");

        console.log("All fee constants verified successfully!");
        console.log("Contract is ready for use.");
    }
}
