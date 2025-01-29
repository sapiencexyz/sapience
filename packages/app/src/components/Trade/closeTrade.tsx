// import { debounce } from 'lodash';
// import { HelpCircle, AlertTriangle, Loader2 } from 'lucide-react';
// import { useState, useEffect, useContext, useMemo } from 'react';
// import { useForm } from 'react-hook-form';
// import type { AbiFunction } from 'viem';
// import { decodeEventLog, formatUnits, parseUnits, zeroAddress } from 'viem';
// import {
//     useWaitForTransactionReceipt,
//     useWriteContract,
//     useAccount,
//     useReadContract,
//     useSimulateContract,
//     useChainId,
//     useSwitchChain,
//     usePublicClient,
// } from 'wagmi';

// import { useConnectWallet } from '../../lib/context/ConnectWalletProvider';
// import erc20ABI from '../../lib/erc20abi.json';
// import { Button } from '~/components/ui/button';
// import { Form } from '~/components/ui/form';
// import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
// import {
//     Tooltip,
//     TooltipContent,
//     TooltipProvider,
//     TooltipTrigger,
// } from '~/components/ui/tooltip';
// import { useToast } from '~/hooks/use-toast';
// import {
//     HIGH_PRICE_IMPACT,
//     MIN_BIG_INT_SIZE,
//     TOKEN_DECIMALS,
// } from '~/lib/constants/constants';
// import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
// import { MarketContext } from '~/lib/context/MarketProvider';
// import type { FoilPosition } from '~/lib/interfaces/interfaces';
// import { removeLeadingZeros } from '~/lib/util/util';

// import NumberDisplay from '../numberDisplay';
// import PositionSelector from '../positionSelector';
// import SizeInput from '../sizeInput';
// import SlippageTolerance from '../slippageTolerance';


// export default function AddEditTrade() {

//     const { nftId, refreshPositions, setNftId } = useAddEditPosition();

//     // form states
//     const [sizeChange, setSizeChange] = useState<bigint>(BigInt(0));
//     const [option, setOption] = useState<'Long' | 'Short'>('Long');
//     const currentChainId = useChainId();
//     const { switchChain } = useSwitchChain();
//     const { setIsOpen } = useConnectWallet();

//     // component states
//     const [pendingTxn, setPendingTxn] = useState(false);
//     const [quoteError, setQuoteError] = useState<string | null>(null);
//     const [walletBalance, setWalletBalance] = useState<string>('0');
//     const [quotedResultingWalletBalance, setQuotedResultingWalletBalance] =
//         useState<string>('0');
//     const [walletBalanceLimit, setWalletBalanceLimit] = useState<bigint>(
//         BigInt(0)
//     );
//     const [positionCollateralLimit, setPositionCollateralLimit] =
//         useState<bigint>(BigInt(0));
//     const [resultingPositionCollateral, setResultingPositionCollateral] =
//         useState<bigint>(BigInt(0));
//     const [txnStep, setTxnStep] = useState(0);
//     const [collateralInput, setCollateralInput] = useState<bigint>(BigInt(0));

//     const account = useAccount();
//     const { isConnected, address } = account;
//     const isEdit = !!nftId;

//     const {
//         address: marketAddress,
//         collateralAsset,
//         collateralAssetTicker,
//         collateralAssetDecimals,
//         epoch,
//         foilData,
//         chainId,
//         pool,
//         liquidity,
//         refetchUniswapData,
//     } = useContext(MarketContext);

//     if (!epoch) {
//         throw new Error('Epoch is not defined');
//     }
//     const requireApproval: boolean = useMemo(() => {
//         return !allowance || collateralDeltaLimit > (allowance as bigint);
//       }, [allowance, collateralDeltaLimit]);


//     const { data: positionData, refetch: refetchPositionData } = useReadContract({
//         abi: foilData.abi,
//         address: marketAddress as `0x${string}`,
//         functionName: 'getPosition',
//         args: [nftId],
//         query: {
//             enabled: isEdit,
//         },
//     }) as { data: FoilPosition; refetch: any; isRefetching: boolean };



//     const quoteClosePositionResult = useSimulateContract({
//         abi: foilData.abi,
//         address: marketAddress as `0x${string}`,
//         functionName: 'quoteModifyTraderPosition',
//         args: [nftId, BigInt(0)],
//         chainId,
//         account: address || zeroAddress,
//         query: {
//             enabled: isEdit && !!positionData,
//             refetchOnMount: true,
//         },
//     });


//   const { data: approveHash, writeContract: approveWrite } = useWriteContract({
//     mutation: {
//       onError: (error) => {
//         toast({
//           variant: 'destructive',
//           title: 'Approval Failed',
//           description: `Failed to approve: ${(error as Error).message}`,
//         });
//         setPendingTxn(false);
//       },
//       onSuccess: () => {
//         toast({
//           title: 'Approval Submitted',
//           description: 'Waiting for confirmation...',
//         });
//       },
//     },
//   });

//     const closePositionPriceImpact: number = useMemo(() => {
//         if (!pool?.token0Price || !positionData) return 0;
        
//         if(positionData.vGasAmount === BigInt(0) && positionData.borrowedVGas === BigInt(0)) {
//           return 0;
//         }
//         const closeQuote = quoteClosePositionResult.data?.result;
//         if (!closeQuote) return 0;
        
