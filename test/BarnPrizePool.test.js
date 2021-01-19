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
    it('should supply funds from the user', async () => {
      let amount = toWei('500')
      await bondToken.mint(prizePool.address, amount)
      await prizePool.supply(amount)
      expect(await bondToken.balanceOf(barn.address)).to.equal(amount)
    })
  })

  describe('balance()', () => {
    it('should return zero when nothing', async () => {
      expect(await prizePool.callStatic.balance()).to.equal(toWei('0'))
    })
    

    it('should return the balance underlying assets held by the Yield Service', async () => {
      let amount = toWei('200')

      await bondToken.mint(prizePool.address, amount)
      await bondToken.mint(rewards.address, amount)

      await prizePool.supply(amount)

      expect(await prizePool.callStatic.balance()).to.equal(amount)
    })
  })

  describe('_redeem()', () => {

    it('should revert if there is not enough liquidity', async () => {
      let amount = toWei('300')
      await bondToken.mint(prizePool.address, amount)
      await prizePool.supply(amount)

      await expect(prizePool.redeem(toWei('301'))).to.be.revertedWith("BarnPrizePool/insuff-liquidity")
    })

    it('should allow a user to withdraw', async () => {
      let amount = toWei('500')
      await bondToken.mint(prizePool.address, amount)
      await bondToken.mint(rewards.address, amount)
      await prizePool.supply(toWei('300'))

      expect(await bondToken.balanceOf(prizePool.address)).to.equal(toWei('200'))
      expect(await bondToken.balanceOf(barn.address)).to.equal(toWei('300'))

      // redeem called when there is enough $BOND, rewards.claim() will not be called
      await prizePool.redeem(toWei('100'))
      expect(await bondToken.balanceOf(prizePool.address)).to.equal(toWei('200'))

      let owed = await rewards.owed(prizePool.address)
      let currentPoolBalance = await bondToken.balanceOf(prizePool.address)
      let expectedBalance = currentPoolBalance.add(owed)

      // redeem called when there is not enough $BOND, rewards.claim() should be called
      // and accrued amount also will be pulled
      await prizePool.redeem(toWei('250'))
      expect(await bondToken.balanceOf(prizePool.address)).to.equal(expectedBalance)

    })

  })

  describe('_token()', () => {
    it('should return the underlying token', async () => {
      expect(await prizePool.token()).to.equal(bondToken.address)
    })
  })
})
