import { useCallback } from 'react'
import { useWallet } from 'use-wallet'
import { provider } from 'web3-core'
import { Contract } from 'web3-eth-contract'
import { approve, getCxSwapContract } from '../bao/utils'
import useBao from './useBao'

const useApproveCx = (
  tokenContract: Contract,
): { onApprove: () => Promise<string | null> } => {
  const { account }: { account: string; ethereum: provider } = useWallet()
  const bao = useBao()
  const cxswapContract = getCxSwapContract(bao)

  const handleApprove = useCallback(async () => {
    try {
      const tx = await approve(tokenContract, cxswapContract, account)
      return tx
    } catch (e) {
      return null
    }
  }, [account, tokenContract, cxswapContract])

  return { onApprove: handleApprove }
}

export default useApproveCx
