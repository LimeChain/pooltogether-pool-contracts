pragma solidity >=0.6.0 <0.7.0;

interface BarnRewardsInterface {
    function claim(uint256 _amount) external;
    function userPendingReward(address _user) external view returns (uint256);
}