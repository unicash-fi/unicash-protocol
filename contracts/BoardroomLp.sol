// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;
//pragma experimental ABIEncoderV2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import './lib/Safe112.sol';
import './owner/Operator.sol';
import './utils/ContractGuard.sol';
import './interfaces/IBasisAsset.sol';

interface ITreasury {
    function sendCash(uint256 amount) external;
}

contract ShareWrapper {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public share;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function stake(uint256 amount) public virtual {
        _totalSupply = _totalSupply.add(amount);
        _balances[msg.sender] = _balances[msg.sender].add(amount);
        share.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public virtual {
        uint256 directorShare = _balances[msg.sender];
        require(
            directorShare >= amount,
            'Boardroom: withdraw request greater than staked amount'
        );
        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = directorShare.sub(amount);
        share.safeTransfer(msg.sender, amount);
    }
}

contract BoardroomLp is ShareWrapper, ContractGuard, Operator {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;
    using Safe112 for uint112;

    struct BoardSnapshot {
        uint256 time;
        uint256 rewardReceived;
        uint256 currentRewardPerToken;
        uint256 rewardRate;
        uint256 acumulatedRewardPerToken;
    }

    struct Boardseat {
        uint256 acumulatedReward;
        uint256 lastEpoch;
        // virtual rewards of current epoch
        uint256 currentRewards;
        uint256 rewardRate;
        uint256 currentRewardPerToken;
    }

    /* ========== STATE VARIABLES ========== */

    IERC20 private cash;

    uint256 public startTime;

    uint256 public lastUpdateTime;

    // uint public lastEpoch;
    uint256 public toTreasury;

    // global virtual rpt
    uint256 public rewardPerTokenStored;

    mapping(address => Boardseat) public directors;
    BoardSnapshot[] public boardHistory;

    constructor(
        IERC20 _cash,
        IERC20 _share,
        uint256 _startTime
    ) public {
        cash = _cash;
        share = _share;
        startTime = _startTime;

        BoardSnapshot memory genesisSnapshot =
            BoardSnapshot({
                time: _startTime,
                rewardReceived: 0,
                currentRewardPerToken: 0,
                rewardRate: 0,
                acumulatedRewardPerToken: 0
            });
        boardHistory.push(genesisSnapshot);
    }

    /* ========== Modifiers =============== */
    modifier directorExists {
        require(
            balanceOf(msg.sender) > 0,
            'Boardroom: The director does not exist'
        );
        _;
    }

    modifier updateReward(address director) {
        uint256 userLastEpoch = directors[director].lastEpoch;
        uint256 currentEpoch = latestSnapshotIndex();
        BoardSnapshot memory userLastSnapShot = boardHistory[userLastEpoch];
        BoardSnapshot memory lastSnapShot = boardHistory[currentEpoch];
        Boardseat memory seat = directors[director];

        if (now > startTime) {
            // just care your own data
            if (lastUpdateTime == 0) {
                // first time
                lastUpdateTime = lastSnapShot.time;
            }

            rewardPerTokenStored = currentRewardPerToken(now, lastUpdateTime);
            uint legacyRewards = seat.currentRewards;
            if (userLastEpoch == currentEpoch) {
                // same epoch, update virtual rewards
                seat.currentRewards = earnedInternal(
                    director,
                    seat.currentRewards,
                    rewardPerTokenStored,
                    seat.currentRewardPerToken
                );
            } else {
                // calc real rewards
                BoardSnapshot memory userNextSnapShot =
                    boardHistory[userLastEpoch + 1];
                uint256 epochEarned =
                    earnedInternal(
                        director,
                        seat
                            .currentRewards,
                        userNextSnapShot
                            .currentRewardPerToken,
                        seat
                            .currentRewardPerToken
                    )
                        .mul(userNextSnapShot.rewardRate)
                        .div(1e18);
                seat.acumulatedReward = seat.acumulatedReward.add(epochEarned);

                if (seat.lastEpoch + 1 < currentEpoch) {
                    uint256 spanRewardPerToken =
                        lastSnapShot.acumulatedRewardPerToken.sub(
                            userNextSnapShot.acumulatedRewardPerToken
                        );
                    seat.acumulatedReward = seat.acumulatedReward.add(
                        balanceOf(director).mul(spanRewardPerToken).div(1e18)
                    );
                }

                seat.currentRewards = earnedInternal(
                    director,
                    0,
                    rewardPerTokenStored,
                    0
                );
            }
            toTreasury = toTreasury.add(seat.currentRewards).sub(legacyRewards);
            seat.currentRewards = 0;
            lastUpdateTime = now;
            seat.currentRewardPerToken = rewardPerTokenStored;
            seat.lastEpoch = currentEpoch;

            directors[director] = seat;
        }

        _;
    }

    function currentRewardPerToken(uint256 later, uint256 ahead)
        public
        view
        returns (uint256)
    {
        if (totalSupply() == 0) {
            // global virtual rpt
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                later.sub(ahead).mul(1e18).mul(1e18).div(totalSupply())
            );
    }

    function earnedInternal(
        address account,
        uint256 base,
        uint256 newRewardPerToken,
        uint256 oldRewardPerToken
    ) internal view returns (uint256) {
        return
            balanceOf(account)
                .mul(newRewardPerToken.sub(oldRewardPerToken))
                .div(1e18)
                .add(base);
    }

    function earned(address account) public view returns (uint256) {
        uint256 userLastEpoch = directors[account].lastEpoch;
        uint256 currentEpoch = latestSnapshotIndex();
        Boardseat memory seat = directors[account];

        BoardSnapshot memory lastSnapShot = boardHistory[currentEpoch];

        if (userLastEpoch == currentEpoch) {
            // directors[account].acumulatedReward has been updated in the last operation
            return directors[account].acumulatedReward;
        } else {
            BoardSnapshot memory userNextSnapShot =
                boardHistory[userLastEpoch + 1];
            uint256 epochEarned =
                earnedInternal(
                    account,
                    seat
                        .currentRewards,
                    userNextSnapShot
                        .currentRewardPerToken,
                    seat
                        .currentRewardPerToken
                )
                    .mul(userNextSnapShot.rewardRate)
                    .div(1e18);
            seat.acumulatedReward = seat.acumulatedReward.add(epochEarned);

            if (seat.lastEpoch + 1 < currentEpoch) {
                uint256 spanRewardPerToken =
                    lastSnapShot.acumulatedRewardPerToken.sub(
                        userNextSnapShot.acumulatedRewardPerToken
                    );
                seat.acumulatedReward = seat.acumulatedReward.add(
                    balanceOf(account).mul(spanRewardPerToken).div(1e18)
                );
            }
            return seat.acumulatedReward;
        }
    }

    function latestSnapshotIndex() public view returns (uint256) {
        return boardHistory.length.sub(1);
    }

    function getLatestSnapshot() internal view returns (BoardSnapshot memory) {
        return boardHistory[latestSnapshotIndex()];
    }

    function allocateSeigniorage(uint256 amount)
        external
        onlyOneBlock
        onlyOperator
    {
        require(amount > 0, 'Boardroom: Cannot allocate 0');
        require(
            totalSupply() > 0,
            'Boardroom: Cannot allocate when totalSupply is 0'
        );

        BoardSnapshot memory lastSnapShot = getLatestSnapshot();

        uint256 deltaTime = now - lastSnapShot.time;
        // real rewardRate
        uint256 rewardRate = amount.div(deltaTime);

        if (lastUpdateTime > lastSnapShot.time) {
            rewardPerTokenStored = currentRewardPerToken(now, lastUpdateTime);
        } else {
            rewardPerTokenStored = currentRewardPerToken(
                now,
                lastSnapShot.time
            );
        }

        uint256 acumulatedRewardPerToken =
            lastSnapShot.acumulatedRewardPerToken.add(
                rewardPerTokenStored.mul(rewardRate).div(1e18)
            );

        BoardSnapshot memory newSnapshot =
            BoardSnapshot({
                time: block.timestamp,
                rewardReceived: amount,
                currentRewardPerToken: rewardPerTokenStored,
                rewardRate: rewardRate,
                acumulatedRewardPerToken: acumulatedRewardPerToken
            });

        // reset global rpt
        rewardPerTokenStored = 0;
        lastUpdateTime = now;
        boardHistory.push(newSnapshot);
        cash.safeTransferFrom(msg.sender, address(this), amount);
        uint256 sendBack = toTreasury.mul(rewardRate).div(1e18);
        IERC20(cash).safeApprove(msg.sender, sendBack);
        ITreasury(msg.sender).sendCash(sendBack);

        toTreasury = 0;
    }

    function stake(uint256 amount)
        public
        override
        onlyOneBlock
        updateReward(msg.sender)
    {
        require(amount > 0, 'Boardroom: Cannot stake 0');
        super.stake(amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount)
        public
        override
        onlyOneBlock
        directorExists
        updateReward(msg.sender)
    {
        require(amount > 0, 'Boardroom: Cannot withdraw 0');
        super.withdraw(amount);
        emit Withdrawn(msg.sender, amount);
    }

    function exit() external {
        withdraw(balanceOf(msg.sender));
        claimReward();
    }

    function claimReward() public updateReward(msg.sender) {
        uint256 reward = directors[msg.sender].acumulatedReward;
        if (reward > 0) {
            directors[msg.sender].acumulatedReward = 0;
            cash.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(address indexed user, uint256 reward);
}
