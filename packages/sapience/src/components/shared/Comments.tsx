'use client';

import { blo } from 'blo';
import Image from 'next/image';
import { AddressDisplay } from './AddressDisplay';

interface Comment {
  id: string;
  address: string;
  content: string;
  timestamp: string;
  prediction?: string;
  question: string; // Added question field
}

interface CommentsProps {
  className?: string;
  question?: string;
  showAllForecasts?: boolean;
}

const Comments = ({ 
  className, 
  question = "Will ETH reach $5,000 by the end of 2025?", 
  showAllForecasts = false 
}: CommentsProps) => {
  // Helper function to get badge styling based on prediction percentage
  const getPredictionBadgeStyle = (prediction: string) => {
    // Extract percentage from prediction string
    const percentageMatch = prediction.match(/(\d+)%/);
    if (!percentageMatch) {
      // Plain styling if no percentage found
      return 'bg-gray-100 text-gray-700 border-gray-300';
    }
    
    const percentage = parseInt(percentageMatch[1], 10);
    
    if (percentage > 50) {
      return 'bg-green-100 text-green-700 border-green-300';
    } else if (percentage < 50) {
      return 'bg-red-100 text-red-700 border-red-300';
    } else {
      // Plain styling for exactly 50%
      return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // Mock data with multiple questions
  const allComments: Comment[] = [
    {
      id: '1',
      address: '0x742d35Cc6e1590b7c89C4f8B6C8e0DB66C72Ca2D',
      content: 'ETH has strong fundamentals with the upcoming ETF approvals and institutional adoption. The $5K target seems achievable given current DeFi growth and staking yields. Bullish on this timeline.',
      timestamp: '30 minutes ago',
      prediction: '84% Chance',
      question: "Will ETH reach $5,000 by the end of 2025?"
    },
    {
      id: '4',
      address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      content: 'Looking at current AI leaders like NVIDIA (~$1.8T) and potential of companies like OpenAI going public, $5T is ambitious but possible. The AI race is accelerating exponentially.',
      timestamp: '1 hour ago',
      prediction: '76% Chance',
      question: "Will any AI company reach a $5T market cap by 2025?"
    },
    {
      id: '5',
      address: '0xa0b86a33e6329ec8ae87e5e53b4f99e7c0d2e5c3',
      content: 'Renewable capacity additions are breaking records. Solar/wind costs have plummeted and storage tech is improving rapidly. The 50% threshold is within reach given current trajectory.',
      timestamp: '3 hours ago',
      prediction: '88% Chance',
      question: "Will global renewable energy exceed 50% by 2026?"
    },
    // Additional comments for when showing single question
    {
      id: '2',
      address: '0x8ba1f109551bd432803012645hac136c08ce5fff',
      content: 'Not sure about this one. The volatility has been crazy lately and I think we might see a correction soon.',
      timestamp: '2 hours ago',
      prediction: '23% Chance',
      question: "Will ETH reach $5,000 by the end of 2025?"
    },
    {
      id: '3',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      content: 'Just placed a large wager on YES. The fundamentals look strong and I expect this to resolve positively.',
      timestamp: '6 hours ago',
      prediction: '92% Chance',
      question: "Will ETH reach $5,000 by the end of 2025?"
    }
  ];

  // Filter comments based on toggle state
  const displayComments = showAllForecasts 
    ? allComments.slice(0, 3) // Show first 3 comments (one per unique question)
    : allComments.filter(comment => comment.question === question);

  return (
    <div className={`${className || ''}`}>
      {displayComments.map((comment, index) => (
        <div key={comment.id} className="relative">
          {/* Divider */}
          {index > 0 && <div className="border-t border-border" />}
          
          <div className="relative bg-background">
            <div className="px-6 py-5 space-y-4">
              
              {/* Question and Prediction */}
              <div className="space-y-2">
                <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
                  {comment.question}
                </h2>
                
                {/* Prediction and Signature on same line */}
                <div className="flex items-center gap-4">
                  {comment.prediction && (
                    <span className={`
                      inline-flex items-center h-6 px-2.5 text-xs font-medium tracking-[0.01em]
                      rounded-md border
                      ${getPredictionBadgeStyle(comment.prediction)}
                    `}>
                      {comment.prediction}
                    </span>
                  )}
                  
                  {/* Signature */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Image
                        alt={comment.address}
                        src={blo(comment.address as `0x${string}`)}
                        className="w-5 h-5 rounded-full ring-1 ring-border/50"
                        width={20}
                        height={20}
                      />
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/80 font-medium">
                      <AddressDisplay
                        address={comment.address}
                        disableProfileLink={false}
                        className="text-xs"
                      />
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground/70">{comment.timestamp}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Comment content */}
              <div className="text-base leading-[1.5] text-foreground/90 tracking-[-0.005em]">
                {comment.content}
              </div>
              
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Comments; 