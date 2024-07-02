// import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IFoil} from "../interfaces/IFoil.sol";

contract FoilVault /* is ERC4626 */ {
    IFoil public Foil;

    constructor(address market) {
        Foil = IFoil(market);
    }

    function setMarket(address market) external {
        // Permissioned
        // Update the address of the market it should roll into

    }

    // Function to roll to next epoch, maybe there's a callback function that the contract can call?
    function roll() external {
        // Permissioned callback function
        // Checks the current market address
        // Call the roll function on the market contract
    }
}