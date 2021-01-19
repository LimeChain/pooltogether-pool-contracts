pragma solidity >=0.6.0 <0.7.0;

interface BarnRewardsInterface {
    function claim(uint256 _amount) external;
    function owed(address _address) external view returns (uint256);
    function registerUserAction(address _user) external;
}