//         const [, , fillPrice] = closeQuote;
//         const referencePrice = parseFloat(pool.token0Price.toSignificant(18));
//         const impact = Math.abs((Number(fillPrice) / 1e18 / referencePrice - 1) * 100);
//         console.log('Close position price impact:', impact);
//         return impact;
//       }, [pool, positionData, quoteClosePositionResult.data]);

//       const onSubmit = async (values: any) => {
//     if (!isConnected) {
//       return;
//     }

//     setPendingTxn(true);

//     if (requireApproval) {
//       approveWrite({
//         abi: erc20ABI as AbiFunction[],
//         address: collateralAsset as `0x${string}`,
//         functionName: 'approve',
//         args: [marketAddress, collateralDeltaLimit],
//       });
//       setTxnStep(1);
//     } else if (isEdit) {
//       const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
//       // Handle close button case
//       const callSizeInContractUnit = values.isClosePosition
//         ? BigInt(0)
//         : desiredSizeInContractUnit;
//       const callCollateralDeltaLimit = values.isClosePosition
//         ? BigInt(0)
//         : collateralDeltaLimit;
//       writeContract({
//         abi: foilData.abi,
//         address: marketAddress as `0x${string}`,
//         functionName: 'modifyTraderPosition',
//         args: [
//           nftId,
//           callSizeInContractUnit,
//           callCollateralDeltaLimit,
//           deadline,
//         ],
//       });
//       setTxnStep(2);
//     } else {
//       const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
//       writeContract({
//         abi: foilData.abi,
//         address: marketAddress as `0x${string}`,
//         functionName: 'createTraderPosition',
//         args: [
//           epoch,
//           desiredSizeInContractUnit,
//           collateralDeltaLimit,
//           deadline,
//         ],
//       });
//       setTxnStep(2);
//     }
//   };

//   const onSubmit = async (values: any) => {
//     if (!isConnected) {
//       return;
//     }

//     setPendingTxn(true);

//     if (requireApproval) {
//       approveWrite({
//         abi: erc20ABI as AbiFunction[],
//         address: collateralAsset as `0x${string}`,
//         functionName: 'approve',
//         args: [marketAddress, collateralDeltaLimit],
//       });
//       setTxnStep(1);
//     } else if (isEdit) {
//       const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
//       // Handle close button case
//       const callSizeInContractUnit = BigInt(0)
//       const callCollateralDeltaLimit = BigInt(0)
//       writeContract({
//         abi: foilData.abi,
//         address: marketAddress as `0x${string}`,
//         functionName: 'modifyTraderPosition',
//         args: [
//           nftId,
//           callSizeInContractUnit,
//           callCollateralDeltaLimit,
//           deadline,
//         ],
//       });
//       setTxnStep(2);
//     } else {
//       const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
//       writeContract({
//         abi: foilData.abi,
//         address: marketAddress as `0x${string}`,
//         functionName: 'createTraderPosition',
//         args: [
//           epoch,
//           desiredSizeInContractUnit,
//           collateralDeltaLimit,
//           deadline,
//         ],
//       });
//       setTxnStep(2);
//     }
//   };


//     const renderCloseButton = () => {
//         if (!isEdit || !isConnected || currentChainId !== chainId) return null;
    
//         const positionHasBalance = positionData && (
//           positionData.vGasAmount > BigInt(0) || 
//           positionData.borrowedVGas > BigInt(0)
//         );
//         if (!positionHasBalance) return null;
        
//         const isFetchingQuote = quoteClosePositionResult.isFetching;
//         const isLoading =
//           pendingTxn ||
//           fetchingSizeFromCollateralInput ||
//           isLoadingCollateralChange ||
//           (isNonZeroSizeChange && isFetchingQuote);
    
//         let buttonTxt = 'Close Position';
    
//         if (requireApproval) {
//           buttonTxt = `Approve ${collateralAssetTicker} Transfer To Close Position`;
//         }
    
//         if (isFetchingQuote && !formError) return null;
//         if (fetchingSizeFromCollateralInput) return null;
    
//         return (
//           <div className="mb-4 text-center -mt-2">
//             <button
//               onClick={() => setValue('isClosePosition', true)}
//               className="text-sm underline hover:opacity-80 disabled:opacity-50"
//               type="submit"
//               disabled={!!formError || isLoading}
//             >
//               {buttonTxt}
//             </button>
//             {renderPriceImpactWarningForClose()}
//           </div>
//         );
//       };

//       const renderPriceImpactWarningForClose = () => {
//         if (closePositionPriceImpact === 0) return null;
//         return (
//           <div className="flex justify-center mt-1">
//             <TooltipProvider>
//               <Tooltip>
//                 <TooltipTrigger>
//                   <div className={`flex items-center ${closePositionPriceImpact > HIGH_PRICE_IMPACT ? 'text-red-500' : 'text-yellow-500'}`}>
//                     <AlertTriangle className="w-5 h-5 mr-1" />
//                     <span className="text-sm font-medium">
//                       {Number(closePositionPriceImpact.toFixed(2))}% Price Impact
//                     </span>
//                   </div>
//                 </TooltipTrigger>
//                 <TooltipContent>
//                   <p className="text-sm font-medium">
//                     Closing this position will have a {Number(closePositionPriceImpact.toFixed(2))}% price impact
//                   </p>
//                 </TooltipContent>
//               </Tooltip>
//             </TooltipProvider>
//           </div>
//         );

// }