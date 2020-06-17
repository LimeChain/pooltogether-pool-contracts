pragma solidity ^0.6.4;

interface InterestTrackerInterface {
  function balanceOfCollateral(address user) external returns (uint256);
  function supplyCollateral(uint256 amount) external returns (uint256);
  function redeemCollateral(uint256 amount) external returns (uint256);
  function collateralValueOfShares(uint256 shares) external returns (uint256);
  function exchangeRateMantissa() external returns (uint256);
}