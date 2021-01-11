// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.7.0;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../../external/barnbridge/BarnInterface.sol";
import "../PrizePool.sol";

/// @title Prize Pool for Barn Bridge $BOND token
contract BarnPrizePool is PrizePool {
  using SafeMathUpgradeable for uint256;

  event BarnPrizePoolInitialized(address indexed barn);

  /// @notice Interface for the barn
  BarnInterface public barn;

  /// @notice Initializes the Prize Pool and Yield Service with the required contract connections
  /// @param _controlledTokens Array of addresses for the Ticket and Sponsorship Tokens controlled by the Prize Pool
  /// @param _maxExitFeeMantissa The maximum exit fee size, relative to the withdrawal amount
  /// @param _maxTimelockDuration The maximum length of time the withdraw timelock could be
  /// @param _barn Address of the barn
  function initialize (
    RegistryInterface _reserveRegistry,
    ControlledTokenInterface[] memory _controlledTokens,
    uint256 _maxExitFeeMantissa,
    uint256 _maxTimelockDuration,
    BarnInterface _barn
  )
    public
    initializer
  {
    PrizePool.initialize(
      _reserveRegistry,
      _controlledTokens,
      _maxExitFeeMantissa,
      _maxTimelockDuration
    );
    barn = _barn;

    emit BarnPrizePoolInitialized(address(barn));
  }

  /// @dev Gets the balance of the underlying assets held by the Yield Service
  /// @return The underlying balance of asset tokens
  function _balance() internal override returns (uint256) {
    uint256 balance = barn.balanceOf(address(this));
    return balance;
  }

  /// @dev Allows a user to supply asset tokens in exchange for yield-bearing tokens
  /// to be held in escrow by the Yield Service
  function _supply(uint256 amount) internal override {
    IERC20Upgradeable assetToken = _token();
    assetToken.approve(address(barn), amount);
    barn.depositAndLock(amount, maxTimelockDuration);
  }

  /// @dev The external token cannot be yDai or Dai
  /// @param _externalToken The address of the token to check
  /// @return True if the token may be awarded, false otherwise
  function _canAwardExternal(address _externalToken) internal override view returns (bool) {
    return _externalToken != address(barn) && _externalToken != address(barn.token());
  }

  /// @dev Allows a user to redeem yield-bearing tokens in exchange for the underlying
  /// asset tokens held in escrow by the Yield Service
  /// @param amount The amount of underlying tokens to be redeemed
  /// @return The actual amount of tokens transferred
  function _redeem(uint256 amount) internal override returns (uint256) {
    IERC20Upgradeable token = _token();

    require(_balance() >= amount, "BarnPrizePool/insuff-liquidity");

    uint256 preBalance = token.balanceOf(address(this));

    barn.withdraw(amount);

    uint256 postBalance = token.balanceOf(address(this));
    uint256 amountWithdrawn = postBalance.sub(preBalance);
    
    return amountWithdrawn;
  }

  /// @dev Gets the underlying asset token used by the Yield Service
  /// @return A reference to the interface of the underling asset token
  function _token() internal override view returns (IERC20Upgradeable) {
    return IERC20Upgradeable(barn.token());
  }
}
