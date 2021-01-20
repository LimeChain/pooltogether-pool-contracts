const { deployContract } = require('ethereum-waffle')
const { deployMockContract } = require('./helpers/deployMockContract')
const BarnPrizePoolHarness = require('../build/BarnPrizePoolHarness.json')
const TokenListenerInterface = require('../build/TokenListenerInterface.json')
const ControlledToken = require('../build/ControlledToken.json')
const BarnFacetMock = require('../build/BarnFacetMock.json')
const BarnRewardsMock = require('../build/BarnRewardsMock.json')
const BarnBridgeToken = require('../build/BarnBridgeToken.json')

const { ethers } = require('ethers')
const { expect } = require('chai')
const buidler = require('@nomiclabs/buidler')

const toWei = ethers.utils.parseEther

const debug = require('debug')('ptv3:yVaultPrizePool.test')

let overrides = { gasLimit: 20000000 }

describe('BarnPrizePool', function () {
  let wallet, wallet2

  let prizePool, bondToken, barn, rewards, prizeStrategy, comptroller

  let poolMaxExitFee = toWei('0.5')
  let poolMaxTimelockDuration = 10000

  let ticket

  let initializeTxPromise

  beforeEach(async () => {
    [wallet, wallet2] = await buidler.ethers.getSigners()
    debug(`using wallet ${wallet._address}`)

    debug('creating token...')
    bondToken = await deployContract(wallet, BarnBridgeToken, [], overrides)

    debug('creating barn...')
    barn = await deployContract(wallet, BarnFacetMock, [], overrides)

    debug('creating rewards...')
    rewards = await deployContract(wallet, BarnRewardsMock, [bondToken.address, barn.address], overrides)

    debug('init Barn...')
    await barn.initBarn(bondToken.address, rewards.address)

    prizeStrategy = await deployMockContract(wallet, TokenListenerInterface.abi, overrides)

    await prizeStrategy.mock.supportsInterface.returns(true)
    await prizeStrategy.mock.supportsInterface.withArgs('0xffffffff').returns(false)


    comptroller = await deployMockContract(wallet, TokenListenerInterface.abi, overrides)

    debug('deploying BarnPrizePoolHarness...')
    prizePool = await deployContract(wallet, BarnPrizePoolHarness, [], overrides)

    ticket = await deployMockContract(wallet, ControlledToken.abi, overrides)
    await ticket.mock.controller.returns(prizePool.address)

    initializeTxPromise = prizePool['initialize(address,address[],uint256,uint256,address,address,address)'](
      comptroller.address,
      [ticket.address],
      poolMaxExitFee,
      poolMaxTimelockDuration,
      barn.address,
      rewards.address,
      bondToken.address
    )

    await initializeTxPromise

    await prizePool.setPrizeStrategy(prizeStrategy.address)
  })

  describe('initialize()', () => {
    it('should initialize the BarnPrizePool', async () => {
      await expect(initializeTxPromise)
        .to.emit(prizePool, 'BarnPrizePoolInitialized')
        .withArgs(
          barn.address
        )

      expect(await prizePool.barn()).to.equal(barn.address)
    })
  })

  describe('_supply()', () => {
    it('should supply funds to barn', async () => {
      let amount = toWei('500')
      await bondToken.mint(prizePool.address, amount)
      await prizePool.supply(amount)
      expect(await bondToken.balanceOf(barn.address)).to.equal(amount)
    })
  })

  describe('_balance()', () => {
    it('should return zero when no supply or redeem have been performed', async () => {
      expect(await prizePool.callStatic.balance()).to.equal(toWei('0'))
    })


    it('should return the balance underlying assets held by the Yield Service', async () => {
      let amount = toWei('200')

      await bondToken.mint(prizePool.address, amount)
      await bondToken.mint(rewards.address, amount)
      await prizePool.supply(amount)

      let owed = await rewards.owed(prizePool.address);

      expect(await prizePool.callStatic.balance()).to.equal(amount.add(owed))
    })
  })

  describe('_redeem()', () => {

    it('should revert if there is not enough liquidity in the pool', async () => {
      let amount = toWei('300')
      await bondToken.mint(prizePool.address, amount)
      await prizePool.supply(amount)

      await expect(prizePool.redeem(toWei('301'))).to.be.revertedWith("BarnPrizePool/insuff-liquidity")
    })

    it('should redeem and deposit the $bond difference back to barn', async () => {
      let amount = toWei('500')
      await bondToken.mint(prizePool.address, amount)
      await bondToken.mint(rewards.address, amount)
      await prizePool.supply(toWei('300'))

      expect(await bondToken.balanceOf(prizePool.address)).to.equal(toWei('200'))
      expect(await bondToken.balanceOf(barn.address)).to.equal(toWei('300'))

      let owed = await rewards.owed(prizePool.address);
      let amountToRedeem = toWei('100');
      let currentPoolBalance = await bondToken.balanceOf(prizePool.address);
      let currentBarnBalance = await bondToken.balanceOf(barn.address);
      let expectedBarnBalance = currentPoolBalance.add(owed).add(currentBarnBalance).sub(amountToRedeem)

      await prizePool.redeem(amountToRedeem)

      // only the amount to be redeemed should remain in the pool
      expect(await bondToken.balanceOf(prizePool.address)).to.equal(amountToRedeem)

      // the remaining $bond after the claim should be deposited back to Barn
      expect(await bondToken.balanceOf(barn.address)).to.equal(expectedBarnBalance)

    })

    it('should redeem and withdraw from barn if $bond is not enough', async () => {
      let amount = toWei('600')
      await bondToken.mint(prizePool.address, amount)
      await bondToken.mint(rewards.address, amount)
      await prizePool.supply(toWei('400'))

      expect(await bondToken.balanceOf(prizePool.address)).to.equal(toWei('200'))
      expect(await bondToken.balanceOf(barn.address)).to.equal(toWei('400'))

      let owed = await rewards.owed(prizePool.address);
      let amountToRedeem = toWei('750');
      let currentPoolBalance = await bondToken.balanceOf(prizePool.address);
      let currentBarnBalance = await bondToken.balanceOf(barn.address);
      let amountToWithdrawFromBarn = amountToRedeem.sub(currentPoolBalance).sub(owed)
      let expectedBarnBalance = currentBarnBalance.sub(amountToWithdrawFromBarn);

      await prizePool.redeem(amountToRedeem)

      // only the amount to be redeemed should remain in the pool
      expect(await bondToken.balanceOf(prizePool.address)).to.equal(amountToRedeem)

      // the insufficient $bond should be withdawn from barn
      expect(await bondToken.balanceOf(barn.address)).to.equal(expectedBarnBalance)

    })

  })

  describe('_token()', () => {
    it('should return the underlying token', async () => {
      expect(await prizePool.token()).to.equal(bondToken.address)
    })
  })

  describe('depositTo()', () => {
    it('should deposit funds to the prize pool', async () => {
      let amount = toWei('100')
      await bondToken.mint(wallet._address, amount)
      await bondToken.approve(prizePool.address, amount)
      await prizePool.depositTo(wallet._address, amount, ticket.address, wallet._address)

      // The prize pool should have 0 $bond balance as the tokens are directly sent to barn
      expect(await bondToken.balanceOf(prizePool.address)).to.equal(toWei('0'))
      // The $bond balance in barn should be equal to the amount deposited in the prize pool
      expect(await bondToken.balanceOf(barn.address)).to.equal(amount)
    })
  })
})
