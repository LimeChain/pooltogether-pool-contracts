pragma solidity >=0.6.0 <0.7.0;

import "../external/barnbridge/BarnInterface.sol";
import "./ERC20Mintable.sol";
import "@pooltogether/fixed-point/contracts/FixedPoint.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface IRewards {
    function registerUserAction(address user) external;
}

contract BarnBridgeToken is ERC20Upgradeable {
    uint256 private constant SUPPLY = 10000000 * 10**18;

    constructor() public {
        __ERC20_init("BarnBridge Governance Token", "BOND");
        _mint(msg.sender, SUPPLY);
    }
}

contract BarnFacetMock is BarnInterface {
    using SafeMath for uint256;

    uint256 public constant MAX_LOCK = 365 days;
    uint256 constant BASE_MULTIPLIER = 1e18;

    BarnBridgeToken private bond;
    IRewards public rewards;
    uint256 public bondStaked;
    mapping(address => uint256) private balances;
    mapping(address => uint256) private lockedBalances;

    event Deposit(address indexed user, uint256 amount, uint256 newBalance);
    event Withdraw(
        address indexed user,
        uint256 amountWithdrew,
        uint256 amountLeft
    );
    event Lock(address indexed user, uint256 timestamp);

    constructor(BarnBridgeToken _bond, address _rewards) public {
        bond = _bond;
        rewards = IRewards(_rewards);
    }

    function token() external view override returns (IERC20Upgradeable) {
        return bond;
    }

    function balance() public view returns (uint256) {
        return bond.balanceOf(address(this));
    }

    function removeLiquidity(uint256 _amount) external {
        bond.transfer(msg.sender, _amount);
    }

    function deposit(uint256 _amount) public override {
        address user = msg.sender;
        uint256 allowance = bond.allowance(msg.sender, address(this));

        require(_amount > 0, "Amount must be greater than 0");
        require(allowance >= _amount, "Token allowance too small");

        callRegisterUserAction(user);

        uint256 newBalance = balanceOf(user).add(_amount);
        _updateUserBalance(user, newBalance);

        bondStaked = bondStaked.add(_amount);
        bond.transferFrom(user, address(this), _amount);

        emit Deposit(msg.sender, _amount, newBalance);
    }

    function lock(uint256 timestamp) public {
        _lock(msg.sender, timestamp);
        emit Lock(msg.sender, timestamp);
    }

    function depositAndLock(uint256 amount, uint256 timestamp) public override {
        deposit(amount);
        lock(timestamp);
    }

    function _lock(address user, uint256 timestamp) internal {
        require(timestamp > block.timestamp, "Timestamp must be in the future");
        require(timestamp <= block.timestamp + MAX_LOCK, "Timestamp too big");
        require(balanceOf(user) > 0, "Sender has no balance");

        //require(timestamp > currentStake.expiryTimestamp, "New timestamp lower than current lock timestamp");

        _updateUserLock(user, timestamp);
    }

    function withdraw(uint256 amount) public override {
        address user = msg.sender;
        require(amount > 0, "Amount must be greater than 0");
        require(
            userLockedUntil(msg.sender) <= block.timestamp,
            "User balance is locked"
        );

        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        callRegisterUserAction(user);

        uint256 balanceAfterWithdrawal = balanceOf(msg.sender).sub(amount);
        _updateUserBalance(user, balanceAfterWithdrawal);

        bondStaked = bondStaked.sub(amount);
        bond.transfer(msg.sender, amount);

        emit Withdraw(msg.sender, amount, balanceAfterWithdrawal);
    }

    function callRegisterUserAction(address user) public {
        return rewards.registerUserAction(user);
    }

    function balanceOf(address user) public view override returns (uint256) {
        return balances[user];
    }

    function _updateUserBalance(address user, uint256 amount) internal {
        balances[user] = amount;
    }

    function _updateLockedBond(uint256 amount) internal {}

    function _updateUserLock(address user, uint256 timestamp) internal {
        lockedBalances[user] = timestamp;
    }

    function userLockedUntil(address user) public view returns (uint256) {
        return lockedBalances[user];
    }
}
